import { v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  compactManPageSearchText,
  DATASET_STAGES,
  MAX_SEARCH_TEXT_CHARS,
  MAX_SNIPPET_TEXT_CHARS,
  truncateText,
} from "./lib";

const DEFAULT_RELEASE_LIMIT = 5;
const MAX_RELEASE_LIMIT = 10;
const DEFAULT_CHILD_SAMPLE_LIMIT = 5;
const MAX_CHILD_SAMPLE_LIMIT = 10;
const DEFAULT_DELETE_LIMIT = 50;
const MAX_DELETE_LIMIT = 200;
const DEFAULT_COMPACT_LIMIT = 10;
const MAX_COMPACT_LIMIT = 25;
const DEFAULT_CONTENT_DEDUPE_LIMIT = 5;
const MAX_CONTENT_DEDUPE_LIMIT = 25;
const DEFAULT_ORPHAN_BLOB_LIMIT = 25;
const MAX_ORPHAN_BLOB_LIMIT = 100;
const DEFAULT_STORAGE_STATS_LIMIT = 25;
const MAX_STORAGE_STATS_LIMIT = 100;
const CONTENT_CHUNK_CHARS = 400_000;

type ContentJsonKind = "docJson" | "synopsisJson" | "optionsJson" | "seeAlsoJson";
type ContentField = { kind: ContentJsonKind; value: string | undefined };

type ReleaseChildTable =
  | "releaseSectionStats"
  | "manPages"
  | "manPageSearchDocuments"
  | "manPageLinks"
  | "licensePackages"
  | "licenses";

const RELEASE_CHILD_TABLES: ReleaseChildTable[] = [
  "releaseSectionStats",
  "manPageSearchDocuments",
  "manPageLinks",
  "licensePackages",
  "licenses",
  "manPages",
];

const storageStatsTableValidator = v.union(
  v.literal("activeReleases"),
  v.literal("datasetReleases"),
  v.literal("licensePackages"),
  v.literal("licenses"),
  v.literal("manPageContentBlobChunks"),
  v.literal("manPageContentBlobs"),
  v.literal("manPageContentChunks"),
  v.literal("manPageContents"),
  v.literal("manPageLinks"),
  v.literal("manPageSearchDocuments"),
  v.literal("manPages"),
  v.literal("rateLimitBuckets"),
  v.literal("releaseSectionStats"),
);

type StorageStatsTable =
  | "activeReleases"
  | "datasetReleases"
  | "licensePackages"
  | "licenses"
  | "manPageContentBlobChunks"
  | "manPageContentBlobs"
  | "manPageContentChunks"
  | "manPageContents"
  | "manPageLinks"
  | "manPageSearchDocuments"
  | "manPages"
  | "rateLimitBuckets"
  | "releaseSectionStats";

const STORAGE_STATS_FIELDS: Record<StorageStatsTable, string[]> = {
  activeReleases: ["distro", "datasetReleaseId"],
  datasetReleases: ["datasetReleaseId", "packageManifestJson"],
  licensePackages: ["packageName", "licenseId", "packageManifestJson"],
  licenses: ["licenseId", "name", "text"],
  manPageContentBlobChunks: ["chunk"],
  manPageContentBlobs: ["docJson", "synopsisJson", "optionsJson", "seeAlsoJson"],
  manPageContentChunks: ["chunk"],
  manPageContents: ["docJson", "synopsisJson", "optionsJson", "seeAlsoJson"],
  manPageLinks: ["fromName", "fromSection", "toName", "toSection", "linkType"],
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
  rateLimitBuckets: ["bucketKey"],
  releaseSectionStats: ["section"],
};

