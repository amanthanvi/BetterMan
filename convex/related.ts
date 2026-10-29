import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { pageByNameAndSection } from "./_releaseLookups";
import { cachedRelatedItem } from "./_relatedLinks";
import { DATASET_STAGES, DISTROS } from "./lib";
import { datasetStageValidator, distroValidator } from "./schema";
import { verifyDeclaredManifest } from "./_releaseManifest";
import { startLegacyManifestVerification } from "./manifest";

const BACKFILL_BATCH_SIZE = 500;
export const MAX_BACKFILL_ATTEMPTS = 3;

async function backfillStopped(ctx: QueryCtx | MutationCtx, release: Doc<"datasetReleases">): Promise<boolean> {
  const version = release.relatedMetadataVersion ?? 0;
  if (release.relatedMetadataCompletedVersion === version || release.relatedMetadataBackfillVersion !== version
    || (release.relatedMetadataBackfillAttempts ?? 1) < MAX_BACKFILL_ATTEMPTS || !release.relatedMetadataBackfillJobId) return false;
  const job = await ctx.db.system.get(release.relatedMetadataBackfillJobId);
  return job?.state.kind === "failed";
}

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
      backfillStopped: v.boolean(),
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
          backfillStopped: release ? await backfillStopped(ctx, release) : false,
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
  let failed = false;
  if (release.relatedMetadataBackfillJobId) {
    const job = await ctx.db.system.get(release.relatedMetadataBackfillJobId);
    if (job && (job.state.kind === "pending" || job.state.kind === "inProgress")) return true;
    failed = job?.state.kind === "failed";
  }
  const sameVersion = release.relatedMetadataBackfillVersion === version;
  const previousAttempts = sameVersion ? release.relatedMetadataBackfillAttempts ?? 1 : 0;
  if (failed && previousAttempts >= MAX_BACKFILL_ATTEMPTS) throw new Error("RELATED_METADATA_BACKFILL_FAILED");
  const attempts = failed ? previousAttempts + 1 : Math.max(1, previousAttempts);
  // Polls join the live chain; failed/canceled jobs resume from the persisted
  // cursor for this version. Completed entries remain idempotent.
  const jobId = await ctx.scheduler.runAfter(0, internal.related.backfillRelease, {
    datasetReleaseId: release.datasetReleaseId,
  });
  await ctx.db.patch(release._id, {
    relatedMetadataBackfillAttempts: attempts,
    relatedMetadataBackfillJobId: jobId,
    relatedMetadataBackfillCursor: release.relatedMetadataBackfillVersion === version ? release.relatedMetadataBackfillCursor ?? null : null,
    relatedMetadataBackfillVersion: version,
  });
  return true;
}

// Deployment entrypoint: at most two stage pointers per supported distro.
export const backfillActiveReleases = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.number(), skipped: v.number(),
    stopped: v.array(v.object({ datasetReleaseId: v.string(), distro: distroValidator,
      error: v.literal("RELATED_METADATA_BACKFILL_FAILED") })),
  }),
  handler: async (ctx) => {
    const seen = new Set<Doc<"datasetReleases">["_id"]>();
    let scheduled = 0;
    let skipped = 0;
    const stopped: Array<{ datasetReleaseId: string; distro: Doc<"datasetReleases">["distro"]; error: "RELATED_METADATA_BACKFILL_FAILED" }> = [];
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
        // A terminal batch is an operator repair, not a reason to roll back
        // scheduling for every other distro in this deployment transaction.
        if (await backfillStopped(ctx, release)) {
          stopped.push({ datasetReleaseId: release.datasetReleaseId, distro: release.distro, error: "RELATED_METADATA_BACKFILL_FAILED" });
          continue;
        }
        let manifestPending = false;
        if (release.manifestBasis === "declared") await verifyDeclaredManifest(ctx, release);
        else manifestPending = await startLegacyManifestVerification(ctx, release);
        if (!release.sealed) await ctx.db.patch(release._id, { sealed: true });
        const metadataPending = await scheduleRelatedMetadataBackfill(ctx, release);
        if (manifestPending || metadataPending) scheduled += 1;
        else skipped += 1;
      }
    }
    return { scheduled, skipped, stopped };
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
      if (link.toMissing || cachedRelatedItem(link)) continue;
      const target = await pageByNameAndSection(ctx, {
        releaseId: release._id,
        name: link.toName,
        section: link.toSection,
      });
      await ctx.db.patch(link._id, target
        ? { toTitle: target.title, toDescription: target.description }
        : { toMissing: true });
      updated += 1;
    }

    if (!batch.isDone) {
      const jobId = await ctx.scheduler.runAfter(0, internal.related.backfillRelease, {
        datasetReleaseId: args.datasetReleaseId,
      });
      await ctx.db.patch(release._id, {
        relatedMetadataBackfillAttempts: 1,
        relatedMetadataBackfillJobId: jobId,
        relatedMetadataBackfillCursor: batch.continueCursor,
        relatedMetadataBackfillVersion: version,
      });
    } else {
      await ctx.db.patch(release._id, {
        relatedMetadataCompletedVersion: version,
        relatedMetadataBackfillAttempts: undefined,
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


// After repairing a terminal failure, an operator explicitly re-arms the same
// cursor. Ordinary activation polling cannot grant itself another retry budget.
export const retryFailedBackfill = internalMutation({
  args: { datasetReleaseId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const release = await ctx.db.query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId)).unique();
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    if (release.pruning) throw new Error("RELEASE_PRUNING");
    if (!release.sealed || !release.manifestVerified) throw new Error("RELEASE_MANIFEST_UNVERIFIED");
    const job = release.relatedMetadataBackfillJobId ? await ctx.db.system.get(release.relatedMetadataBackfillJobId) : null;
    if (job && (job.state.kind === "pending" || job.state.kind === "inProgress")) throw new Error("RELATED_METADATA_BACKFILL_RUNNING");
    await ctx.db.patch(release._id, { relatedMetadataBackfillAttempts: 0 });
    return null;
  },
});
