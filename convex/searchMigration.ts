import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DATASET_STAGES, DISTROS } from "./lib";

const BATCH_SIZE = 50;

/** Move output bytes without replacing the indexed row or its search identity. */
export async function migrateSearchDocument(
  ctx: MutationCtx,
  doc: Doc<"manPageSearchDocuments">,
): Promise<boolean> {
  if (doc.title === undefined && doc.description === undefined && doc.snippetText === undefined) return false;
  if (doc.title === undefined || doc.description === undefined || doc.snippetText === undefined) {
    throw new Error("SEARCH_LEGACY_DETAILS_INCOMPLETE");
  }
  const existing = await ctx.db.query("manPageSearchDetails")
    .withIndex("by_searchDocumentId", (q) => q.eq("searchDocumentId", doc._id)).unique();
  const details = {
    searchDocumentId: doc._id, releaseId: doc.releaseId,
    title: doc.title, description: doc.description, snippetText: doc.snippetText,
  };
  if (existing) await ctx.db.replace(existing._id, details);
  else await ctx.db.insert("manPageSearchDetails", details);
  // descNorm and every ranking/index field stay byte-identical. In particular,
  // retaining _id/_creationTime keeps description-search tie order intact.
  await ctx.db.patch(doc._id, {
    title: undefined, description: undefined, snippetText: undefined,
    searchText: undefined, datasetReleaseId: undefined,
  });
  return true;
}

// Restartable deployment/recovery entrypoint: duplicates across stages share
// one chain, and rerunning only scans past rows already migrated.
export const backfillActiveReleases = internalMutation({
  args: {},
  handler: async (ctx) => {
    const releaseIds = new Set<Doc<"datasetReleases">["_id"]>();
    for (const stage of DATASET_STAGES) {
      const pointers = await ctx.db.query("activeReleases")
        .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", stage).eq("locale", "en"))
        .take(DISTROS.length);
      for (const pointer of pointers) releaseIds.add(pointer.releaseId);
    }
    for (const releaseId of releaseIds) {
      await ctx.scheduler.runAfter(0, internal.searchMigration.migrateReleaseBatch, { releaseId, cursor: null });
    }
    return { scheduled: releaseIds.size };
  },
});

export const migrateReleaseBatch = internalMutation({
  args: { releaseId: v.id("datasetReleases"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const release = await ctx.db.get(args.releaseId);
    if (!release || release.pruning || release.locale !== "en") return null;
    let active = false;
    for (const stage of DATASET_STAGES) {
      const pointer = await ctx.db.query("activeReleases")
        .withIndex("by_stage_and_locale_and_distro", (q) =>
          q.eq("stage", stage).eq("locale", "en").eq("distro", release.distro)).unique();
      if (pointer?.releaseId === args.releaseId) active = true;
    }
    if (!active) return null;
    const batch = await ctx.db.query("manPageSearchDocuments")
      .withIndex("by_releaseId_and_nameNorm", (q) => q.eq("releaseId", args.releaseId))
      .paginate({ cursor: args.cursor, numItems: BATCH_SIZE, maximumBytesRead: 4 * 1024 * 1024, maximumRowsRead: BATCH_SIZE });
    let migrated = 0;
    for (const doc of batch.page) if (await migrateSearchDocument(ctx, doc)) migrated += 1;
    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.searchMigration.migrateReleaseBatch, {
        releaseId: args.releaseId, cursor: batch.continueCursor,
      });
    }
    return { scanned: batch.page.length, migrated, isDone: batch.isDone, continueCursor: batch.continueCursor };
  },
});