function bounded(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

function contentChunks(value: string): string[] {
  const chunks = [];
  for (let index = 0; index < value.length; index += CONTENT_CHUNK_CHARS) {
    chunks.push(value.slice(index, index + CONTENT_CHUNK_CHARS));
  }
  return chunks;
}

function splitContentFields(contentFields: ContentField[]): {
  inlinePayload: Partial<Record<ContentJsonKind, string>>;
  chunkedFields: Array<{ kind: ContentJsonKind; value: string }>;
} {
  const inlinePayload: Partial<Record<ContentJsonKind, string>> = {};
  const chunkedFields: Array<{ kind: ContentJsonKind; value: string }> = [];

  for (const field of contentFields) {
    if (typeof field.value !== "string") continue;
    if (field.value.length > CONTENT_CHUNK_CHARS) {
      chunkedFields.push({ kind: field.kind, value: field.value });
    } else {
      inlinePayload[field.kind] = field.value;
    }
  }

  return { inlinePayload, chunkedFields };
}

async function legacyContentJsonField(
  ctx: QueryCtx | MutationCtx,
  content: Doc<"manPageContents">,
  kind: ContentJsonKind,
): Promise<string | undefined> {
  const inline = content[kind];
  if (typeof inline === "string") return inline;

  const chunks = await ctx.db
    .query("manPageContentChunks")
    .withIndex("by_contentId_and_kind_and_chunkIndex", (q) =>
      q.eq("contentId", content._id).eq("kind", kind),
    )
    .collect();
  if (!chunks.length) return undefined;
  return chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => chunk.chunk)
    .join("");
}

async function legacyContentFields(
  ctx: QueryCtx | MutationCtx,
  content: Doc<"manPageContents">,
): Promise<ContentField[]> {
  return [
    { kind: "docJson", value: await legacyContentJsonField(ctx, content, "docJson") },
    { kind: "synopsisJson", value: await legacyContentJsonField(ctx, content, "synopsisJson") },
    { kind: "optionsJson", value: await legacyContentJsonField(ctx, content, "optionsJson") },
    { kind: "seeAlsoJson", value: await legacyContentJsonField(ctx, content, "seeAlsoJson") },
  ];
}

function contentFieldsChars(fields: ContentField[]): number {
  return fields.reduce((total, field) => total + (field.value?.length ?? 0), 0);
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

async function findOrCreateContentBlob(
  ctx: MutationCtx,
  args: {
    contentSha256: string;
    contentFields: ContentField[];
  },
): Promise<{ blobId: Id<"manPageContentBlobs">; created: boolean }> {
  const existing = await ctx.db
    .query("manPageContentBlobs")
    .withIndex("by_contentSha256", (q) => q.eq("contentSha256", args.contentSha256))
    .first();
  if (existing) return { blobId: existing._id, created: false };

  const { inlinePayload, chunkedFields } = splitContentFields(args.contentFields);
  const blobId = await ctx.db.insert("manPageContentBlobs", {
    contentSha256: args.contentSha256,
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
    .take(100);
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
  const takeLimit = limit + 1;
  const rows =
    table === "releaseSectionStats"
      ? await ctx.db
          .query("releaseSectionStats")
          .withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", releaseId))
          .take(takeLimit)
      : table === "manPages"
        ? await ctx.db
            .query("manPages")
            .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId))
            .take(takeLimit)
        : table === "manPageSearchDocuments"
          ? await ctx.db
              .query("manPageSearchDocuments")
              .withIndex("by_releaseId_and_nameNorm", (q) => q.eq("releaseId", releaseId))
              .take(takeLimit)
          : table === "manPageLinks"
            ? await ctx.db
                .query("manPageLinks")
                .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId))
                .take(takeLimit)
            : table === "licensePackages"
              ? await ctx.db
                  .query("licensePackages")
                  .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId))
                  .take(takeLimit)
              : await ctx.db
                  .query("licenses")
                  .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId))
                  .take(takeLimit);
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
  if (table === "releaseSectionStats") {
    const rows = await ctx.db
      .query("releaseSectionStats")
      .withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", releaseId))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  }
  if (table === "manPageSearchDocuments") {
    const rows = await ctx.db
      .query("manPageSearchDocuments")
      .withIndex("by_releaseId_and_nameNorm", (q) => q.eq("releaseId", releaseId))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  }
  if (table === "manPageLinks") {
    const rows = await ctx.db
      .query("manPageLinks")
      .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  }
  if (table === "licensePackages") {
    const rows = await ctx.db
      .query("licensePackages")
      .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  }
  if (table === "licenses") {
    const rows = await ctx.db
      .query("licenses")
      .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  }

  const rows = await ctx.db
    .query("manPages")
    .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId))
    .take(limit);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

