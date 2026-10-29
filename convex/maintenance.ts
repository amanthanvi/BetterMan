import { v } from "convex/values";
import { MANIFEST_CONTENT_TYPE, MANIFEST_ORPHAN_MIN_AGE_MS } from "./_manifestStorage";
import { RELEASE_CHILD_TABLES, releaseChildRows, type ReleaseChildTable } from "./_releaseChildren";
import { distroValidator } from "./schema";
import { pageUploadProgress } from "./_releaseManifest";
import { requireMutableRelease } from "./_releaseIntegrity";
import { serializeStoredPayload, storedPayloadDigest } from "./_storedPayload";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  compactManPageSearchText,
  DATASET_STAGES,
  MAX_SEARCH_TEXT_CHARS,
  MAX_SNIPPET_TEXT_CHARS,
  truncateText,
} from "./lib";
import {
  CONTENT_KINDS,
  type ContentField,
  type ContentJsonKind,
  contentChunks,
  contentFieldsChars,
  readContentBlobField,
  readManPageContentFieldList,
  splitContentFields,
} from "./_legacyContent";

const DEFAULT_RELEASE_LIMIT = 5;
const MAX_RELEASE_LIMIT = 10;
const DEFAULT_CHILD_SAMPLE_LIMIT = 5;
const MAX_CHILD_SAMPLE_LIMIT = 10;
const DEFAULT_DELETE_LIMIT = 1000;
const MAX_DELETE_LIMIT = 2000;
const DEFAULT_COMPACT_LIMIT = 10;
const MAX_COMPACT_LIMIT = 25;
const DEFAULT_CONTENT_DEDUPE_LIMIT = 5;
const MAX_CONTENT_DEDUPE_LIMIT = 25;
const MAX_LEGACY_BLOB_CANDIDATES = 25;
const DEFAULT_ORPHAN_BLOB_LIMIT = 25;
const MAX_ORPHAN_BLOB_LIMIT = 100;
const DEFAULT_STORAGE_STATS_LIMIT = 25;
const MAX_STORAGE_STATS_LIMIT = 100;

const storageStatsTableValidator = v.union(
  v.literal("activeReleases"),
  v.literal("datasetReleases"),
  v.literal("derivedBuilds"),
  v.literal("derivedScanJobs"),
  v.literal("derivedSignatureBackfills"),
  v.literal("derivedSignatureFailures"),
  v.literal("derivedLegacySignatures"),
  v.literal("derivedRetryPages"),
  v.literal("derivedReleaseStatus"),
  v.literal("derivedSignatureCache"),
  v.literal("derivedPortabilityChunks"),
  v.literal("derivedPageInputs"),
  v.literal("licensePackages"),
  v.literal("licenses"),
  v.literal("manPageContentBlobChunks"),
  v.literal("manPageContentBlobs"),
  v.literal("manPageContentChunks"),
  v.literal("manPageContents"),
  v.literal("manPageAliases"),
  v.literal("manPageGenerated"),
  v.literal("manPageLinks"),
  v.literal("manPageSymbols"),
  v.literal("manPageOptionFlags"),
  v.literal("manPageSearchDocuments"),
  v.literal("manPages"),
  v.literal("manPageDerived"),
  v.literal("rateLimitBuckets"),
  v.literal("releaseSectionStats"),
  v.literal("releaseManifests"),
  v.literal("releasePackageBatches"),
  v.literal("releasePageUploadShards"),
);

type StorageStatsTable = TableNames;

export const STORAGE_STATS_FIELDS: { [T in StorageStatsTable]: Array<Extract<keyof Doc<T>, string>> } = {
  activeReleases: ["distro", "datasetReleaseId"],
  datasetReleases: ["datasetReleaseId", "packageManifestJson"],
  derivedBuilds: ["locale", "key", "fingerprint"],
  derivedScanJobs: ["locale", "cursor", "createdForKey"],
  derivedSignatureBackfills: ["locale", "cursor", "error"],
  derivedSignatureFailures: ["error"],
  derivedLegacySignatures: ["sourceKey", "optionsJson"],
  derivedRetryPages: ["locale", "key", "name", "section", "error"],
  derivedReleaseStatus: ["locale"],
  derivedSignatureCache: ["key", "contentSha256", "signatureHash", "optionsJson"],
  derivedPortabilityChunks: ["key", "json"],
  derivedPageInputs: ["name", "section", "contentSha256", "optionsJson"],
  manPageDerived: ["key", "summaryJson"],
  licensePackages: ["packageName", "version"],
  licenses: ["licenseId", "licenseName", "licenseText"],
  manPageContentBlobChunks: ["chunk"],
  manPageContentBlobs: ["docJson", "synopsisJson", "optionsJson", "seeAlsoJson"],
  manPageContentChunks: ["chunk"],
  manPageContents: ["docJson", "synopsisJson", "optionsJson", "seeAlsoJson"],
  manPageAliases: ["name", "section", "targetName", "targetSection"],
  // Content-hash rows, not release-owned; parts are bounded objects.
  manPageGenerated: ["contentSha256", "updatedAt", "tldrCommit"],
  manPageLinks: ["fromExternalId", "toName", "toSection", "toTitle", "toDescription", "linkType"],
  manPageSymbols: ["term", "termNorm", "anchorId", "excerpt"],
  manPageOptionFlags: ["nameNorm", "section", "flag", "anchorId", "flags"],
  manPageSearchDocuments: ["searchText", "snippetText", "description", "title", "name"],
  manPages: [
    "name",
    "section",
    "title",
    "description",
    "sourcePackage",
    "sourcePackageVersion",
    "sourcePath",
    "externalId",
    "datasetReleaseId",
    "contentSha256",
  ],
  rateLimitBuckets: ["key"],
  releaseSectionStats: ["section"],
  releaseManifests: ["json"],
  releasePackageBatches: ["digest"],
  releasePageUploadShards: [],
};

