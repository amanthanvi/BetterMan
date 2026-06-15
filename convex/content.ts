import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { datasetStageValidator, distroValidator } from "./schema";
import {
  type DatasetStage,
  DISTRO_ORDER,
  type Distro,
  type ManPageContentPayload,
  normalizeName,
  normalizeSection,
  pageResponse,
} from "./lib";

type ContentJsonKind = keyof ManPageContentPayload;
type StoredContentFields = Record<ContentJsonKind, string | null>;
type StorageMigrationTarget = "blobs" | "contents";
type BlobStorageMigrationItem = {
  blobId: Id<"manPageContentBlobs">;
  contentSha256: string;
  fields: StoredContentFields;
  legacyChars: number;
};
type PageContentStorageMigrationItem = {
  contentId: Id<"manPageContents">;
  pageId: Id<"manPages">;
  contentSha256: string | null;
  fields: StoredContentFields;
  legacyChars: number;
};
type StorageMigrationBatchResult = {
  target: StorageMigrationTarget;
  dryRun: boolean;
  limit: number;
  scanned: number;
  candidates: number;
  stored: number;
  deletedChunks: number;
  alreadyStored: number;
  usingBlob: number;
  emptyLegacy: number;
  isDone: boolean;
  continueCursor: string;
  chars: {
    legacy: number;
    storagePayload: number;
    estimatedDatabaseCharsRemoved: number;
  };
};

const DEFAULT_STORAGE_MIGRATION_LIMIT = 5;
const MAX_STORAGE_MIGRATION_LIMIT = 25;
const CONTENT_KINDS: ContentJsonKind[] = [
  "docJson",
  "synopsisJson",
  "optionsJson",
  "seeAlsoJson",
];

function bounded(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

function contentFieldsChars(fields: StoredContentFields): number {
  return CONTENT_KINDS.reduce((total, kind) => total + (fields[kind]?.length ?? 0), 0);
}

function storagePayload(args: {
  contentSha256: string | null;
  content: ManPageContentPayload;
}): Blob {
  return new Blob([JSON.stringify(args)], { type: "application/json" });
}

function nullToUndefined(value: string | null | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function storedFieldsToPayload(fields: StoredContentFields): ManPageContentPayload {
  return {
    docJson: nullToUndefined(fields.docJson),
    synopsisJson: nullToUndefined(fields.synopsisJson),
    optionsJson: nullToUndefined(fields.optionsJson),
    seeAlsoJson: nullToUndefined(fields.seeAlsoJson),
  };
}

function normalizeStoredFields(value: unknown): ManPageContentPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const source =
    record.content && typeof record.content === "object" && !Array.isArray(record.content)
      ? (record.content as Record<string, unknown>)
      : record;

  return {
    docJson: typeof source.docJson === "string" ? source.docJson : undefined,
    synopsisJson: typeof source.synopsisJson === "string" ? source.synopsisJson : undefined,
    optionsJson: typeof source.optionsJson === "string" ? source.optionsJson : undefined,
    seeAlsoJson: typeof source.seeAlsoJson === "string" ? source.seeAlsoJson : undefined,
  };
}

async function readStoredContent(
  ctx: { storage: { get: (id: Id<"_storage">) => Promise<Blob | null> } },
  storageId: Id<"_storage">,
): Promise<ManPageContentPayload | null> {
  const blob = await ctx.storage.get(storageId);
  if (!blob) return null;
  const text = await blob.text();
  try {
    return normalizeStoredFields(JSON.parse(text));
  } catch {
    return null;
  }
}

async function activeRelease(
  ctx: QueryCtx,
  args: { stage: DatasetStage; distro: Distro; locale?: string },
): Promise<Doc<"datasetReleases"> | null> {
  const active = await ctx.db
    .query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", args.stage).eq("locale", args.locale ?? "en").eq("distro", args.distro),
    )
    .unique();
  if (!active) return null;
  return await ctx.db.get(active.releaseId);
}

async function requireActiveRelease(
  ctx: QueryCtx,
  args: { stage: DatasetStage; distro: Distro; locale?: string },
): Promise<Doc<"datasetReleases">> {
  const release = await activeRelease(ctx, args);
  if (!release) throw new Error("ACTIVE_RELEASE_NOT_FOUND");
  return release;
}

async function pageByNameAndSection(
  ctx: QueryCtx,
  args: { releaseId: Id<"datasetReleases">; name: string; section: string },
): Promise<Doc<"manPages"> | null> {
  return await ctx.db
    .query("manPages")
    .withIndex("by_releaseId_and_name_and_section", (q) =>
      q.eq("releaseId", args.releaseId).eq("name", args.name).eq("section", args.section),
    )
    .unique();
}

