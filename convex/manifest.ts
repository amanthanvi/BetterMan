import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { MAX_MANIFEST_SECTIONS, validateManifestSections } from "./_releaseManifest";

const LEGACY_BATCH_SIZE = 100;
type Verification = NonNullable<Doc<"datasetReleases">["manifestVerification"]>;

export async function startLegacyManifestVerification(ctx: MutationCtx, release: Doc<"datasetReleases">): Promise<boolean> {
  if (release.pruning) throw new Error("RELEASE_PRUNING");
  if (release.manifestBasis === "declared") throw new Error("DECLARED_MANIFEST_EXPECTED");
  if (release.manifestVerification?.phase === "complete") return false;
  if (release.manifestVerification?.jobId) {
    const job = await ctx.db.system.get(release.manifestVerification.jobId);
    if (job && (job.state.kind === "pending" || job.state.kind === "inProgress")) return true;
  }
  let state = release.manifestVerification;
  if (!state) {
    const sections = await ctx.db.query("releaseSectionStats")
      .withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", release._id)).take(MAX_MANIFEST_SECTIONS + 1);
    validateManifestSections(release.pageCount, sections);
    state = {
      phase: "pages", cursor: null, pageCount: 0, aliasCount: 0, licenseCount: 0, expectedLicenseCount: 0,
      sections: sections.map(({ section, total }) => ({ section, total, uploaded: 0 })),
    };
  }
  const jobId = await ctx.scheduler.runAfter(0, internal.manifest.verifyLegacyBatch, { releaseId: release._id });
  await ctx.db.patch(release._id, { sealed: true, manifestVerification: { ...state, jobId } });
  return true;
}

async function scanLegacyBatch(ctx: MutationCtx, releaseId: Id<"datasetReleases">, state: Verification): Promise<void> {
  const options = { cursor: state.cursor, numItems: LEGACY_BATCH_SIZE };
  if (state.phase === "pages") {
    const batch = await ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId)).paginate(options);
    for (const page of batch.page) {
      const section = state.sections.find((section) => section.section === page.section);
      if (!section) throw new Error("LEGACY_UNDECLARED_SECTION");
      await ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId).eq("externalId", page.externalId)).unique();
      await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId).eq("name", page.name).eq("section", page.section)).unique();
      section.uploaded += 1;
      state.pageCount += 1;
      if (section.uploaded > section.total) throw new Error("LEGACY_PAGE_COUNT_MISMATCH");
    }
    state.phase = batch.isDone ? "aliases" : "pages";
    state.cursor = batch.isDone ? null : batch.continueCursor;
  } else if (state.phase === "aliases") {
    const batch = await ctx.db.query("manPageAliases").withIndex("by_releaseId_and_name", (q) => q.eq("releaseId", releaseId)).paginate(options);
    for (const alias of batch.page) {
      await ctx.db.query("manPageAliases").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId).eq("name", alias.name).eq("section", alias.section)).unique();
    }
    state.aliasCount += batch.page.length;
    state.phase = batch.isDone ? "packages" : "aliases";
    state.cursor = batch.isDone ? null : batch.continueCursor;
  } else if (state.phase === "packages") {
    const batch = await ctx.db.query("licensePackages").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId)).paginate(options);
    for (const pkg of batch.page) {
      await ctx.db.query("licensePackages").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId).eq("packageName", pkg.packageName)).unique();
      if (pkg.hasLicenseText) state.expectedLicenseCount += 1;
    }
    state.phase = batch.isDone ? "licenses" : "packages";
    state.cursor = batch.isDone ? null : batch.continueCursor;
  } else if (state.phase === "licenses") {
    const batch = await ctx.db.query("licenses").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId)).paginate(options);
    for (const license of batch.page) {
      await ctx.db.query("licenses").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId).eq("packageName", license.packageName)).unique();
      const declaration = await ctx.db.query("licensePackages").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId).eq("packageName", license.packageName)).unique();
      if (!declaration?.hasLicenseText) throw new Error("LEGACY_UNDECLARED_LICENSE");
    }
    state.licenseCount += batch.page.length;
    state.phase = batch.isDone ? "complete" : "licenses";
    state.cursor = batch.isDone ? null : batch.continueCursor;
  }
}

export const verifyLegacyBatch = internalMutation({
  args: { releaseId: v.id("datasetReleases") },
  returns: v.object({ status: v.union(v.literal("pending"), v.literal("unverified"), v.literal("failed"), v.literal("stopped")) }),
  handler: async (ctx, args) => {
    const release = await ctx.db.get(args.releaseId);
    if (!release || release.pruning || release.manifestBasis === "declared") return { status: "stopped" as const };
    if (!release.sealed || !release.manifestVerification) throw new Error("LEGACY_VERIFICATION_NOT_STARTED");
    const state = release.manifestVerification;
    if (state.phase === "complete") return { status: release.manifestError === "LEGACY_ALIAS_EXPECTATION_UNKNOWN" ? "unverified" as const : "failed" as const };
    try {
      await scanLegacyBatch(ctx, release._id, state);
      if ((state as Verification).phase === "complete") {
        if (state.pageCount !== release.pageCount || state.sections.some((section) => section.total !== section.uploaded)) {
          throw new Error("LEGACY_PAGE_COUNT_MISMATCH");
        }
        if (state.licenseCount !== state.expectedLicenseCount) throw new Error("LEGACY_LICENSE_COUNT_MISMATCH");
        // Historical manifests never declared aliases. Observing zero (or any
        // other count) cannot prove none were omitted from the original upload.
        await ctx.db.patch(release._id, {
          manifestVerified: false, manifestBasis: "legacy_unverified_aliases", manifestError: "LEGACY_ALIAS_EXPECTATION_UNKNOWN",
          uploadedPageCount: state.pageCount, uploadedAliasCount: state.aliasCount, uploadedLicenseCount: state.licenseCount,
          manifestVerification: { ...state, jobId: undefined },
        });
        return { status: "unverified" as const };
      }
      const jobId = await ctx.scheduler.runAfter(0, internal.manifest.verifyLegacyBatch, { releaseId: release._id });
      await ctx.db.patch(release._id, { manifestVerification: { ...state, jobId } });
      return { status: "pending" as const };
    } catch (error) {
      await ctx.db.patch(release._id, {
        manifestVerified: false, manifestError: error instanceof Error ? error.message : "LEGACY_VERIFICATION_FAILED",
        manifestVerification: { ...state, phase: "complete", jobId: undefined },
      });
      return { status: "failed" as const };
    }
  },
});