function bounded(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

async function insertContentBlobChunks(
  ctx: MutationCtx,
  args: {
    blobId: Id<"manPageContentBlobs">;
    contentSha256: string;
    kind: ContentJsonKind;
    value: string;
  },
) {
  const chunks = contentChunks(args.value);
  for (const [chunkIndex, chunk] of chunks.entries()) {
    await ctx.db.insert("manPageContentBlobChunks", {
      blobId: args.blobId,
      contentSha256: args.contentSha256,
      kind: args.kind,
      chunkIndex,
      chunk,
    });
  }
}

async function findReusableContentBlob(
  ctx: MutationCtx,
  args: {
    contentSha256: string;
    contentFields: ContentField[];
  },
  knownMissingDigests?: ReadonlySet<string>,
): Promise<{ blobId: Id<"manPageContentBlobs"> | null; contentDigest: string }> {
  const fields = Object.fromEntries(args.contentFields.map(({ kind, value }) => [kind, value]));
  const contentDigest = await storedPayloadDigest(serializeStoredPayload(args.contentSha256, fields));
  if (knownMissingDigests?.has(contentDigest)) return { blobId: null, contentDigest };
  const existing = await ctx.db
    .query("manPageContentBlobs")
    .withIndex("by_contentDigest", (q) => q.eq("contentDigest", contentDigest))
    .first();
  if (existing) {
    // Stored payloads require action-side byte validation before migration.
    if (existing.storageId) throw new Error("CONTENT_STORAGE_VALIDATION_REQUIRED");
    if (existing.contentSha256 !== args.contentSha256) throw new Error("CONTENT_PAYLOAD_MISMATCH");
    for (const kind of CONTENT_KINDS) {
      const actual = await readContentBlobField(ctx, existing, kind, true);
      if ((actual ?? undefined) !== fields[kind]) {
        throw new Error("CONTENT_PAYLOAD_MISMATCH");
      }
    }
    return { blobId: existing._id, contentDigest };
  }

  // Legacy candidates have no payload identity. Reuse only proven equal bytes;
  // a bounded miss creates a new blob without modifying any historical blob.
  const legacyCandidates = await ctx.db.query("manPageContentBlobs")
    .withIndex("by_contentSha256", (q) => q.eq("contentSha256", args.contentSha256))
    .take(MAX_LEGACY_BLOB_CANDIDATES);
  for (const candidate of legacyCandidates) {
    if (candidate.contentDigest !== undefined || candidate.storageId) continue;
    let matches = true;
    for (const kind of CONTENT_KINDS) {
      const actual = await readContentBlobField(ctx, candidate, kind, true);
      if ((actual ?? undefined) !== fields[kind]) {
        matches = false;
        break;
      }
    }
    if (matches) return { blobId: candidate._id, contentDigest };
  }
  return { blobId: null, contentDigest };
}

async function findOrCreateContentBlob(
  ctx: MutationCtx,
  args: { contentSha256: string; contentFields: ContentField[] },
): Promise<{ blobId: Id<"manPageContentBlobs">; created: boolean }> {
  const { blobId: existingId, contentDigest } = await findReusableContentBlob(ctx, args);
  if (existingId) return { blobId: existingId, created: false };
  const { inlinePayload, chunkedFields } = splitContentFields(args.contentFields);
  const blobId = await ctx.db.insert("manPageContentBlobs", {
    contentSha256: args.contentSha256,
    contentDigest,
    ...inlinePayload,
  });

  for (const field of chunkedFields) {
    await insertContentBlobChunks(ctx, {
      blobId,
      contentSha256: args.contentSha256,
      kind: field.kind,
      value: field.value,
    });
  }

  return { blobId, created: true };
}

async function deleteLegacyContentChunks(ctx: MutationCtx, pageId: Id<"manPages">): Promise<number> {
  const chunks = await ctx.db
    .query("manPageContentChunks")
    .withIndex("by_pageId_and_kind_and_chunkIndex", (q) => q.eq("pageId", pageId))
    .take(101);
  if (chunks.length > 100) throw new Error("CONTENT_CHUNK_LIMIT");
  for (const chunk of chunks) await ctx.db.delete(chunk._id);
  return chunks.length;
}

function removeLegacyContentPatch(args: {
  contentSha256: string;
  blobId: Id<"manPageContentBlobs">;
}) {
  return {
    contentSha256: args.contentSha256,
    blobId: args.blobId,
    docJson: undefined,
    synopsisJson: undefined,
    optionsJson: undefined,
    seeAlsoJson: undefined,
  };
}

async function isActiveRelease(
  ctx: QueryCtx | MutationCtx,
  release: Doc<"datasetReleases">,
): Promise<boolean> {
  for (const stage of DATASET_STAGES) {
    const active = await ctx.db
      .query("activeReleases")
      .withIndex("by_stage_and_locale_and_distro", (q) =>
        q.eq("stage", stage).eq("locale", release.locale).eq("distro", release.distro),
      )
      .unique();
    if (active?.releaseId === release._id) return true;
  }
  return false;
}

async function releaseByDatasetReleaseId(
  ctx: QueryCtx | MutationCtx,
  datasetReleaseId: string,
): Promise<Doc<"datasetReleases"> | null> {
  return await ctx.db
    .query("datasetReleases")
    .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", datasetReleaseId))
    .unique();
}

async function sampleReleaseChildren(
  ctx: QueryCtx | MutationCtx,
  table: ReleaseChildTable,
  releaseId: Id<"datasetReleases">,
  limit: number,
): Promise<{ count: number; hasMore: boolean }> {
  const rows = await releaseChildRows(ctx, table, releaseId, limit + 1);
  return { count: Math.min(rows.length, limit), hasMore: rows.length > limit };
}

async function releaseHasChildren(
  ctx: QueryCtx | MutationCtx,
  releaseId: Id<"datasetReleases">,
): Promise<boolean> {
  for (const table of RELEASE_CHILD_TABLES) {
    const sample = await sampleReleaseChildren(ctx, table, releaseId, 1);
    if (sample.count > 0) return true;
  }
  return false;
}

async function deleteReleaseChildrenByTable(
  ctx: MutationCtx,
  table: ReleaseChildTable,
  releaseId: Id<"datasetReleases">,
  limit: number,
): Promise<number> {
  const rows = await releaseChildRows(ctx, table, releaseId, limit);
  for (const row of rows) {
    if (table === "releaseManifests" && "storageId" in row && row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deletePagePayload(
  ctx: MutationCtx,
  page: Doc<"manPages">,
  remaining: number,
): Promise<{ deleted: number; storageDeletes: number; deletedByTable: Partial<Record<TableNames, number>> }> {
  let deleted = 0;
  let storageDeletes = 0;
  const deletedByTable: Partial<Record<TableNames, number>> = {};
  const content = await ctx.db
    .query("manPageContents")
    .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
    .unique();

  if (content) {
    const chunks = await ctx.db
      .query("manPageContentChunks")
      .withIndex("by_pageId_and_kind_and_chunkIndex", (q) => q.eq("pageId", page._id))
      .take(remaining);
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
      deleted += 1;
      deletedByTable.manPageContentChunks = (deletedByTable.manPageContentChunks ?? 0) + 1;
    }
    if (deleted >= remaining) return { deleted, storageDeletes, deletedByTable };
    await ctx.db.delete(content._id);
    deleted += 1;
    deletedByTable.manPageContents = 1;
    // Page-content files are written one per content row by the storage
    // migration; shared payloads live behind blobs, not here.
    if (content.storageId) {
      await ctx.storage.delete(content.storageId);
      storageDeletes += 1;
    }
  }

  if (deleted < remaining) {
    await ctx.db.delete(page._id);
    deleted += 1;
    deletedByTable.manPages = 1;
  }
  return { deleted, storageDeletes, deletedByTable };
}

// Optional admin migration after deployment; ordinary reads of new releases
// never include provenance. Cursor and batch size keep legacy migration bounded.
export const detachLegacyManifests = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), dryRun: v.optional(v.boolean()) },
  returns: v.object({ moved: v.number(), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const batch = await ctx.db.query("datasetReleases").paginate({ cursor: args.cursor, numItems: 5 });
    let moved = 0;
    for (const release of batch.page) {
      if (!release.packageManifestJson || release.pruning) continue;
      const existing = await ctx.db.query("releaseManifests")
        .withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique();
      if (existing && existing.json !== release.packageManifestJson) throw new Error("RELEASE_MANIFEST_CONFLICT");
      if (args.dryRun) { moved += 1; continue; }
      if (!existing) await ctx.db.insert("releaseManifests", { releaseId: release._id, json: release.packageManifestJson });
      await ctx.db.patch(release._id, { packageManifestJson: undefined });
      moved += 1;
    }
    return { moved, isDone: batch.isDone, continueCursor: batch.continueCursor };
  },
});

