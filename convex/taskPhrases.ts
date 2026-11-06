import { syncFlagCandidates } from "./_flagSearch";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type DatabaseReader, type MutationCtx } from "./_generated/server";
import { DATASET_STAGES, DISTROS } from "./lib";
import { datasetStageValidator, distroValidator } from "./schema";

/**
 * Task-phrase search rows (C5): `manPageTaskPhrases` holds one row per page,
 * per release, whose content hash has generated task phrases. Search filters
 * that index by release and section before its result cap, so pages in other
 * releases or distros never crowd out the active release.
 *
 * Two writers keep it current, both idempotent upserts keyed by release + page:
 * - a per-release backfill over the release's pages, scheduled when a release
 *   is activated and by the deploy entrypoint (`backfillActiveReleases`), with
 *   durable progress in `taskPhraseBackfills`;
 * - `syncHashes`, scheduled whenever a generated record is written or
 *   suppressed, over every page with that content hash.
 * Before a release's backfill completes, worded queries match only the pages
 * whose rows exist; other search results are unaffected.
 */
export const TASK_PHRASE_VERSION = 5;
const BACKFILL_PAGES = 4;
const FLAG_REFRESH_DELAY_MS = 30_000;
const SYNC_PAGES = 256;
const MAX_BACKFILL_ATTEMPTS = 3;

/** Task phrases as one searchable string; undefined when there are none or the part is suppressed. */
export function taskTextFor(row: Doc<"manPageGenerated"> | null): string | undefined {
  if (!row || row.suppressed?.includes("generated")) return undefined;
  const phrases = row.generated?.taskPhrases ?? [];
  return phrases.length ? phrases.join("\n") : undefined;
}

/** Make one page's row match its generated record. Returns whether it wrote. */
export async function syncTaskRow(ctx: MutationCtx, page: Doc<"manPages">, generated: Doc<"manPageGenerated"> | null): Promise<boolean> {
  const taskText = taskTextFor(generated);
  const existing = await ctx.db.query("manPageTaskPhrases")
    .withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", page.releaseId).eq("pageId", page._id))
    .unique();
  if (!taskText) {
    if (!existing) return false;
    await ctx.db.delete(existing._id);
    return true;
  }
  const row = {
    releaseId: page.releaseId, pageId: page._id, contentSha256: page.contentSha256,
    name: page.name, section: page.section, title: page.title, description: page.description, taskText, popularityScore: page.popularityScore,
  };
  if (!existing) {
    await ctx.db.insert("manPageTaskPhrases", row);
    return true;
  }
  if (existing.taskText === taskText && existing.contentSha256 === page.contentSha256 && existing.popularityScore === page.popularityScore) return false;
  await ctx.db.patch(existing._id, row);
  return true;
}

async function generatedFor(ctx: MutationCtx, contentSha256: string) {
  return await ctx.db.query("manPageGenerated").withIndex("by_contentSha256", (q) => q.eq("contentSha256", contentSha256)).unique();
}

/**
 * Bring every page with these content hashes up to date, at most SYNC_PAGES
 * pages per run, continuing from the hash and the last page it handled (a
 * stable creation-time + id key, as `generated.propagateFlagUsage` does).
 */
export const syncHashes = internalMutation({
  args: {
    contentSha256s: v.array(v.string()),
    after: v.optional(v.object({ creationTime: v.number(), id: v.id("manPages") })),
  },
  handler: async (ctx, args) => {
    const hashes = [...new Set(args.contentSha256s)];
    let budget = SYNC_PAGES;
    for (let index = 0; index < hashes.length; index++) {
      const contentSha256 = hashes[index];
      const after = index === 0 ? args.after : undefined;
      const generated = await generatedFor(ctx, contentSha256);
      const pages = ctx.db.query("manPages").withIndex("by_contentSha256", (q) => after
        ? q.eq("contentSha256", contentSha256).gte("_creationTime", after.creationTime)
        : q.eq("contentSha256", contentSha256));
      for await (const page of pages) {
        if (after && page._creationTime === after.creationTime && page._id === after.id) continue;
        if (budget === 0) {
          await ctx.scheduler.runAfter(0, internal.taskPhrases.syncHashes, {
            contentSha256s: hashes.slice(index), after: { creationTime: page._creationTime, id: page._id },
          });
          return { continued: true };
        }
        budget -= 1;
        const release = await ctx.db.get(page.releaseId);
        if (!release || release.pruning) continue;
        await syncTaskRow(ctx, page, generated);
      }
    }
    return { continued: false };
  },
});

/**
 * Schedule (or join) a release's backfill. Returns false once it is complete
 * for the current version. A failed job resumes from its persisted cursor, up
 * to MAX_BACKFILL_ATTEMPTS; past that it throws TASK_PHRASE_BACKFILL_FAILED.
 */
