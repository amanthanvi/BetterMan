/// <reference types="vite/client" />
// Flag refreshes rescan a whole release, so only served releases run them (#538).
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { optionKeys } from "./_optionFlags";
import { TASK_PHRASE_VERSION } from "./taskPhrases";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;

afterEach(() => vi.useRealTimers());

async function setup(served = true, pages = 1) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const releaseId = await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "debian-r", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
      ingestedAt: "2026-11-01T00:00:00Z", pageCount: pages, sealed: true,
    });
    if (served) await point(ctx, releaseId);
    for (let i = 0; i < pages; i++) {
      const name = i ? `tar${String(i).padStart(2, "0")}` : "tar";
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId: "debian-r", externalId: name, locale: "en", distro: "debian", name,
        section: "1", sitemapPage: 1, title: name, description: "archiver", sourcePath: name, contentSha256: name,
        hasParseWarnings: false, verifiedFlagUsage: [{ flag: "-x", count: 2, source: "tldr" }],
      });
      for (const flag of optionKeys("-x, --extract")) await ctx.db.insert("manPageOptionFlags", {
        releaseId, pageId, nameNorm: name, section: "1", flag, flags: "-x, --extract", anchorId: "x",
      });
    }
    return releaseId;
  });
  return { t, releaseId };
}

async function point(ctx: MutationCtx, releaseId: Id<"datasetReleases">) {
  await ctx.db.insert("activeReleases", {
    stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "debian-r", activatedAt: "2026-11-01T00:00:00Z",
  });
}