export const previewInactiveReleases = internalQuery({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
    childSampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = bounded(args.limit, DEFAULT_RELEASE_LIMIT, MAX_RELEASE_LIMIT);
    const childSampleLimit = bounded(
      args.childSampleLimit,
      DEFAULT_CHILD_SAMPLE_LIMIT,
      MAX_CHILD_SAMPLE_LIMIT,
    );
    // Page through every release so callers can see past the first batch.
    const page = await ctx.db
      .query("datasetReleases")
      .order("asc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    const inactive = [];

    for (const release of page.page) {
      const active = await isActiveRelease(ctx, release);
      if (active) continue;

      const children: Partial<Record<ReleaseChildTable, { count: number; hasMore: boolean }>> = {};
      for (const table of RELEASE_CHILD_TABLES) {
        children[table] = await sampleReleaseChildren(ctx, table, release._id, childSampleLimit);
      }

      const progress = await pageUploadProgress(ctx, release);
      const status = await ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique();
      const derivedPins = {
        required: status?.required ?? false,
        pendingRefs: status?.pendingRefs ?? 0,
        readyRows: status?.readyRows ?? 0,
        pinned: !!status && (status.required || status.pendingRefs > 0 || status.readyRows > 0),
      };
      inactive.push({
        derivedPins,
        datasetReleaseId: release.datasetReleaseId,
        releaseId: release._id,
        locale: release.locale,
        distro: release.distro,
        ingestedAt: release.ingestedAt,
        // Server-assigned creation time; ingestedAt is client-supplied.
        createdAt: new Date(release._creationTime).toISOString(),
        pageCount: release.pageCount,
        uploadedPageCount: progress.pageCount ?? null,
        uploadedLicenseCount: release.uploadedLicenseCount ?? null,
        uploadedPackageBatchCount: release.uploadedPackageBatchCount ?? null,
        // Rollback eligibility: only sealed, verified, declared releases can be
        // activated again. Legacy or failed manifests never can.
        sealed: release.sealed === true,
        pruning: release.pruning === true,
        manifestBasis: release.manifestBasis ?? null,
        manifestVerified: release.manifestVerified === true,
        manifestError: release.manifestError ?? null,
        // Declared uploads are complete when every counter matches its
        // declaration; such a release is still activatable even if unsealed.
        uploadComplete: (release.packageBatchCount ?? 0) === (release.uploadedPackageBatchCount ?? 0)
          && release.manifestBasis === "declared"
          && progress.pageCount === release.pageCount
          && release.aliasCount !== undefined && release.uploadedAliasCount === release.aliasCount
          && release.licenseCount !== undefined && release.uploadedLicenseCount === release.licenseCount,
        children,
        contentTablesNote:
          "manPageContents and manPageContentChunks are deleted through sampled manPages.",
      });
    }

    return {
      scanned: page.page.length,
      limit,
      childSampleLimit,
      inactive,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      note: "Bounded dry run only. Counts are capped at childSampleLimit and may undercount large releases.",
    };
  },
});

