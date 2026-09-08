import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { pageByNameAndSection } from "./_releaseLookups";
import { cachedRelatedItem } from "./_relatedLinks";
import { DATASET_STAGES, DISTROS } from "./lib";
import { datasetStageValidator, distroValidator } from "./schema";
import { verifyDeclaredManifest } from "./_releaseManifest";
import { startLegacyManifestVerification } from "./manifest";

const BACKFILL_BATCH_SIZE = 100;

export const activeMetadataStatus = internalQuery({
  args: {},
  returns: v.object({
    complete: v.boolean(),
    releases: v.array(v.object({
      datasetReleaseId: v.string(),
      stage: datasetStageValidator,
      distro: distroValidator,
      currentVersion: v.union(v.number(), v.null()),
      completedVersion: v.union(v.number(), v.null()),
      sealed: v.boolean(),
      manifestVerified: v.boolean(),
      manifestError: v.union(v.string(), v.null()),
      complete: v.boolean(),
    })),
  }),
  handler: async (ctx) => {
    const releases = [];
    for (const stage of DATASET_STAGES) {
      for (const distro of DISTROS) {
        // Schema validators bound the supported pairs. Unique lookups fail
        // closed on duplicate pointers rather than hiding them behind a cap.
        const pointer = await ctx.db
          .query("activeReleases")
          .withIndex("by_stage_and_locale_and_distro", (q) =>
            q.eq("stage", stage).eq("locale", "en").eq("distro", distro),
          )
          .unique();
        if (!pointer) continue;
        const release = await ctx.db.get(pointer.releaseId);
        const currentVersion = release ? release.relatedMetadataVersion ?? 0 : null;
        const completedVersion = release?.relatedMetadataCompletedVersion ?? null;
        const sealed = release?.sealed === true;
        releases.push({
          datasetReleaseId: pointer.datasetReleaseId,
          stage,
          distro,
          currentVersion,
          completedVersion,
          sealed,
          manifestVerified: release?.manifestVerified === true,
          manifestError: release?.manifestError ?? null,
          complete: sealed && release?.manifestVerified === true && !release?.pruning && currentVersion !== null && completedVersion === currentVersion,
        });
      }
    }
    return { complete: releases.length > 0 && releases.every((release) => release.complete), releases };
  },
});

export async function scheduleRelatedMetadataBackfill(
  ctx: MutationCtx,
  release: Doc<"datasetReleases">,
): Promise<boolean> {
  if (release.pruning) throw new Error("RELEASE_PRUNING");
  const version = release.relatedMetadataVersion ?? 0;
  if (release.relatedMetadataCompletedVersion === version) return false;
  if (release.relatedMetadataBackfillJobId) {
    const job = await ctx.db.system.get(release.relatedMetadataBackfillJobId);
    if (job && (job.state.kind === "pending" || job.state.kind === "inProgress")) return true;
  }
  // Polls join the live chain; failed/canceled jobs may restart from the first
  // bounded batch. Completed entries are skipped, so restarts are idempotent.
  const jobId = await ctx.scheduler.runAfter(0, internal.related.backfillRelease, {
    datasetReleaseId: release.datasetReleaseId,
  });
  await ctx.db.patch(release._id, {
    relatedMetadataBackfillJobId: jobId, relatedMetadataBackfillCursor: null, relatedMetadataBackfillVersion: version,
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
      for (const distro of DISTROS) {
        const pointer = await ctx.db
          .query("activeReleases")
          .withIndex("by_stage_and_locale_and_distro", (q) =>
            q.eq("stage", stage).eq("locale", "en").eq("distro", distro),
          )
          .unique();
        if (!pointer) continue;
        if (seen.has(pointer.releaseId)) continue;
        seen.add(pointer.releaseId);
        const release = await ctx.db.get(pointer.releaseId);
        if (!release) throw new Error("RELEASE_NOT_FOUND");
        if (release.pruning) throw new Error("RELEASE_PRUNING");
        let manifestPending = false;
        if (release.manifestBasis === "declared") await verifyDeclaredManifest(ctx, release);
        else manifestPending = await startLegacyManifestVerification(ctx, release);
        if (!release.sealed) await ctx.db.patch(release._id, { sealed: true });
        const metadataPending = await scheduleRelatedMetadataBackfill(ctx, release);
        if (manifestPending || metadataPending) scheduled += 1;
        else skipped += 1;
      }
    }
    return { scheduled, skipped };
  },
});

// Sealed releases permit only these derived link/completion metadata writes.
export const backfillRelease = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    // Already-queued jobs retain the previous argument shape across deploys.
    // Accept those fields for compatibility, but never use them as progress.
    cursor: v.optional(v.union(v.string(), v.null())),
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
    if (!release || release.pruning) {
      return { processed: 0, updated: 0, isDone: true, continueCursor: null };
    }
    if (!release.sealed) throw new Error("RELEASE_NOT_SEALED");
    if (release.relatedMetadataCompletedVersion === (release.relatedMetadataVersion ?? 0)) {
      return { processed: 0, updated: 0, isDone: true, continueCursor: null };
    }

    const version = release.relatedMetadataVersion ?? 0;
    // The release owns progress. No internal caller can jump to an arbitrary
    // page and mark an unchecked prefix complete by supplying a cursor.
    const cursor = release.relatedMetadataBackfillVersion === version ? release.relatedMetadataBackfillCursor ?? null : null;

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
      const jobId = await ctx.scheduler.runAfter(0, internal.related.backfillRelease, {
        datasetReleaseId: args.datasetReleaseId,
      });
      await ctx.db.patch(release._id, {
        relatedMetadataBackfillJobId: jobId,
        relatedMetadataBackfillCursor: batch.continueCursor,
        relatedMetadataBackfillVersion: version,
      });
    } else {
      await ctx.db.patch(release._id, {
        relatedMetadataCompletedVersion: version,
        relatedMetadataBackfillJobId: undefined,
        relatedMetadataBackfillCursor: undefined,
        relatedMetadataBackfillVersion: undefined,
      });
    }
    return {
      processed: batch.page.length,
      updated,
      isDone: batch.isDone,
      continueCursor: batch.isDone ? null : batch.continueCursor,
    };
  },
});
