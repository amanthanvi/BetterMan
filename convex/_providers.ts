import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Provider = {
  externalId: string; name: string; section: string; sourcePackage: string | null;
  sourcePackageVersion: string | null; sourcePath: string; title: string; description: string;
  contentSha256: string; hasParseWarnings: boolean; contentStorageId: Id<"_storage">;
};

export async function readProviderPackages(ctx: QueryCtx, release: Doc<"datasetReleases">,
  name: string, section: string, page: Doc<"manPages"> | null): Promise<string[]> {
  if (page?.providerPackages) return page.providerPackages;
  const limit = release.providerCount ?? 0;
  if (!limit) return [];
  const [real, aliases] = await Promise.all([
    ctx.db.query("manPageProviders").withIndex("by_releaseId_and_route_and_package_and_path", q =>
      q.eq("releaseId", release._id).eq("name", name).eq("section", section)).take(limit),
    ctx.db.query("manPageAliasProviders").withIndex("by_releaseId_and_route_and_package_and_path", q =>
      q.eq("releaseId", release._id).eq("name", name).eq("section", section)).take(limit),
  ]);
  return [...new Set([page?.sourcePackage, ...real.map(p => p.sourcePackage), ...aliases.map(p => p.sourcePackage)]
    .filter((pkg): pkg is string => Boolean(pkg)))].sort();
}

/** Cache only package names during upload, so collisions add no page-view document reads. */
export async function refreshProviderPackages(ctx: MutationCtx, release: Doc<"datasetReleases">, name: string, section: string) {
  if (!release.providerCount) return;
  const page = await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", q =>
    q.eq("releaseId", release._id).eq("name", name).eq("section", section)).unique();
  if (!page) return; // The canonical upload will collect providers that arrived first.
  const packages = await readProviderPackages(ctx, release, name, section, { ...page, providerPackages: undefined });
  await ctx.db.patch(page._id, { providerPackages: packages });
}

export async function insertProvider(ctx: MutationCtx, release: Doc<"datasetReleases">,
  page: Provider, immutable: boolean, createBlob: () => Promise<Id<"manPageContentBlobs">>) {
  if (!page.sourcePackage || !page.name || page.name !== page.name.toLowerCase().trim()
    || !page.section || page.section !== page.section.toLowerCase().trim()) throw new Error("INVALID_MAN_PAGE_ROUTE");
  const existing = await ctx.db.query("manPageProviders")
    .withIndex("by_releaseId_and_externalId", q => q.eq("releaseId", release._id).eq("externalId", page.externalId)).unique();
  if (existing) {
    const blob = await ctx.db.get(existing.blobId);
    const metadata = await ctx.db.system.get(page.contentStorageId);
    if (existing.name !== page.name || existing.section !== page.section || existing.sourcePackage !== page.sourcePackage
      || existing.sourcePath !== page.sourcePath || existing.contentSha256 !== page.contentSha256
      || existing.title !== page.title || existing.description !== page.description
      || existing.sourcePackageVersion !== (page.sourcePackageVersion ?? undefined)
      || existing.hasParseWarnings !== page.hasParseWarnings
      || !blob?.contentDigest || metadata?.sha256 !== blob.contentDigest) throw new Error("RELEASE_MANIFEST_CONFLICT");
    return false;
  }
  if (immutable) throw new Error("RELEASE_SEALED");
  if (!release.providerCount) throw new Error("RELEASE_MANIFEST_UNDECLARED");
  const duplicate = await ctx.db.query("manPageProviders")
    .withIndex("by_releaseId_and_route_and_package_and_path", q => q.eq("releaseId", release._id)
      .eq("name", page.name).eq("section", page.section).eq("sourcePackage", page.sourcePackage!).eq("sourcePath", page.sourcePath)).unique();
  if (duplicate) throw new Error("DUPLICATE_MAN_PAGE_ROUTE");
  await ctx.db.insert("manPageProviders", {
    releaseId: release._id, datasetReleaseId: release.datasetReleaseId, externalId: page.externalId,
    name: page.name, section: page.section, sourcePackage: page.sourcePackage,
    sourcePackageVersion: page.sourcePackageVersion ?? undefined, sourcePath: page.sourcePath,
    title: page.title, description: page.description, contentSha256: page.contentSha256,
    hasParseWarnings: page.hasParseWarnings, blobId: await createBlob(),
  });
  await refreshProviderPackages(ctx, release, page.name, page.section);
  return true;
}

export async function recordProviderUploads(ctx: MutationCtx, release: Doc<"datasetReleases">, count: number, key: string) {
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const bucket = hash % 16;
  const shard = await ctx.db.query("releaseProviderUploadShards")
    .withIndex("by_releaseId_and_bucket", q => q.eq("releaseId", release._id).eq("bucket", bucket)).unique();
  const total = (shard?.count ?? 0) + count;
  if (!Number.isSafeInteger(total) || total > (release.providerCount ?? 0)) throw new Error("RELEASE_MANIFEST_EXCEEDED");
  if (shard) await ctx.db.patch(shard._id, { count: total });
  else await ctx.db.insert("releaseProviderUploadShards", { releaseId: release._id, bucket, count: total });
}