export const deleteInactiveReleaseBatch = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    confirmDatasetReleaseId: v.string(),
    maxDocs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.datasetReleaseId !== args.confirmDatasetReleaseId) {
      throw new Error("CONFIRM_DATASET_RELEASE_ID_MISMATCH");
    }

    const maxDocs = bounded(args.maxDocs, DEFAULT_DELETE_LIMIT, MAX_DELETE_LIMIT);
    const release = await releaseByDatasetReleaseId(ctx, args.datasetReleaseId);
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    if (await isActiveRelease(ctx, release)) throw new Error("REFUSING_TO_DELETE_ACTIVE_RELEASE");
    const derived = await ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique();
    if (derived && (derived.required || derived.pendingRefs > 0 || derived.readyRows > 0)) throw new Error("RELEASE_DERIVED_BUILD_IN_PROGRESS");
    // Activation must never publish a release between its deletion batches.
    if (!release.pruning) await ctx.db.patch(release._id, { pruning: true });

    let deleted = 0;
    let storageDeletes = 0;
    const deletedByTable: Partial<Record<TableNames, number>> = {};

    for (const table of RELEASE_CHILD_TABLES) {
      if (deleted >= maxDocs) break;
      if (table === "manPages") {
        const pages = await ctx.db
          .query("manPages")
          .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", release._id))
          .take(Math.min(Math.ceil((maxDocs - deleted) / 2), 500));
        for (const page of pages) {
          if (deleted >= maxDocs) break;
          const result = await deletePagePayload(ctx, page, maxDocs - deleted);
          deleted += result.deleted;
          storageDeletes += result.storageDeletes;
          for (const [key, value] of Object.entries(result.deletedByTable)) {
            const table = key as TableNames;
            deletedByTable[table] = (deletedByTable[table] ?? 0) + (value ?? 0);
          }
        }
        continue;
      }

      const tableDeleted = await deleteReleaseChildrenByTable(ctx, table, release._id, maxDocs - deleted);
      deleted += tableDeleted;
      deletedByTable[table] = (deletedByTable[table] ?? 0) + tableDeleted;
    }

    let deletedRelease = false;
    if (deleted < maxDocs && !(await releaseHasChildren(ctx, release._id))) {
      await ctx.db.delete(release._id);
      deleted += 1;
      deletedRelease = true;
      deletedByTable.datasetReleases = 1;
    }

    return {
      datasetReleaseId: release.datasetReleaseId,
      releaseId: release._id,
      maxDocs,
      deleted,
      storageDeletes,
      deletedByTable,
      deletedRelease,
      hasMore: !deletedRelease,
    };
  },
});