async function variantsForPage(
  ctx: QueryCtx,
  args: {
    stage: DatasetStage;
    locale: string;
    name: string;
    section: string;
  },
): Promise<Array<{ distro: string; datasetReleaseId: string; contentSha256: string }>> {
  const active = await ctx.db
    .query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", args.stage).eq("locale", args.locale),
    )
    .take(20);

  const variants: Array<{ distro: string; datasetReleaseId: string; contentSha256: string }> = [];
  for (const item of active) {
    const page = await pageByNameAndSection(ctx, {
      releaseId: item.releaseId,
      name: args.name,
      section: args.section,
    });
    if (!page) continue;
    variants.push({
      distro: item.distro,
      datasetReleaseId: item.datasetReleaseId,
      contentSha256: page.contentSha256,
    });
  }

  variants.sort((a, b) => {
    const order = (DISTRO_ORDER[a.distro] ?? 99) - (DISTRO_ORDER[b.distro] ?? 99);
    return order || a.distro.localeCompare(b.distro);
  });
  return variants;
}

async function contentBlobJsonField(
  ctx: QueryCtx,
  blob: Doc<"manPageContentBlobs">,
  kind: ContentJsonKind,
): Promise<string | null> {
  const inline = blob[kind];
  if (typeof inline === "string") return inline;

  const chunks = await ctx.db
    .query("manPageContentBlobChunks")
    .withIndex("by_blobId_and_kind_and_chunkIndex", (q) =>
      q.eq("blobId", blob._id).eq("kind", kind),
    )
    .collect();
  if (!chunks.length) return null;
  return chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => chunk.chunk)
    .join("");
}

async function contentJsonField(
  ctx: QueryCtx,
  content: Doc<"manPageContents">,
  kind: ContentJsonKind,
): Promise<string | null> {
  const inline = content[kind];
  if (typeof inline === "string") return inline;

  const chunks = await ctx.db
    .query("manPageContentChunks")
    .withIndex("by_contentId_and_kind_and_chunkIndex", (q) =>
      q.eq("contentId", content._id).eq("kind", kind),
    )
    .collect();
  if (!chunks.length) return null;
  return chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => chunk.chunk)
    .join("");
}

async function legacyBlobFields(
  ctx: QueryCtx,
  blob: Doc<"manPageContentBlobs">,
): Promise<StoredContentFields> {
  return {
    docJson: await contentBlobJsonField(ctx, blob, "docJson"),
    synopsisJson: await contentBlobJsonField(ctx, blob, "synopsisJson"),
    optionsJson: await contentBlobJsonField(ctx, blob, "optionsJson"),
    seeAlsoJson: await contentBlobJsonField(ctx, blob, "seeAlsoJson"),
  };
}

async function legacyContentFields(
  ctx: QueryCtx,
  content: Doc<"manPageContents">,
): Promise<StoredContentFields> {
  return {
    docJson: await contentJsonField(ctx, content, "docJson"),
    synopsisJson: await contentJsonField(ctx, content, "synopsisJson"),
    optionsJson: await contentJsonField(ctx, content, "optionsJson"),
    seeAlsoJson: await contentJsonField(ctx, content, "seeAlsoJson"),
  };
}

async function deleteContentBlobChunks(ctx: MutationCtx, blobId: Id<"manPageContentBlobs">) {
  let deleted = 0;
  for (const kind of CONTENT_KINDS) {
    const chunks = await ctx.db
      .query("manPageContentBlobChunks")
      .withIndex("by_blobId_and_kind_and_chunkIndex", (q) =>
        q.eq("blobId", blobId).eq("kind", kind),
      )
      .take(200);
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
      deleted += 1;
    }
  }
  return deleted;
}

async function deleteContentChunks(ctx: MutationCtx, contentId: Id<"manPageContents">) {
  let deleted = 0;
  for (const kind of CONTENT_KINDS) {
    const chunks = await ctx.db
      .query("manPageContentChunks")
      .withIndex("by_contentId_and_kind_and_chunkIndex", (q) =>
        q.eq("contentId", contentId).eq("kind", kind),
      )
      .take(200);
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
      deleted += 1;
    }
  }
  return deleted;
}

