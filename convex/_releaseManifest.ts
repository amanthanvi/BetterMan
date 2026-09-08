import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const MAX_MANIFEST_SECTIONS = 256;

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

export async function recordPageUploads(ctx: MutationCtx, release: Doc<"datasetReleases">, bySection: Map<string, number>): Promise<void> {
  if (release.manifestBasis !== "declared" || release.uploadedPageCount === undefined) throw new Error("RELEASE_MANIFEST_UNDECLARED");
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
  if (release.uploadedPageCount !== release.pageCount || release.aliasCount === undefined || release.licenseCount === undefined ||
      release.uploadedAliasCount !== release.aliasCount || release.uploadedLicenseCount !== release.licenseCount ||
      stats.some((stat) => stat.uploaded !== stat.total)) {
    throw new Error("RELEASE_MANIFEST_INCOMPLETE");
  }
  await ctx.db.patch(release._id, { manifestVerified: true });
}