export const compactSearchDocumentsBatch = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const release = await releaseByDatasetReleaseId(ctx, args.datasetReleaseId);
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    if (!args.dryRun) await requireMutableRelease(ctx, release);

    const limit = bounded(args.limit, DEFAULT_COMPACT_LIMIT, MAX_COMPACT_LIMIT);
    const result = await ctx.db
      .query("manPageSearchDocuments")
      .withIndex("by_releaseId_and_nameNorm", (q) => q.eq("releaseId", release._id))
      .paginate({ cursor: args.cursor, numItems: limit });

    let compacted = 0;
    let searchCharsBefore = 0;
    let searchCharsAfter = 0;
    let snippetCharsBefore = 0;
    let snippetCharsAfter = 0;

    for (const doc of result.page) {
      const nextSearchText = compactManPageSearchText(doc);
      const nextSnippetText = truncateText(doc.snippetText, MAX_SNIPPET_TEXT_CHARS);
      searchCharsBefore += doc.searchText.length;
      searchCharsAfter += nextSearchText.length;
      snippetCharsBefore += doc.snippetText.length;
      snippetCharsAfter += nextSnippetText.length;

      if (nextSearchText === doc.searchText && nextSnippetText === doc.snippetText) continue;
      compacted += 1;
      if (!args.dryRun) {
        await ctx.db.patch(doc._id, {
          searchText: nextSearchText,
          snippetText: nextSnippetText,
        });
      }
    }

    return {
      datasetReleaseId: release.datasetReleaseId,
      releaseId: release._id,
      dryRun: args.dryRun ?? false,
      limit,
      scanned: result.page.length,
      compacted,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      caps: {
        searchText: MAX_SEARCH_TEXT_CHARS,
        snippetText: MAX_SNIPPET_TEXT_CHARS,
      },
      chars: {
        searchBefore: searchCharsBefore,
        searchAfter: searchCharsAfter,
        snippetBefore: snippetCharsBefore,
        snippetAfter: snippetCharsAfter,
      },
    };
  },
});

export const estimateStorageStatsBatch = internalQuery({
  args: {
    table: storageStatsTableValidator,
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = bounded(args.limit, DEFAULT_STORAGE_STATS_LIMIT, MAX_STORAGE_STATS_LIMIT);
    const paginationOpts = { cursor: args.cursor, numItems: limit };
    const result = await ctx.db.query(args.table).paginate(paginationOpts);

    const fields = STORAGE_STATS_FIELDS[args.table];
    const charsByField: Record<string, number> = {};
    const docsWithField: Record<string, number> = {};
    const maxByField: Record<string, number> = {};
    let approxJsonChars = 0;

    for (const doc of result.page as Array<Record<string, unknown>>) {
      approxJsonChars += JSON.stringify(doc).length;
      for (const field of fields) {
        const value = doc[field];
        if (typeof value !== "string") continue;
        charsByField[field] = (charsByField[field] ?? 0) + value.length;
        docsWithField[field] = (docsWithField[field] ?? 0) + 1;
        maxByField[field] = Math.max(maxByField[field] ?? 0, value.length);
      }
    }

    return {
      table: args.table,
      limit,
      scanned: result.page.length,
      approxJsonChars,
      charsByField,
      docsWithField,
      maxByField,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const dedupePageContentBatch = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const release = await releaseByDatasetReleaseId(ctx, args.datasetReleaseId);
    if (!release) throw new Error("RELEASE_NOT_FOUND");

    const dryRun = args.dryRun ?? false;
    if (!dryRun) await requireMutableRelease(ctx, release);
    const limit = bounded(args.limit, DEFAULT_CONTENT_DEDUPE_LIMIT, MAX_CONTENT_DEDUPE_LIMIT);
    const result = await ctx.db
      .query("manPages")
      .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", release._id))
      .paginate({ cursor: args.cursor, numItems: limit });

    let duplicateCandidates = 0;
    let alreadyDeduped = 0;
    let skippedUnique = 0;
    let missingContent = 0;
    let migrated = 0;
    let blobCreates = 0;
    let legacyCharsRemoved = 0;
    let blobCharsCreated = 0;
    let legacyChunksDeleted = 0;
    const previewDigests = new Set<string>();

    for (const page of result.page) {
      const duplicateSample = await ctx.db
        .query("manPages")
        .withIndex("by_contentSha256", (q) => q.eq("contentSha256", page.contentSha256))
        .take(2);
      if (duplicateSample.length < 2) {
        skippedUnique += 1;
        continue;
      }
      duplicateCandidates += 1;

      const content = await ctx.db
        .query("manPageContents")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique();
      if (!content) {
        missingContent += 1;
        continue;
      }
      if (content.blobId) {
        alreadyDeduped += 1;
        continue;
      }
      if (content.storageId && !dryRun) throw new Error("CONTENT_STORAGE_VALIDATION_REQUIRED");

      const fields = await readManPageContentFieldList(ctx, content);
      const legacyChars = contentFieldsChars(fields);
      if (!legacyChars) {
        missingContent += 1;
        continue;
      }

      legacyCharsRemoved += legacyChars;

      if (dryRun) {
        const existing = await findReusableContentBlob(ctx, {
          contentSha256: page.contentSha256, contentFields: fields,
        }, previewDigests);
        if (!existing.blobId && !previewDigests.has(existing.contentDigest)) {
          blobCharsCreated += legacyChars;
          previewDigests.add(existing.contentDigest);
        }
        migrated += 1;
        continue;
      }

      const blob = await findOrCreateContentBlob(ctx, {
        contentSha256: page.contentSha256,
        contentFields: fields,
      });
      if (blob.created) {
        blobCreates += 1;
        blobCharsCreated += legacyChars;
      }
      legacyChunksDeleted += await deleteLegacyContentChunks(ctx, page._id);
      await ctx.db.patch(
        content._id,
        removeLegacyContentPatch({
          contentSha256: page.contentSha256,
          blobId: blob.blobId,
        }),
      );
      migrated += 1;
    }

    return {
      datasetReleaseId: release.datasetReleaseId,
      releaseId: release._id,
      dryRun,
      limit,
      scanned: result.page.length,
      duplicateCandidates,
      migrated,
      alreadyDeduped,
      skippedUnique,
      missingContent,
      blobCreates,
      legacyChunksDeleted,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      chars: {
        legacyRemoved: legacyCharsRemoved,
        blobCreated: blobCharsCreated,
        estimatedNetSaved: legacyCharsRemoved - blobCharsCreated,
      },
    };
  },
});

export const cleanupOrphanContentBlobsBatch = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const limit = bounded(args.limit, DEFAULT_ORPHAN_BLOB_LIMIT, MAX_ORPHAN_BLOB_LIMIT);
    const result = await ctx.db
      .query("manPageContentBlobs")
      .paginate({ cursor: args.cursor, numItems: limit });

    let orphans = 0;
    let blobDeletes = 0;
    let chunkDeletes = 0;
    let storageDeletes = 0;
    let oversizedSkipped = 0;

    for (const blob of result.page) {
      const ref = await ctx.db
        .query("manPageContents")
        .withIndex("by_blobId", (q) => q.eq("blobId", blob._id))
        .first();
      if (ref) continue;
      orphans += 1;
      if (dryRun) continue;

      const chunks = await ctx.db
        .query("manPageContentBlobChunks")
        .withIndex("by_blobId_and_kind_and_chunkIndex", (q) => q.eq("blobId", blob._id))
        .take(101);
      // Never leave a partially deleted blob available for a later reference.
      // The reference check and full deletion share this transaction.
      if (chunks.length > 100) {
        oversizedSkipped += 1;
        continue;
      }
      for (const chunk of chunks) {
        await ctx.db.delete(chunk._id);
        chunkDeletes += 1;
      }
      await ctx.db.delete(blob._id);
      blobDeletes += 1;
      // Stored payload files are keyed one per blob, but only remove the file
      // once no remaining blob row points at it.
      if (blob.storageId) {
        const sharing = await ctx.db
          .query("manPageContentBlobs")
          .withIndex("by_storageId", (q) => q.eq("storageId", blob.storageId))
          .take(2);
        if (!sharing.some((other) => other._id !== blob._id)) {
          await ctx.storage.delete(blob.storageId);
          storageDeletes += 1;
        }
      }
    }

    return {
      dryRun,
      limit,
      scanned: result.page.length,
      orphans,
      blobDeletes,
      chunkDeletes,
      storageDeletes,
      oversizedSkipped,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});