export async function scheduleTaskPhraseBackfill(ctx: MutationCtx, release: Doc<"datasetReleases">, refreshFlags = false): Promise<boolean> {
  const status = await ctx.db.query("taskPhraseBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique();
  if (!refreshFlags && status?.completedVersion === TASK_PHRASE_VERSION && status.version === TASK_PHRASE_VERSION) return false;
  let failed = false;
  if (status?.jobId) {
    const job = await ctx.db.system.get(status.jobId);
    if (status.version === TASK_PHRASE_VERSION && status.completedVersion !== TASK_PHRASE_VERSION && job && (job.state.kind === "pending" || job.state.kind === "inProgress")) {
      if (refreshFlags && (job.state.kind === "inProgress" || status.scanned > 0) && !status.rescanFlags) await ctx.db.patch(status._id, { rescanFlags: true });
      return true;
    }
    if (job?.state.kind === "pending") await ctx.scheduler.cancel(status.jobId);
    failed = job?.state.kind === "failed" || job?.state.kind === "canceled";
  }
  const sameVersion = status?.version === TASK_PHRASE_VERSION;
  const attempts = sameVersion ? (status?.attempts ?? 0) : 0;
  if (failed && sameVersion && attempts >= MAX_BACKFILL_ATTEMPTS) throw new Error("TASK_PHRASE_BACKFILL_FAILED");
  const generation = (status?.generation ?? 0) + 1;
  const resume = sameVersion && !refreshFlags && status?.candidateGeneration !== release.flagSearchGeneration;
  const candidateGeneration = resume ? status?.candidateGeneration ?? generation : generation;
  if (!resume && status?.candidateGeneration !== undefined && status.candidateGeneration !== release.flagSearchGeneration) {
    await ctx.scheduler.runAfter(0, internal.taskPhrases.cleanupFlagGeneration, { releaseId: release._id, generation: status.candidateGeneration });
  }
  const jobId = await ctx.scheduler.runAfter(refreshFlags ? FLAG_REFRESH_DELAY_MS : 0, internal.taskPhrases.backfillRelease, { releaseId: release._id, generation });
  const progress = {
    version: TASK_PHRASE_VERSION, generation, candidateGeneration, jobId, clearingFlags: false, rescanFlags: resume ? status?.rescanFlags ?? false : false, attempts: attempts + 1, updatedAt: Date.now(),
    cursor: resume ? status?.cursor ?? null : null,
    scanned: resume ? status?.scanned ?? 0 : 0, written: resume ? status?.written ?? 0 : 0,
  };
  if (status) await ctx.db.patch(status._id, { ...progress, completedVersion: undefined });
  else await ctx.db.insert("taskPhraseBackfills", { releaseId: release._id, ...progress });
  return true;
}

/** One batch of a release's pages; schedules the next batch until the release is done. */
export const backfillRelease = internalMutation({
  args: { releaseId: v.id("datasetReleases"), generation: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const release = await ctx.db.get(args.releaseId);
    const status = await ctx.db.query("taskPhraseBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", args.releaseId)).unique();
    if (!release || release.pruning || !status || status.version !== TASK_PHRASE_VERSION || args.generation !== status.generation || args.generation === undefined) return { done: false };
    if (status.completedVersion === TASK_PHRASE_VERSION) return { done: true };
    const batch = await ctx.db.query("manPages")
      .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", args.releaseId))
      .paginate({ cursor: status.cursor, numItems: BACKFILL_PAGES });
    let written = 0;
    for (const page of batch.page) {
      await syncFlagCandidates(ctx, page, page, status.candidateGeneration);
      if (await syncTaskRow(ctx, page, await generatedFor(ctx, page.contentSha256))) written += 1;
    }
    const progress = { scanned: status.scanned + batch.page.length, written: status.written + written, updatedAt: Date.now() };
    if (batch.isDone) {
      // Publish before queuing another pass: reads retain a completed snapshot throughout updates.
      await ctx.db.patch(release._id, { flagSearchReady: true, flagSearchGeneration: status.candidateGeneration });
      await ctx.db.patch(status._id, { ...progress, cursor: null, completedVersion: TASK_PHRASE_VERSION, attempts: 0, rescanFlags: false });
      if (release.flagSearchGeneration !== status.candidateGeneration) await ctx.scheduler.runAfter(0, internal.taskPhrases.cleanupFlagGeneration, {
        releaseId: release._id, generation: release.flagSearchGeneration,
      });
      if (status.rescanFlags) await scheduleTaskPhraseBackfill(ctx, { ...release, flagSearchReady: true, flagSearchGeneration: status.candidateGeneration }, true);
      return { done: true };
    }
    const jobId = await ctx.scheduler.runAfter(0, internal.taskPhrases.backfillRelease, { releaseId: args.releaseId, generation: args.generation });
    await ctx.db.patch(status._id, { ...progress, cursor: batch.continueCursor, jobId });
    return { done: false };
  },
});