async function contentPointer(ctx: QueryCtx, pageId: Id<"manPages">) {
  const content = await ctx.db
    .query("manPageContents")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
  if (!content) return null;

  if (content.blobId) {
    const blob = await ctx.db.get(content.blobId);
    if (blob?.storageId) {
      return { storageId: blob.storageId, fields: null };
    }
    if (blob) {
      return {
        storageId: null,
        fields: {
          docJson: await contentBlobJsonField(ctx, blob, "docJson"),
          synopsisJson: await contentBlobJsonField(ctx, blob, "synopsisJson"),
          optionsJson: await contentBlobJsonField(ctx, blob, "optionsJson"),
          seeAlsoJson: await contentBlobJsonField(ctx, blob, "seeAlsoJson"),
        },
      };
    }
  }

  if (content.storageId) {
    return { storageId: content.storageId, fields: null };
  }

  return {
    storageId: null,
    fields: {
      docJson: await contentJsonField(ctx, content, "docJson"),
      synopsisJson: await contentJsonField(ctx, content, "synopsisJson"),
      optionsJson: await contentJsonField(ctx, content, "optionsJson"),
      seeAlsoJson: await contentJsonField(ctx, content, "seeAlsoJson"),
    },
  };
}

export const readContentBlobStorageMigrationBatch = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = bounded(args.limit, DEFAULT_STORAGE_MIGRATION_LIMIT, MAX_STORAGE_MIGRATION_LIMIT);
    const result = await ctx.db
      .query("manPageContentBlobs")
      .paginate({ cursor: args.cursor, numItems: limit });

    const items = [];
    let alreadyStored = 0;
    let emptyLegacy = 0;
    for (const blob of result.page) {
      if (blob.storageId) {
        alreadyStored += 1;
        continue;
      }
      const fields = await legacyBlobFields(ctx, blob);
      const legacyChars = contentFieldsChars(fields);
      if (!legacyChars) {
        emptyLegacy += 1;
        continue;
      }
      items.push({
        blobId: blob._id,
        contentSha256: blob.contentSha256,
        fields,
        legacyChars,
      });
    }

    return {
      target: "blobs" as const,
      limit,
      scanned: result.page.length,
      alreadyStored,
      emptyLegacy,
      items,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const readPageContentStorageMigrationBatch = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = bounded(args.limit, DEFAULT_STORAGE_MIGRATION_LIMIT, MAX_STORAGE_MIGRATION_LIMIT);
    const result = await ctx.db
      .query("manPageContents")
      .withIndex("by_blobId", (q) => q.eq("blobId", undefined))
      .paginate({ cursor: args.cursor, numItems: limit });

    const items = [];
    let alreadyStored = 0;
    let usingBlob = 0;
    let emptyLegacy = 0;
    for (const content of result.page) {
      if (content.blobId) {
        usingBlob += 1;
        continue;
      }
      if (content.storageId) {
        alreadyStored += 1;
        continue;
      }
      const fields = await legacyContentFields(ctx, content);
      const legacyChars = contentFieldsChars(fields);
      if (!legacyChars) {
        emptyLegacy += 1;
        continue;
      }
      items.push({
        contentId: content._id,
        pageId: content.pageId,
        contentSha256: content.contentSha256 ?? null,
        fields,
        legacyChars,
      });
    }

    return {
      target: "contents" as const,
      limit,
      scanned: result.page.length,
      alreadyStored,
      usingBlob,
      emptyLegacy,
      items,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const markContentBlobStored = internalMutation({
  args: {
    blobId: v.id("manPageContentBlobs"),
    contentSha256: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const blob = await ctx.db.get(args.blobId);
    if (!blob) throw new Error("CONTENT_BLOB_NOT_FOUND");
    if (blob.contentSha256 !== args.contentSha256) {
      throw new Error("CONTENT_SHA_MISMATCH");
    }

    const deletedChunks = await deleteContentBlobChunks(ctx, args.blobId);
    await ctx.db.patch(args.blobId, {
      storageId: args.storageId,
      docJson: undefined,
      synopsisJson: undefined,
      optionsJson: undefined,
      seeAlsoJson: undefined,
    });

    return { deletedChunks };
  },
});

export const markPageContentStored = internalMutation({
  args: {
    contentId: v.id("manPageContents"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const content = await ctx.db.get(args.contentId);
    if (!content) throw new Error("PAGE_CONTENT_NOT_FOUND");
    if (content.blobId) throw new Error("REFUSING_DIRECT_STORAGE_FOR_BLOB_CONTENT");

    const deletedChunks = await deleteContentChunks(ctx, args.contentId);
    await ctx.db.patch(args.contentId, {
      storageId: args.storageId,
      docJson: undefined,
      synopsisJson: undefined,
      optionsJson: undefined,
      seeAlsoJson: undefined,
    });

    return { deletedChunks };
  },
});

export const migrateContentToStorageBatch = internalAction({
  args: {
    target: v.union(v.literal("blobs"), v.literal("contents")),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<StorageMigrationBatchResult> => {
    const dryRun = args.dryRun ?? false;
    const target = args.target as StorageMigrationTarget;
    const queryArgs = { cursor: args.cursor, limit: args.limit };
    const batch =
      target === "blobs"
        ? await ctx.runQuery(internal.content.readContentBlobStorageMigrationBatch, queryArgs)
        : await ctx.runQuery(internal.content.readPageContentStorageMigrationBatch, queryArgs);

    let stored = 0;
    let legacyChars = 0;
    let storageChars = 0;
    let deletedChunks = 0;

    for (const item of batch.items) {
      legacyChars += item.legacyChars;
      const content = storedFieldsToPayload(item.fields);
      const payload = storagePayload({
        contentSha256: item.contentSha256,
        content,
      });
      storageChars += payload.size;

      if (dryRun) continue;
      const storageId = await ctx.storage.store(payload);
      if (target === "blobs") {
        const blobItem = item as BlobStorageMigrationItem;
        const result = await ctx.runMutation(internal.content.markContentBlobStored, {
          blobId: blobItem.blobId,
          contentSha256: blobItem.contentSha256,
          storageId,
        });
        deletedChunks += result.deletedChunks;
      } else {
        const contentItem = item as PageContentStorageMigrationItem;
        const result = await ctx.runMutation(internal.content.markPageContentStored, {
          contentId: contentItem.contentId,
          storageId,
        });
        deletedChunks += result.deletedChunks;
      }
      stored += 1;
    }

    return {
      target,
      dryRun,
      limit: batch.limit,
      scanned: batch.scanned,
      candidates: batch.items.length,
      stored,
      deletedChunks,
      alreadyStored: batch.alreadyStored,
      usingBlob: "usingBlob" in batch ? batch.usingBlob : 0,
      emptyLegacy: batch.emptyLegacy,
      isDone: batch.isDone,
      continueCursor: batch.continueCursor,
      chars: {
        legacy: legacyChars,
        storagePayload: storageChars,
        estimatedDatabaseCharsRemoved: legacyChars,
      },
    };
  },
});

async function pageReadModel(
  ctx: QueryCtx,
  args: { stage: DatasetStage; release: Doc<"datasetReleases">; page: Doc<"manPages"> },
) {
  const content = await contentPointer(ctx, args.page._id);
  if (!content) return null;
  const variants = await variantsForPage(ctx, {
    stage: args.stage,
    locale: args.release.locale,
    name: args.page.name,
    section: args.page.section,
  });
  return {
    release: args.release,
    page: args.page,
    content,
    variants,
  };
}

export const getManByNameReadModel = internalQuery({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const release = await requireActiveRelease(ctx, args);
    const pages = await ctx.db
      .query("manPages")
      .withIndex("by_releaseId_and_name_and_section", (q) =>
        q.eq("releaseId", release._id).eq("name", name),
      )
      .take(20);

    if (!pages.length) return { kind: "not_found" as const };
    if (pages.length > 1) {
      return {
        kind: "ambiguous" as const,
        options: pages.map((page) => ({
          section: page.section,
          title: page.title,
          description: page.description,
        })),
      };
    }

    const data = await pageReadModel(ctx, { stage: args.stage, release, page: pages[0] });
    if (!data) return { kind: "not_found" as const };
    return { kind: "page" as const, data };
  },
});

export const getManByNameAndSectionReadModel = internalQuery({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    name: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const section = normalizeSection(args.section);
    const release = await requireActiveRelease(ctx, args);
    const page = await pageByNameAndSection(ctx, {
      releaseId: release._id,
      name,
      section,
    });
    if (!page) return null;

    return await pageReadModel(ctx, { stage: args.stage, release, page });
  },
});

async function resolveContent(
  ctx: { storage: { get: (id: Id<"_storage">) => Promise<Blob | null> } },
  pointer: { storageId: Id<"_storage"> | null; fields: StoredContentFields | null },
): Promise<ManPageContentPayload | null> {
  if (pointer.storageId) return await readStoredContent(ctx, pointer.storageId);
  if (!pointer.fields) return null;
  return storedFieldsToPayload(pointer.fields);
}

export const getManByName = action({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    name: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const result = await ctx.runQuery(internal.content.getManByNameReadModel, args);
    if (result.kind !== "page") return result;

    const content = await resolveContent(ctx, result.data.content);
    if (!content) return { kind: "not_found" as const };

    return {
      kind: "page" as const,
      data: pageResponse(result.data.release, result.data.page, content, result.data.variants),
    };
  },
});

export const getManByNameAndSection = action({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    name: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const result = await ctx.runQuery(internal.content.getManByNameAndSectionReadModel, args);
    if (!result) return null;

    const content = await resolveContent(ctx, result.content);
    if (!content) return null;

    return pageResponse(result.release, result.page, content, result.variants);
  },
});