// These are optional caches, not release children. Delete a cache only after
// proving that no live page/input or exact legacy content identity references
// it in the same transaction. Small pages bound the worst-case signature bytes.
export const cleanupOrphanDerivedCachesBatch = internalMutation({
  args: {
    table: v.union(v.literal("derivedSignatureCache"), v.literal("derivedLegacySignatures")),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = bounded(args.limit, 5, 8);
    const dryRun = args.dryRun ?? false;
    let orphans = 0;
    let deleted = 0;
    let unknownSkipped = 0;
    if (args.table === "derivedSignatureCache") {
      const page = await ctx.db.query("derivedSignatureCache").paginate({ cursor: args.cursor, numItems: limit });
      for (const row of page.page) {
        const input = await ctx.db.query("derivedPageInputs").withIndex("by_signatureHash", (q) => q.eq("signatureHash", row.signatureHash)).first();
        if (input) continue;
        const source = await ctx.db.query("manPages").withIndex("by_optionSignatureHash", (q) => q.eq("optionSignatureHash", row.signatureHash)).first();
        if (source) continue;
        // Versioned pages without a stored signature may still hydrate this
        // cache by source/version when that identity has exactly one candidate.
        if (row.extractorVersion !== null && await ctx.db.query("manPages").withIndex("by_contentSha256_and_optionExtractorVersion", (q) => q.eq("contentSha256", row.contentSha256).eq("optionExtractorVersion", row.extractorVersion!)).first()) continue;
        orphans++;
        if (!dryRun) { await ctx.db.delete(row._id); deleted++; }
      }
      return { table: args.table, dryRun, limit, scanned: page.page.length, orphans, deleted, unknownSkipped,
        isDone: page.isDone, continueCursor: page.continueCursor };
    }
    const page = await ctx.db.query("derivedLegacySignatures").paginate({ cursor: args.cursor, numItems: limit });
    for (const row of page.page) {
      const key = /^options-v2:(blob|storage|content):(.+)$/.exec(row.sourceKey);
      // Preserve keys written by an unknown migration format, rather than
      // guessing their reference semantics and invalidating an in-flight job.
      if (!key) { unknownSkipped++; continue; }
      let referenced = false;
      if (key[1] === "blob") {
        const id = ctx.db.normalizeId("manPageContentBlobs", key[2]);
        if (!id) { unknownSkipped++; continue; }
        referenced = !!await ctx.db.query("manPageContents").withIndex("by_blobId", (q) => q.eq("blobId", id)).first();
      } else if (key[1] === "storage") {
        const id = ctx.db.system.normalizeId("_storage", key[2]);
        if (!id) { unknownSkipped++; continue; }
        referenced = !!await ctx.db.query("manPageContents").withIndex("by_storageId", (q) => q.eq("storageId", id)).first();
      } else {
        const id = ctx.db.normalizeId("manPageContents", key[2]);
        if (!id) { unknownSkipped++; continue; }
        referenced = !!await ctx.db.get(id);
      }
      if (referenced) continue;
      orphans++;
      if (!dryRun) { await ctx.db.delete(row._id); deleted++; }
    }
    return { table: args.table, dryRun, limit, scanned: page.page.length, orphans, deleted, unknownSkipped,
      isDone: page.isDone, continueCursor: page.continueCursor };
  },
});