const statusOf = (t: Harness, releaseId: Id<"datasetReleases">) => t.run((ctx) =>
  ctx.db.query("taskPhraseBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).unique());
const pendingPasses = (t: Harness) => t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
  .filter((job) => job.name === "taskPhrases:backfillRelease" && job.state.kind === "pending"));
const finish = (t: Harness) => t.finishAllScheduledFunctions(() => vi.runAllTimers());

async function completeFirstPass(t: Harness) {
  await t.mutation(internal.taskPhrases.backfillActiveReleases, {});
  await finish(t);
}

const retire = (t: Harness) => t.run(async (ctx) => {
  for (const pointer of await ctx.db.query("activeReleases").collect()) await ctx.db.delete(pointer._id);
});

it("waits before a refresh pass so a burst of requests shares it", async () => {
  vi.useFakeTimers();
  const { t, releaseId } = await setup();
  await completeFirstPass(t);
  for (let i = 0; i < 20; i++) await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  const passes = await pendingPasses(t);
  expect(passes).toHaveLength(1);
  // Fifteen minutes, not seconds: a generation run's updates arrive over minutes.
  expect(passes[0].scheduledTime - Date.now()).toBeGreaterThanOrEqual(15 * 60_000 - 1000);
  await finish(t);
  expect(await statusOf(t, releaseId)).toMatchObject({ generation: 2, completedVersion: TASK_PHRASE_VERSION, rescanFlags: false });
});

it("marks a retired release stale instead of rescanning it, and refreshes it when it is served again", async () => {
  vi.useFakeTimers();
  const { t, releaseId } = await setup();
  await completeFirstPass(t);
  expect(await statusOf(t, releaseId)).toMatchObject({ generation: 1, completedVersion: TASK_PHRASE_VERSION });
  await t.run(async (ctx) => {
    for (const pointer of await ctx.db.query("activeReleases").collect()) await ctx.db.delete(pointer._id);
  });
  for (let i = 0; i < 3; i++) await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  expect(await pendingPasses(t)).toHaveLength(0);
  expect(await statusOf(t, releaseId)).toMatchObject({ generation: 1, completedVersion: TASK_PHRASE_VERSION, rescanFlags: true });
  // Activation (and the deploy entrypoint) honours the marker.
  await t.run((ctx) => point(ctx, releaseId));
  expect(await t.mutation(internal.taskPhrases.backfillActiveReleases, {})).toMatchObject({ scheduled: 1, complete: 0 });
  await finish(t);
  const release = await t.run((ctx) => ctx.db.get(releaseId));
  expect(await statusOf(t, releaseId)).toMatchObject({ generation: 2, completedVersion: TASK_PHRASE_VERSION, rescanFlags: false });
  expect(release?.flagSearchGeneration).toBe(2);
  expect(await t.mutation(internal.taskPhrases.backfillActiveReleases, {})).toMatchObject({ scheduled: 0, complete: 1 });
});

it("pauses a refresh pass whose release is retired before it starts, and resumes it on activation", async () => {
  vi.useFakeTimers();
  const { t, releaseId } = await setup(true, 10);
  await completeFirstPass(t);
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  await retire(t);
  await finish(t);
  // Nothing scanned, the published generation untouched, nothing queued.
  const paused = await statusOf(t, releaseId);
  expect(paused).toMatchObject({ generation: 2, candidateGeneration: 2, scanned: 0 });
  expect(paused?.completedVersion).toBeUndefined();
  expect((await t.run((ctx) => ctx.db.get(releaseId)))?.flagSearchGeneration).toBe(1);
  expect(await pendingPasses(t)).toHaveLength(0);
  await t.run((ctx) => point(ctx, releaseId));
  expect(await t.mutation(internal.taskPhrases.backfillActiveReleases, {})).toMatchObject({ scheduled: 1 });
  await finish(t);
  expect(await statusOf(t, releaseId)).toMatchObject({ candidateGeneration: 2, scanned: 10, completedVersion: TASK_PHRASE_VERSION });
  expect((await t.run((ctx) => ctx.db.get(releaseId)))?.flagSearchGeneration).toBe(2);
});

it("pauses mid-pass when its release is retired, keeps later requests, and resumes from the cursor", async () => {
  vi.useFakeTimers();
  const { t, releaseId } = await setup(true, 10);
  await completeFirstPass(t);
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  // Run only the first four-page batch of the refresh pass.
  vi.advanceTimersByTime(15 * 60_000);
  await t.finishInProgressScheduledFunctions();
  expect(await statusOf(t, releaseId)).toMatchObject({ generation: 2, scanned: 4 });
  await retire(t);
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  await finish(t);
  const paused = await statusOf(t, releaseId);
  expect(paused).toMatchObject({ scanned: 4, rescanFlags: true });
  expect(paused?.completedVersion).toBeUndefined();
  expect(await pendingPasses(t)).toHaveLength(0);
  await t.run((ctx) => point(ctx, releaseId));
  await t.mutation(internal.taskPhrases.backfillActiveReleases, {});
  await finish(t);
  // The resumed pass finishes from its cursor; the request made while retired runs one more.
  const status = await statusOf(t, releaseId);
  expect(status).toMatchObject({ completedVersion: TASK_PHRASE_VERSION, rescanFlags: false, scanned: 10 });
  expect(status!.candidateGeneration).toBeGreaterThan(2);
  expect((await t.run((ctx) => ctx.db.get(releaseId)))?.flagSearchGeneration).toBe(status!.candidateGeneration);
});

it("waits for the page updates it follows before joining a pass (#538 review)", async () => {
  vi.useFakeTimers();
  const { t, releaseId } = await setup();
  await completeFirstPass(t);
  // A pass is due in ten seconds when a page update is still waiting to run.
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  vi.advanceTimersByTime(15 * 60_000 - 10_500);
  const pageId = (await t.run((ctx) => ctx.db.query("manPages").first()))!._id;
  const update = await t.run((ctx) => ctx.scheduler.runAfter(11_000, internal.derived.setVerifiedFlagUsage, {
    pageId, usage: [{ flag: "-x", count: 5, source: "tldr" }], refresh: false,
  }));
  // The coalesced request fires first: it must not join the pass that would read the old usage.
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId, after: [update] });
  const deferred = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
    .filter((job) => job.name === "taskPhrases:requestFlagRefresh" && job.state.kind === "pending"));
  expect(deferred.map((job) => job.args[0].after)).toEqual([[update]]);
  await finish(t);
  const candidate = await t.run(async (ctx) => {
    const release = (await ctx.db.get(releaseId))!;
    return ctx.db.query("flagSearchCandidates").withIndex("by_releaseId_and_generation_and_flag", (q) =>
      q.eq("releaseId", releaseId).eq("generation", release.flagSearchGeneration).eq("flag", "-x")).unique();
  });
  expect(candidate?.candidates[0].usage.find((u) => u.flag === "-x")?.count).toBe(5);
});

it("creates no backfill for a release that is still uploading", async () => {
  vi.useFakeTimers();
  const { t, releaseId } = await setup(false);
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  expect(await statusOf(t, releaseId)).toBeNull();
  expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
});
