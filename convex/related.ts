import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { pageByNameAndSection } from "./_releaseLookups";
import { cachedRelatedItem } from "./_relatedLinks";
import { DATASET_STAGES, DISTROS } from "./lib";

const BACKFILL_BATCH_SIZE = 100;

export async function scheduleRelatedMetadataBackfill(
  ctx: MutationCtx,
  release: Doc<"datasetReleases">,
): Promise<boolean> {
  const version = release.relatedMetadataVersion ?? 0;
  if (release.relatedMetadataCompletedVersion === version) return false;
  await ctx.scheduler.runAfter(0, internal.related.backfillRelease, {
    datasetReleaseId: release.datasetReleaseId,
    cursor: null,
    version,
  });
  return true;
}

// Deployment entrypoint: at most two stage pointers per supported distro.
export const backfillActiveReleases = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.number(), skipped: v.number() }),
  handler: async (ctx) => {
    const seen = new Set<Doc<"datasetReleases">["_id"]>();
    let scheduled = 0;
    let skipped = 0;
    for (const stage of DATASET_STAGES) {
      const pointers = await ctx.db
        .query("activeReleases")
        .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", stage).eq("locale", "en"))
        .take(DISTROS.length);
      for (const pointer of pointers) {
        if (seen.has(pointer.releaseId)) continue;
        seen.add(pointer.releaseId);
        const release = await ctx.db.get(pointer.releaseId);
        if (release && await scheduleRelatedMetadataBackfill(ctx, release)) scheduled += 1;
        else skipped += 1;
      }
    }
    return { scheduled, skipped };
  },
});

// Page metadata is immutable within a release: both ingest paths skip existing
// pages. Cache only positive matches so interrupted/older uploads can resume.
export const backfillRelease = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    cursor: v.union(v.string(), v.null()),
    version: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    // A superseded release may be pruned while a scheduled batch is pending.
    if (!release || release.relatedMetadataCompletedVersion === (release.relatedMetadataVersion ?? 0)) {
      return { processed: 0, updated: 0, isDone: true, continueCursor: null };
    }

    const version = release.relatedMetadataVersion ?? 0;
    // New pages may resolve links scanned in an earlier batch. Restart that
    // pass rather than marking their newly invalidated metadata complete.
    const cursor = args.version !== undefined && args.version !== version ? null : args.cursor;

    const batch = await ctx.db
      .query("manPageLinks")
      .withIndex("by_releaseId", (q) => q.eq("releaseId", release._id))
      .paginate({ cursor, numItems: BACKFILL_BATCH_SIZE });

    let updated = 0;
    for (const link of batch.page) {
      if (cachedRelatedItem(link)) continue;
      const target = await pageByNameAndSection(ctx, {
        releaseId: release._id,
        name: link.toName,
        section: link.toSection,
      });
      if (!target) continue;
      await ctx.db.patch(link._id, { toTitle: target.title, toDescription: target.description });
      updated += 1;
    }

    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.related.backfillRelease, {
        datasetReleaseId: args.datasetReleaseId,
        cursor: batch.continueCursor,
        version,
      });
    } else {
      await ctx.db.patch(release._id, { relatedMetadataCompletedVersion: version });
    }
    return {
      processed: batch.page.length,
      updated,
      isDone: batch.isDone,
      continueCursor: batch.isDone ? null : batch.continueCursor,
    };
  },
});