const MAX_STATS_SAMPLE = 2000;
const MAX_STATS_LINKS = 8000;

/**
 * Read-only staging check: per active release, how many sampled pages have a
 * SEE ALSO link, a cross-reference link, parse warnings, or an empty
 * description, and how many aliases exist. Costs three index ranges per
 * release (pages, links, aliases), so it stays well inside the transaction
 * budget. Pass `distro` to check one release at a time.
 * Run with `npx convex run maintenance:releaseStats '{"stage":"staging"}'`.
 */
export const releaseStats = internalQuery({
  args: {
    stage: v.union(v.literal("staging"), v.literal("prod")),
    distro: v.optional(distroValidator),
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sampleLimit = Math.min(MAX_STATS_SAMPLE, Math.max(1, args.sampleLimit ?? 500));
    const active = await ctx.db
      .query("activeReleases")
      .withIndex("by_stage_and_locale_and_distro", (q) =>
        args.distro
          ? q.eq("stage", args.stage).eq("locale", "en").eq("distro", args.distro)
          : q.eq("stage", args.stage),
      )
      .take(20);

    const releases = [];
    for (const pointer of active) {
      const release = await ctx.db.get(pointer.releaseId);
      if (!release) continue;

      const pages = await ctx.db
        .query("manPages")
        .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", release._id))
        .take(sampleLimit);
      const sampledIds = new Set(pages.map((page) => page._id));

      const links = await ctx.db
        .query("manPageLinks")
        .withIndex("by_releaseId", (q) => q.eq("releaseId", release._id))
        .take(MAX_STATS_LINKS);
      const seeAlsoFrom = new Set<string>();
      const xrefFrom = new Set<string>();
      for (const link of links) {
        if (!sampledIds.has(link.fromPageId)) continue;
        if (link.linkType === "see_also") seeAlsoFrom.add(link.fromPageId);
        else xrefFrom.add(link.fromPageId);
      }

      const aliases = await ctx.db
        .query("manPageAliases")
        .withIndex("by_releaseId_and_name", (q) => q.eq("releaseId", release._id))
        .take(MAX_STATS_SAMPLE);

      const sampled = pages.length;
      const pct = (n: number) => (sampled ? Math.round((n / sampled) * 1000) / 10 : 0);
      releases.push({
        distro: release.distro,
        datasetReleaseId: release.datasetReleaseId,
        pageCount: release.pageCount,
        sampled,
        linksScanned: links.length,
        linksTruncated: links.length >= MAX_STATS_LINKS,
        aliases: aliases.length,
        withSeeAlsoPct: pct(seeAlsoFrom.size),
        withXrefPct: pct(xrefFrom.size),
        withParseWarningsPct: pct(pages.filter((page) => page.hasParseWarnings).length),
        emptyDescriptionPct: pct(pages.filter((page) => !page.description).length),
      });
    }
    return { stage: args.stage, releases };
  },
});