async function deletePagePayload(
  ctx: MutationCtx,
  page: Doc<"manPages">,
  remaining: number,
): Promise<{ deleted: number; deletedByTable: Partial<Record<TableNames, number>> }> {
  let deleted = 0;
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
    if (deleted >= remaining) return { deleted, deletedByTable };
    await ctx.db.delete(content._id);
    deleted += 1;
    deletedByTable.manPageContents = 1;
  }

  if (deleted < remaining) {
    await ctx.db.delete(page._id);
    deleted += 1;
    deletedByTable.manPages = 1;
  }
  return { deleted, deletedByTable };
}

export const previewInactiveReleases = internalQuery({
  args: {
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
    const releases = await ctx.db.query("datasetReleases").order("asc").take(limit);
    const inactive = [];

    for (const release of releases) {
      const active = await isActiveRelease(ctx, release);
      if (active) continue;

      const children: Partial<Record<ReleaseChildTable, { count: number; hasMore: boolean }>> = {};
      for (const table of RELEASE_CHILD_TABLES) {
        children[table] = await sampleReleaseChildren(ctx, table, release._id, childSampleLimit);
      }

      inactive.push({
        datasetReleaseId: release.datasetReleaseId,
        releaseId: release._id,
        locale: release.locale,
        distro: release.distro,
        ingestedAt: release.ingestedAt,
        pageCount: release.pageCount,
        children,
        contentTablesNote:
          "manPageContents and manPageContentChunks are deleted through sampled manPages.",
      });
    }

    return {
      scanned: releases.length,
      limit,
      childSampleLimit,
      inactive,
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

    let deleted = 0;
    const deletedByTable: Partial<Record<TableNames, number>> = {};

    for (const table of RELEASE_CHILD_TABLES) {
      if (deleted >= maxDocs) break;
      if (table === "manPages") {
        const pages = await ctx.db
          .query("manPages")
          .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", release._id))
          .take(Math.min(maxDocs - deleted, 50));
        for (const page of pages) {
          if (deleted >= maxDocs) break;
          const result = await deletePagePayload(ctx, page, maxDocs - deleted);
          deleted += result.deleted;
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
    const result =
      args.table === "activeReleases"
        ? await ctx.db.query("activeReleases").paginate(paginationOpts)
        : args.table === "datasetReleases"
          ? await ctx.db.query("datasetReleases").paginate(paginationOpts)
          : args.table === "licensePackages"
            ? await ctx.db.query("licensePackages").paginate(paginationOpts)
            : args.table === "licenses"
              ? await ctx.db.query("licenses").paginate(paginationOpts)
              : args.table === "manPageContentBlobChunks"
                ? await ctx.db.query("manPageContentBlobChunks").paginate(paginationOpts)
                : args.table === "manPageContentBlobs"
                  ? await ctx.db.query("manPageContentBlobs").paginate(paginationOpts)
                  : args.table === "manPageContentChunks"
                    ? await ctx.db.query("manPageContentChunks").paginate(paginationOpts)
                    : args.table === "manPageContents"
                      ? await ctx.db.query("manPageContents").paginate(paginationOpts)
                      : args.table === "manPageLinks"
                        ? await ctx.db.query("manPageLinks").paginate(paginationOpts)
                        : args.table === "manPageSearchDocuments"
                          ? await ctx.db.query("manPageSearchDocuments").paginate(paginationOpts)
                          : args.table === "manPages"
                            ? await ctx.db.query("manPages").paginate(paginationOpts)
                            : args.table === "rateLimitBuckets"
                              ? await ctx.db.query("rateLimitBuckets").paginate(paginationOpts)
                              : await ctx.db.query("releaseSectionStats").paginate(paginationOpts);

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

      const fields = await legacyContentFields(ctx, content);
      const legacyChars = contentFieldsChars(fields);
      if (!legacyChars) {
        missingContent += 1;
        continue;
      }

      const existingBlob = await ctx.db
        .query("manPageContentBlobs")
        .withIndex("by_contentSha256", (q) => q.eq("contentSha256", page.contentSha256))
        .first();
      legacyCharsRemoved += legacyChars;

      if (dryRun) {
        if (!existingBlob) blobCharsCreated += legacyChars;
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
        .take(100);
      for (const chunk of chunks) {
        await ctx.db.delete(chunk._id);
        chunkDeletes += 1;
      }
      if (chunks.length === 100) continue;
      await ctx.db.delete(blob._id);
      blobDeletes += 1;
    }

    return {
      dryRun,
      limit,
      scanned: result.page.length,
      orphans,
      blobDeletes,
      chunkDeletes,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