/** Old snapshots are removed in bounded batches after the reader pointer switches. */
export const cleanupFlagGeneration = internalMutation({
  args: { releaseId: v.id("datasetReleases"), generation: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const release = await ctx.db.get(args.releaseId);
    if (!release || release.flagSearchGeneration === args.generation) return null;
    const rows = await ctx.db.query("flagSearchCandidates").withIndex("by_releaseId_and_generation_and_flag", q =>
      q.eq("releaseId", release._id).eq("generation", args.generation)).take(16);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 16) await ctx.scheduler.runAfter(0, internal.taskPhrases.cleanupFlagGeneration, args);
    return null;
  },
});

/** B7 commits page metadata first; requests coalesce into this release's single rebuild chain. */
export const requestFlagRefresh = internalMutation({
  args: { releaseId: v.id("datasetReleases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const release = await ctx.db.get(args.releaseId);
    if (release && !release.pruning) await scheduleTaskPhraseBackfill(ctx, release, true);
    return null;
  },
});

async function activePointers(ctx: { db: DatabaseReader }) {
  const pointers: Array<{ stage: Doc<"activeReleases">["stage"]; distro: Doc<"activeReleases">["distro"]; releaseId: Id<"datasetReleases"> }> = [];
  for (const stage of DATASET_STAGES) {
    for (const distro of DISTROS) {
      const pointer = await ctx.db.query("activeReleases")
        .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", stage).eq("locale", "en").eq("distro", distro))
        .unique();
      if (pointer) pointers.push({ stage, distro, releaseId: pointer.releaseId });
    }
  }
  return pointers;
}

/**
 * Deployment entrypoint, safe to run on every deploy: schedules or joins the
 * backfill of every active release that is not complete for this version.
 */
export const backfillActiveReleases = internalMutation({
  args: {},
  returns: v.object({
    scheduled: v.number(), complete: v.number(),
    stopped: v.array(v.object({ datasetReleaseId: v.string(), error: v.literal("TASK_PHRASE_BACKFILL_FAILED") })),
  }),
  handler: async (ctx) => {
    const seen = new Set<Id<"datasetReleases">>();
    let scheduled = 0, complete = 0;
    const stopped: Array<{ datasetReleaseId: string; error: "TASK_PHRASE_BACKFILL_FAILED" }> = [];
    for (const { releaseId } of await activePointers(ctx)) {
      if (seen.has(releaseId)) continue;
      seen.add(releaseId);
      const release = await ctx.db.get(releaseId);
      if (!release || release.pruning) continue;
      try {
        if (await scheduleTaskPhraseBackfill(ctx, release)) scheduled += 1;
        else complete += 1;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "TASK_PHRASE_BACKFILL_FAILED") throw error;
        stopped.push({ datasetReleaseId: release.datasetReleaseId, error: "TASK_PHRASE_BACKFILL_FAILED" });
      }
    }
    return { scheduled, complete, stopped };
  },
});

const releaseStatus = v.object({
  stage: datasetStageValidator, distro: distroValidator, datasetReleaseId: v.string(),
  state: v.union(v.literal("complete"), v.literal("running"), v.literal("failed"), v.literal("missing")),
  scanned: v.number(), written: v.number(), attempts: v.number(), updatedAt: v.union(v.number(), v.null()),
});

/** Read-only status for `pnpm convex:task-check --prod`: complete only when every active release is. */
export const status = internalQuery({
  args: {},
  returns: v.object({ complete: v.boolean(), version: v.number(), releases: v.array(releaseStatus) }),
  handler: async (ctx) => {
    const releases = [];
    for (const pointer of await activePointers(ctx)) {
      const release = await ctx.db.get(pointer.releaseId);
      if (!release) continue;
      const row = await ctx.db.query("taskPhraseBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique();
      const job = row?.jobId ? await ctx.db.system.get(row.jobId) : null;
      const done = row?.version === TASK_PHRASE_VERSION && row.completedVersion === TASK_PHRASE_VERSION;
      const state = done ? "complete" as const
        : !row || row.version !== TASK_PHRASE_VERSION ? "missing" as const
        : job?.state.kind === "failed" || job?.state.kind === "canceled" ? "failed" as const
        : "running" as const;
      releases.push({ stage: pointer.stage, distro: pointer.distro, datasetReleaseId: release.datasetReleaseId, state,
        scanned: row?.scanned ?? 0, written: row?.written ?? 0, attempts: row?.attempts ?? 0, updatedAt: row?.updatedAt ?? null });
    }
    return { complete: releases.every((release) => release.state === "complete"), version: TASK_PHRASE_VERSION, releases };
  },
});
