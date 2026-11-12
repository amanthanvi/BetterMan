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

async function setup(served = true) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const releaseId = await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "debian-r", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
      ingestedAt: "2026-11-01T00:00:00Z", pageCount: 1, sealed: true,
    });
    if (served) await point(ctx, releaseId);
    const pageId = await ctx.db.insert("manPages", {
      releaseId, datasetReleaseId: "debian-r", externalId: "tar", locale: "en", distro: "debian", name: "tar",
      section: "1", sitemapPage: 1, title: "tar", description: "archiver", sourcePath: "tar", contentSha256: "tar",
      hasParseWarnings: false, verifiedFlagUsage: [{ flag: "-x", count: 2, source: "tldr" }],
    });
    for (const flag of optionKeys("-x, --extract")) await ctx.db.insert("manPageOptionFlags", {
      releaseId, pageId, nameNorm: "tar", section: "1", flag, flags: "-x, --extract", anchorId: "x",
    });
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

it("does not queue another pass when the release is retired during one", async () => {
  vi.useFakeTimers();
  const { t, releaseId } = await setup();
  await completeFirstPass(t);
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  // Start the refresh pass, then retire the release and ask again mid-pass.
  vi.advanceTimersByTime(15 * 60_000);
  await t.finishInProgressScheduledFunctions();
  await t.run(async (ctx) => {
    for (const pointer of await ctx.db.query("activeReleases").collect()) await ctx.db.delete(pointer._id);
  });
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  await finish(t);
  expect(await pendingPasses(t)).toHaveLength(0);
  expect(await statusOf(t, releaseId)).toMatchObject({ generation: 2, completedVersion: TASK_PHRASE_VERSION, rescanFlags: true });
});

it("creates no backfill for a release that is still uploading", async () => {
  vi.useFakeTimers();
  const { t, releaseId } = await setup(false);
  await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
  expect(await statusOf(t, releaseId)).toBeNull();
  expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
});
