import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReleaseOwnedTable = Exclude<{
  [T in TableNames]: Doc<T> extends { releaseId: Id<"datasetReleases"> } ? T : never
}[TableNames], "activeReleases">;
type Reader = (ctx: QueryCtx | MutationCtx, releaseId: Id<"datasetReleases">, limit: number) =>
  Promise<Array<{ _id: Id<ReleaseOwnedTable> }>>;

// Add release-owned tables here exactly once. Schema additions fail typecheck
// and the runtime schema-enumeration test until this registry is updated.
// manPages stays last: its page-owned payload is removed before the page row.
export const RELEASE_CHILD_READERS = {
  manPageAliasProviders: (ctx, releaseId, limit) => ctx.db.query("manPageAliasProviders")
    .withIndex("by_releaseId_and_route_and_package_and_path", q => q.eq("releaseId", releaseId)).take(limit),
  manPageProviders: (ctx, releaseId, limit) => ctx.db.query("manPageProviders")
    .withIndex("by_releaseId_and_externalId", q => q.eq("releaseId", releaseId)).take(limit),
  releaseProviderUploadShards: (ctx, releaseId, limit) => ctx.db.query("releaseProviderUploadShards")
    .withIndex("by_releaseId_and_bucket", q => q.eq("releaseId", releaseId)).take(limit),
  releaseManifests: (ctx, releaseId, limit) => ctx.db.query("releaseManifests")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(limit),
  releasePackageBatches: (ctx, releaseId, limit) => ctx.db.query("releasePackageBatches")
    .withIndex("by_releaseId_and_batchIndex", (q) => q.eq("releaseId", releaseId)).take(limit),
  releasePageUploadShards: (ctx, releaseId, limit) => ctx.db.query("releasePageUploadShards")
    .withIndex("by_releaseId_and_bucket", (q) => q.eq("releaseId", releaseId)).take(limit),
  releaseSectionStats: (ctx, releaseId, limit) => ctx.db.query("releaseSectionStats")
    .withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", releaseId)).take(limit),
  manPageSearchDocuments: (ctx, releaseId, limit) => ctx.db.query("manPageSearchDocuments")
    .withIndex("by_releaseId_and_nameNorm", (q) => q.eq("releaseId", releaseId)).take(limit),
  manPageOptionFlags: (ctx, releaseId, limit) => ctx.db.query("manPageOptionFlags")
    .withIndex("by_releaseId_and_flag_and_nameNorm", (q) => q.eq("releaseId", releaseId)).take(limit),
  manPageSymbols: (ctx, releaseId, limit) => ctx.db.query("manPageSymbols")
    .withIndex("by_releaseId_and_termNorm", (q) => q.eq("releaseId", releaseId)).take(limit),
  manPageTaskPhrases: (ctx, releaseId, limit) => ctx.db.query("manPageTaskPhrases")
    .withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", releaseId)).take(limit),
  taskPhraseBackfills: (ctx, releaseId, limit) => ctx.db.query("taskPhraseBackfills")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(limit),
  manPageLinks: (ctx, releaseId, limit) => ctx.db.query("manPageLinks")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(limit),
  manPageAliases: (ctx, releaseId, limit) => ctx.db.query("manPageAliases")
    .withIndex("by_releaseId_and_name", (q) => q.eq("releaseId", releaseId)).take(limit),
  licensePackages: (ctx, releaseId, limit) => ctx.db.query("licensePackages")
    .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId)).take(limit),
  licenses: (ctx, releaseId, limit) => ctx.db.query("licenses")
    .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId)).take(limit),
  derivedScanJobs: (ctx, releaseId, limit) => ctx.db.query("derivedScanJobs")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(limit),
  derivedRetryPages: (ctx, releaseId, limit) => ctx.db.query("derivedRetryPages")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(limit),
  derivedReleaseStatus: (ctx, releaseId, limit) => ctx.db.query("derivedReleaseStatus")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(limit),
  derivedPortabilityChunks: (ctx, releaseId, limit) => ctx.db.query("derivedPortabilityChunks")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(limit),
  derivedSignatureBackfills: (ctx, releaseId, limit) => ctx.db.query("derivedSignatureBackfills")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(limit),
  derivedSignatureFailures: (ctx, releaseId, limit) => ctx.db.query("derivedSignatureFailures")
    .withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", releaseId)).take(limit),
  derivedPageInputs: (ctx, releaseId, limit) => ctx.db.query("derivedPageInputs")
    .withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", releaseId)).take(limit),
  manPageDerived: (ctx, releaseId, limit) => ctx.db.query("manPageDerived")
    .withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", releaseId)).take(limit),
  manPages: (ctx, releaseId, limit) => ctx.db.query("manPages")
    .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId)).take(limit),
} satisfies Record<ReleaseOwnedTable, Reader>;

export type ReleaseChildTable = keyof typeof RELEASE_CHILD_READERS;
export const RELEASE_CHILD_TABLES = Object.keys(RELEASE_CHILD_READERS) as ReleaseChildTable[];

export function releaseChildRows(ctx: QueryCtx | MutationCtx, table: ReleaseChildTable,
  releaseId: Id<"datasetReleases">, limit: number) {
  return RELEASE_CHILD_READERS[table](ctx, releaseId, limit);
}