// Admin-only measurement for the local scale probe. JSON bytes describe stored
// values, excluding index/internal encoding overhead; storage bytes use actual
// file metadata. No stage pointer or release data is changed by these queries.
export const measureReleaseBatch = internalQuery({
  args: {
    datasetReleaseId: v.string(), cursor: v.union(v.string(), v.null()),
    table: v.union(v.literal("manPages"), v.literal("manPageSearchDocuments"), v.literal("manPageLinks"),
      v.literal("manPageSymbols"),
  v.literal("manPageOptionFlags"), v.literal("licensePackages"), v.literal("licenses"),
      v.literal("releaseSectionStats"), v.literal("releaseManifests"), v.literal("releasePackageBatches"), v.literal("releasePageUploadShards")),
  },
  returns: v.object({ documents: v.number(), jsonBytes: v.number(), storageBytes: v.number(), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const release = await releaseByDatasetReleaseId(ctx, args.datasetReleaseId);
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    const id = release._id;
    const query = args.table === "manPages" ? ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", id))
      : args.table === "manPageSearchDocuments" ? ctx.db.query("manPageSearchDocuments").withIndex("by_releaseId_and_nameNorm", (q) => q.eq("releaseId", id))
      : args.table === "manPageLinks" ? ctx.db.query("manPageLinks").withIndex("by_releaseId", (q) => q.eq("releaseId", id))
      : args.table === "manPageOptionFlags" ? ctx.db.query("manPageOptionFlags").withIndex("by_releaseId_and_flag_and_nameNorm", (q) => q.eq("releaseId", id))
      : args.table === "licensePackages" ? ctx.db.query("licensePackages").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", id))
      : args.table === "licenses" ? ctx.db.query("licenses").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", id))
      : args.table === "releaseSectionStats" ? ctx.db.query("releaseSectionStats").withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", id))
      : args.table === "releaseManifests" ? ctx.db.query("releaseManifests").withIndex("by_releaseId", (q) => q.eq("releaseId", id))
      : args.table === "releasePageUploadShards" ? ctx.db.query("releasePageUploadShards").withIndex("by_releaseId_and_bucket", (q) => q.eq("releaseId", id))
      : ctx.db.query("releasePackageBatches").withIndex("by_releaseId_and_batchIndex", (q) => q.eq("releaseId", id));
    const batch = await query.paginate({ cursor: args.cursor, numItems: 500, maximumBytesRead: 4 * 1024 * 1024 });
    const encoder = new TextEncoder();
    const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
    let documents = batch.page.length;
    let jsonBytes = batch.page.reduce((sum, row) => sum + bytes(row), 0);
    let storageBytes = 0;
    for (const row of batch.page) {
      if (args.table === "manPages") {
        const content = await ctx.db.query("manPageContents")
          .withIndex("by_pageId", (q) => q.eq("pageId", row._id as Id<"manPages">)).unique();
        if (content) { documents++; jsonBytes += bytes(content); }
        const blob = content?.blobId ? await ctx.db.get(content.blobId) : null;
        if (blob) { documents++; jsonBytes += bytes(blob); }
        if (blob?.storageId) storageBytes += (await ctx.db.system.get(blob.storageId))?.size ?? 0;
      } else if (args.table === "releaseManifests" && "storageId" in row && row.storageId) {
        storageBytes += (await ctx.db.system.get(row.storageId))?.size ?? 0;
      }
    }
    return { documents, jsonBytes, storageBytes, isDone: batch.isDone, continueCursor: batch.continueCursor };
  },
});

export const measurePageLookup = internalQuery({
  args: { distro: distroValidator, name: v.string(), section: v.string() },
  returns: v.object({ documents: v.number(), jsonBytes: v.number(), releaseJsonBytes: v.number() }),
  handler: async (ctx, args) => {
    const pointer = await ctx.db.query("activeReleases")
      .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", args.distro)).unique();
    if (!pointer) throw new Error("ACTIVE_RELEASE_NOT_FOUND");
    const release = await ctx.db.get(pointer.releaseId);
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    const page = await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", (q) =>
      q.eq("releaseId", release._id).eq("name", args.name).eq("section", args.section)).unique();
    if (!page) throw new Error("PAGE_NOT_FOUND");
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
    return { documents: 3, jsonBytes: [pointer, release, page].reduce((sum, row) => sum + bytes(row), 0), releaseJsonBytes: bytes(release) };
  },
});


// Also reclaim manifests whose HTTP action died after store() and before the
// release mutation. The distinct MIME type and 24h grace exclude unrelated files
// and every live upload action; indexed reference checks serialize with linking.
export const cleanupOrphanManifestFilesBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), limit: v.optional(v.number()), dryRun: v.optional(v.boolean()) },
  returns: v.object({ scanned: v.number(), orphans: v.number(), storageDeletes: v.number(), isDone: v.boolean(), continueCursor: v.string(),
    files: v.array(v.object({ storageId: v.id("_storage"), ageMs: v.number(), size: v.number() })),
  }),
  handler: async (ctx, args) => {
    const batch = await ctx.db.system.query("_storage").paginate({ cursor: args.cursor,
      numItems: bounded(args.limit, 50, 100) });
    let orphans = 0;
    let storageDeletes = 0;
    const files = [];
    for (const file of batch.page) {
      if (file.contentType !== MANIFEST_CONTENT_TYPE || file._creationTime > Date.now() - MANIFEST_ORPHAN_MIN_AGE_MS) continue;
      const ref = await ctx.db.query("releaseManifests")
        .withIndex("by_storageId", (q) => q.eq("storageId", file._id)).first();
      if (ref) continue;
      orphans++;
      if (args.dryRun) files.push({ storageId: file._id, ageMs: Date.now() - file._creationTime, size: file.size });
      if (!args.dryRun) { await ctx.storage.delete(file._id); storageDeletes++; }
    }
    return { scanned: batch.page.length, orphans, storageDeletes, files, isDone: batch.isDone, continueCursor: batch.continueCursor };
  },
});
