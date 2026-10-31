import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const MAX_MANIFEST_SECTIONS = 256;

// Persist acquisition identity independently of the mirror and large manifest.
export function releaseAcquisition(manifest: unknown): "deb-extraction" | undefined {
  const acquisition = manifest && typeof manifest === "object" && "acquisition" in manifest
    ? manifest.acquisition : undefined;
  if (acquisition !== undefined && acquisition !== "deb-extraction") throw new Error("INVALID_RELEASE_MANIFEST");
  return acquisition;
}

// An owner authorization may lift the spend hold, never the required B4 tier.
export function fullDebianTierMissing(release: Doc<"datasetReleases">, stage: "prod" | "staging"): boolean {
  return stage === "prod" && release.distro === "debian" && release.acquisition === "deb-extraction" && release.indexablePageCount === undefined;
}

export function fullDebianPromotionHeld(release: Doc<"datasetReleases">, stage: "prod" | "staging", allowFullDebian?: boolean): boolean {
  return stage === "prod" && release.distro === "debian" && release.acquisition === "deb-extraction" && allowFullDebian !== true;
}

export function validManifestCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateManifestSections(pageCount: number, sections: Array<{ section: string; total: number }>): void {
  const seen = new Set<string>();
  let total = 0;
  if (!validManifestCount(pageCount) || sections.length > MAX_MANIFEST_SECTIONS) throw new Error("INVALID_RELEASE_MANIFEST");
  for (const stat of sections) {
    if (!stat.section || stat.section !== stat.section.trim().toLowerCase() || seen.has(stat.section) || !validManifestCount(stat.total)) {
      throw new Error("INVALID_RELEASE_MANIFEST");
    }
    seen.add(stat.section);
    total += stat.total;
    if (!validManifestCount(total)) throw new Error("INVALID_RELEASE_MANIFEST");
  }
  if (total !== pageCount) throw new Error("INVALID_RELEASE_MANIFEST");
}

export function validateReleaseDeclaration(args: {
  pageCount: number;
  aliasCount: number;
  licenseCount: number;
  sectionTotals: Array<{ section: string; total: number }>;
  licensePackages: Array<{ name: string; version: string; hasLicenseText: boolean }>;
}): void {
  validateManifestSections(args.pageCount, args.sectionTotals);
  if (!validManifestCount(args.aliasCount) || !validManifestCount(args.licenseCount)) throw new Error("INVALID_RELEASE_MANIFEST");
  const seen = new Set<string>();
  let licenses = 0;
  for (const pkg of args.licensePackages) {
    const name = pkg.name.trim().toLowerCase();
    if (!name || seen.has(name) || !pkg.version.trim()) {
      throw new Error("INVALID_RELEASE_MANIFEST");
    }
    seen.add(name);
    if (pkg.hasLicenseText) licenses += 1;
  }
  if (licenses !== args.licenseCount) throw new Error("INVALID_RELEASE_MANIFEST");
}

export const PAGE_UPLOAD_SHARDS = 16;

export async function pageUploadProgress(ctx: QueryCtx | MutationCtx, release: Doc<"datasetReleases">) {
  const sections = new Map<string, number>();
  if (!release.shardedPageUploads) return { pageCount: release.uploadedPageCount, sections };
  const shards = await ctx.db.query("releasePageUploadShards")
    .withIndex("by_releaseId_and_bucket", (q) => q.eq("releaseId", release._id)).take(PAGE_UPLOAD_SHARDS + 1);
  if (shards.length > PAGE_UPLOAD_SHARDS) throw new Error("INVALID_RELEASE_MANIFEST");
  let pageCount = 0;
  let indexablePageCount = 0;
  for (const shard of shards) {
    pageCount += shard.pageCount;
    indexablePageCount += shard.indexablePageCount ?? 0;
    for (const stat of shard.sections) sections.set(stat.section, (sections.get(stat.section) ?? 0) + stat.uploaded);
  }
  return { pageCount, indexablePageCount, sections };
}

