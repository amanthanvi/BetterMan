import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DATASET_STAGES, DISTROS, type DatasetStage } from "./lib";
import { datasetStageValidator } from "./schema";
import { variantsFromPointers } from "./_releaseLookups";

const BATCH_SIZE = 50;

export async function scheduleVariantsRefresh(
  ctx: MutationCtx,
  stage: DatasetStage,
  locale: string,
): Promise<void> {
  const state = await ctx.db.query("variantSnapshots")
    .withIndex("by_stage_and_locale", (q) => q.eq("stage", stage).eq("locale", locale)).unique();
  const version = (state?.version ?? 0) + 1;
  const jobId = await ctx.scheduler.runAfter(0, internal.variants.refreshBatch, {
    stage, locale, version, releaseIndex: 0, cursor: null,
  });
  const payload = { stage, locale, version, jobId };
  if (state) await ctx.db.replace(state._id, payload);
  else await ctx.db.insert("variantSnapshots", payload);
}

// Deployment/recovery entrypoint, including legacy active releases. A new
// version invalidates old chains and cached rows in the same transaction.
export const backfillActiveReleases = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const stage of DATASET_STAGES) await scheduleVariantsRefresh(ctx, stage, "en");
    return null;
  },
});

export const refreshBatch = internalMutation({
  args: {
    stage: datasetStageValidator, locale: v.string(), version: v.number(),
    releaseIndex: v.number(), cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db.query("variantSnapshots")
      .withIndex("by_stage_and_locale", (q) => q.eq("stage", args.stage).eq("locale", args.locale)).unique();
    // A pointer change publishes a new version. Superseded jobs cannot write
    // stale hashes, even if they were queued before activation/promotion.
    if (!state || state.version !== args.version) return null;
    const pointers = await ctx.db.query("activeReleases")
      .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", args.stage).eq("locale", args.locale))
      .take(DISTROS.length);
    const pointer = pointers[args.releaseIndex];
    if (!pointer) return null;
    const release = await ctx.db.get(pointer.releaseId);
    if (!release || release.pruning) return null;
    const batch = await ctx.db.query("manPages")
      .withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", pointer.releaseId))
      .paginate({ cursor: args.cursor, numItems: BATCH_SIZE });
    for (const page of batch.page) {
      const variants = (await variantsFromPointers(ctx, pointers, page)).map((variant) => ({
        ...variant, name: page.name, section: page.section,
      }));
      const patch: Partial<Doc<"manPages">> = args.stage === "prod"
        ? { variants, variantsVersion: args.version }
        : { stagingVariants: variants, stagingVariantsVersion: args.version };
      await ctx.db.patch(page._id, patch);
    }
    const releaseIndex = batch.isDone ? args.releaseIndex + 1 : args.releaseIndex;
    if (releaseIndex < pointers.length) {
      const jobId = await ctx.scheduler.runAfter(0, internal.variants.refreshBatch, {
        ...args, releaseIndex, cursor: batch.isDone ? null : batch.continueCursor,
      });
      await ctx.db.patch(state._id, { jobId });
    }
    return null;
  },
});