export async function recordPageUploads(ctx: MutationCtx, release: Doc<"datasetReleases">, bySection: Map<string, number>, batchKey: string, indexed = 0): Promise<void> {
  if (release.manifestBasis !== "declared" || release.uploadedPageCount === undefined) throw new Error("RELEASE_MANIFEST_UNDECLARED");
  if (release.shardedPageUploads) {
    let hash = 0;
    for (const char of batchKey) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    const bucket = hash % PAGE_UPLOAD_SHARDS;
    const shard = await ctx.db.query("releasePageUploadShards")
      .withIndex("by_releaseId_and_bucket", (q) => q.eq("releaseId", release._id).eq("bucket", bucket)).unique();
    const sections = new Map((shard?.sections ?? []).map((stat) => [stat.section, stat.uploaded]));
    let added = 0;
    for (const [section, count] of bySection) {
      const stat = await ctx.db.query("releaseSectionStats")
        .withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", release._id).eq("section", section)).unique();
      if (!stat) throw new Error("UNDECLARED_MAN_PAGE_SECTION");
      const uploaded = (sections.get(section) ?? 0) + count;
      if (!validManifestCount(uploaded) || uploaded > stat.total) throw new Error("RELEASE_MANIFEST_EXCEEDED");
      sections.set(section, uploaded);
      added += count;
    }
    const payload = { releaseId: release._id, bucket, indexablePageCount: (shard?.indexablePageCount ?? 0) + indexed, pageCount: (shard?.pageCount ?? 0) + added,
      sections: [...sections].map(([section, uploaded]) => ({ section, uploaded })) };
    if (shard) await ctx.db.replace(shard._id, payload);
    else await ctx.db.insert("releasePageUploadShards", payload);
    return;
  }
  let added = 0;
  for (const [section, count] of bySection) {
    const stat = await ctx.db.query("releaseSectionStats")
      .withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", release._id).eq("section", section)).unique();
    if (!stat) throw new Error("UNDECLARED_MAN_PAGE_SECTION");
    const uploaded = (stat.uploaded ?? 0) + count;
    if (!validManifestCount(uploaded) || uploaded > stat.total) throw new Error("RELEASE_MANIFEST_EXCEEDED");
    await ctx.db.patch(stat._id, { uploaded });
    added += count;
  }
  const uploadedPageCount = release.uploadedPageCount + added;
  if (!validManifestCount(uploadedPageCount) || uploadedPageCount > release.pageCount) throw new Error("RELEASE_MANIFEST_EXCEEDED");
  await ctx.db.patch(release._id, { uploadedPageCount });
}

export async function recordOtherUploads(ctx: MutationCtx, release: Doc<"datasetReleases">, kind: "aliases" | "licenses", inserted: number): Promise<void> {
  const expected = kind === "aliases" ? release.aliasCount : release.licenseCount;
  const previous = kind === "aliases" ? release.uploadedAliasCount : release.uploadedLicenseCount;
  if (release.manifestBasis !== "declared" || expected === undefined || previous === undefined) throw new Error("RELEASE_MANIFEST_UNDECLARED");
  const uploaded = previous + inserted;
  if (!validManifestCount(uploaded) || uploaded > expected) throw new Error("RELEASE_MANIFEST_EXCEEDED");
  await ctx.db.patch(release._id, kind === "aliases" ? { uploadedAliasCount: uploaded } : { uploadedLicenseCount: uploaded });
}

export async function verifyDeclaredManifest(ctx: MutationCtx, release: Doc<"datasetReleases">): Promise<void> {
  if (release.pageCount === 0) throw new Error("RELEASE_MANIFEST_EMPTY");
  if (release.manifestVerified) return;
  if (release.manifestBasis !== "declared") throw new Error("RELEASE_MANIFEST_UNVERIFIED");
  const stats = await ctx.db.query("releaseSectionStats")
    .withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", release._id)).take(MAX_MANIFEST_SECTIONS + 1);
  validateManifestSections(release.pageCount, stats);
  const progress = await pageUploadProgress(ctx, release);
  if (release.indexablePageCount !== undefined && progress.indexablePageCount !== release.indexablePageCount) {
    throw new Error("RELEASE_MANIFEST_INCOMPLETE");
  }
  if (release.providerCount !== undefined) {
    const shards = await ctx.db.query("releaseProviderUploadShards")
      .withIndex("by_releaseId_and_bucket", q => q.eq("releaseId", release._id)).take(PAGE_UPLOAD_SHARDS + 1);
    const count = shards.reduce((sum, shard) => sum + shard.count, 0);
    if (shards.length > PAGE_UPLOAD_SHARDS || count > release.providerCount) throw new Error("RELEASE_MANIFEST_EXCEEDED");
    if (count !== release.providerCount) throw new Error("RELEASE_MANIFEST_INCOMPLETE");
  }
  if ((progress.pageCount !== undefined && progress.pageCount > release.pageCount) ||
      stats.some((stat) => (progress.sections.get(stat.section) ?? 0) > stat.total)) {
    throw new Error("RELEASE_MANIFEST_EXCEEDED");
  }
  if ((release.packageBatchCount ?? 0) !== (release.uploadedPackageBatchCount ?? 0) ||
      progress.pageCount !== release.pageCount || release.aliasCount === undefined || release.licenseCount === undefined ||
      release.uploadedAliasCount !== release.aliasCount || release.uploadedLicenseCount !== release.licenseCount ||
      stats.some((stat) => (release.shardedPageUploads ? progress.sections.get(stat.section) ?? 0 : stat.uploaded) !== stat.total)) {
    throw new Error("RELEASE_MANIFEST_INCOMPLETE");
  }
  if (release.shardedPageUploads) {
    for (const stat of stats) await ctx.db.patch(stat._id, { uploaded: stat.total });
  }
  await ctx.db.patch(release._id, { manifestVerified: true, uploadedPageCount: progress.pageCount });
}
