/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { Distro } from "./lib";
import { persistOptionSignature, persistPackedSignature } from "./_derivedInputs";
import { decodeSummary } from "./_derivedEncoding";
import { DISTROS } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const MiB = 1024 * 1024;
// Enforce a ceiling with 50% headroom below the real backend's read/write limits.
const TEST_BYTE_LIMIT = 8 * MiB;
const largeOptions = Array.from({ length: 1800 }, (_, i) => ({
  anchorId: `${"a".repeat(250)}${i}`, flags: `--${"f".repeat(70)}${i}`,
}));
const smallOptions = [{ anchorId: "one", flags: "--one" }];
type Harness = TestConvex<typeof schema>;
type Sample = { readBytes: number; writeBytes: number; documentsRead: number; documentsWritten: number };

function measuredHarness() {
  const samples: Sample[] = [];
  const failures = { nextBatch: false };
  const measuredModules = Object.fromEntries(Object.entries(modules).map(([path, load]) => [path, async () => {
    const loaded = await load() as Record<string, unknown>;
    if (!path.endsWith("/derived.ts")) return loaded;
    return Object.fromEntries(Object.entries(loaded).map(([name, value]) => {
      if (name !== "runBatch" || typeof value !== "function") return [name, value];
      const fn = value as unknown as { _handler: (ctx: MutationCtx, args: { locale: string; key: string }) => Promise<unknown> };
      return [name, { ...value, _handler: async (ctx: MutationCtx, args: { locale: string; key: string }) => {
        try {
          if (failures.nextBatch) {
            failures.nextBatch = false;
            throw new Error("Too many bytes read in a single function execution (limit: 16777216 bytes)");
          }
          return await fn._handler(ctx, args);
        } finally {
          // These are the actual transaction counters used by convex-test's
          // limit enforcement, not a port of the builder's admission estimate.
          const metrics = await ctx.meta.getTransactionMetrics();
          samples.push({ readBytes: metrics.bytesRead.used, writeBytes: metrics.bytesWritten.used,
            documentsRead: metrics.documentsRead.used, documentsWritten: metrics.documentsWritten.used });
        }
      } }];
    }));
  }])) as typeof modules;
  const t = convexTest({ schema, modules: measuredModules,
    transactionLimits: { bytesRead: TEST_BYTE_LIMIT, bytesWritten: TEST_BYTE_LIMIT } });
  return { t, samples, failures };
}

async function makeRelease(t: Harness, distro: Distro, version: string, previous?: Id<"datasetReleases">) {
  return t.run((ctx) => ctx.db.insert("datasetReleases", {
    datasetReleaseId: `${distro}-${version}`, distro, locale: "en", imageRef: "test", imageDigest: "test",
    ingestedAt: `2026-${version}-01T00:00:00Z`, pageCount: 0, sealed: true, manifestVerified: true,
    ...(previous ? { previousProdReleaseId: previous } : {}),
  }));
}
async function addPage(t: Harness, releaseId: Id<"datasetReleases">, name: string, large: boolean) {
  return t.run(async (ctx) => {
    const release = (await ctx.db.get(releaseId))!;
    const pageId = await ctx.db.insert("manPages", { releaseId, datasetReleaseId: release.datasetReleaseId,
      distro: release.distro, locale: "en", externalId: name, name, section: "1", sitemapPage: 0,
      title: name, description: "byte-budget regression", sourcePath: name,
      contentSha256: `${release.datasetReleaseId}:${name}`, sourcePackageVersion: release.datasetReleaseId,
      hasParseWarnings: false });
    await ctx.db.insert("manPageContents", { pageId, docJson: "{}" });
    await persistOptionSignature(ctx, pageId, large ? largeOptions : smallOptions, 1);
    return pageId;
  });
}
async function point(t: Harness, releaseId: Id<"datasetReleases">) {
  await t.run(async (ctx) => {
    const release = (await ctx.db.get(releaseId))!;
    const previous = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", "prod").eq("locale", "en").eq("distro", release.distro)).unique();
    const data = { stage: "prod" as const, locale: "en", distro: release.distro, releaseId,
      datasetReleaseId: release.datasetReleaseId, activatedAt: "now" };
    if (previous) await ctx.db.replace(previous._id, data);
    else await ctx.db.insert("activeReleases", data);
  });
}
async function finish(t: Harness) {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers(), 500);
}
function expectBounded(samples: Sample[]) {
  expect(samples.length).toBeGreaterThan(0);
  for (const sample of samples) {
    expect(sample.readBytes).toBeLessThanOrEqual(TEST_BYTE_LIMIT);
    expect(sample.writeBytes).toBeLessThanOrEqual(TEST_BYTE_LIMIT);
  }
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("charges large predecessor inputs and old detail chunks across promotions before admitting each transaction", async () => {
  vi.useFakeTimers();
  const { t, samples } = measuredHarness();
  const old = await makeRelease(t, "debian", "08");
  const current = await makeRelease(t, "debian", "09", old);
  const next = await makeRelease(t, "debian", "10", current);
  for (let i = 0; i < 32; i++) {
    const name = `manual-${String(i).padStart(2, "0")}`;
    await addPage(t, old, name, true);
    await addPage(t, current, name, false);
    await addPage(t, next, name, false);
  }
  const signatureBytes = await t.run(async (ctx) => {
    const page = await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", old)).first();
    return page!.optionSignatureBytes;
  });
  expect(signatureBytes).toBe(631_381);
  await point(t, old);
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ healthy: true, state: "complete" });
  const oldRows = await t.run((ctx) => ctx.db.query("manPageDerived").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", old)).take(33));
  let chunkCount = 0, chunkBytes = 0;
  for (const row of oldRows) {
    const size = await t.run(async (ctx) => {
      const chunks = await ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", row._id)).take(65);
      return { count: chunks.length, bytes: chunks.reduce((sum, chunk) => sum + new TextEncoder().encode(chunk.json).length, 0) };
    });
    chunkCount += size.count; chunkBytes += size.bytes;
    if (row.name === "manual-00" || Number(row.name!.slice(-2)) % 2 === 0) {
      // Existing production rows predate detail-size metadata. Their chunks
      // must be drained without first reading the entire legacy payload.
      await t.run((ctx) => ctx.db.patch(row._id, { detailBytes: undefined, detailChunkCount: undefined }));
    }
  }
  expect(chunkCount).toBeGreaterThan(32);
  expect(chunkBytes).toBeGreaterThan(16 * MiB);
  samples.length = 0;
  await point(t, current);
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ healthy: true, state: "complete", failedPages: 0, pendingJobs: 0 });
  expectBounded(samples);
  expect(samples.some((sample) => sample.readBytes > 631_381)).toBe(true);
  expect(samples.length).toBeGreaterThan(4);
  await point(t, next);
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ healthy: true, state: "complete", pendingJobs: 0 });
  expectBounded(samples);
  const rows = await t.run((ctx) => ctx.db.query("manPageDerived").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", next)).take(33));
  expect(rows).toHaveLength(32);
}, 60_000);

it("isolates a single logical page whose valid peer/history inputs exceed admission without blocking later pages", async () => {
  vi.useFakeTimers(); const { t, samples } = measuredHarness();
  for (const distro of ["debian", "ubuntu", "fedora", "arch", "alpine", "freebsd", "macos"] as const) {
    const old = await makeRelease(t, distro, "08");
    const current = await makeRelease(t, distro, "09", old);
    await addPage(t, old, "a-oversized", true);
    await addPage(t, current, "a-oversized", true);
    await addPage(t, old, "z-good", false);
    await addPage(t, current, "z-good", false);
    await point(t, current);
  }
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  const status = await t.query(internal.derived.status, {});
  expect(status).toMatchObject({ healthy: false, state: "failed", pendingJobs: 0 });
  expect(status.failedPages).toBeGreaterThan(0);
  const rows = await t.run((ctx) => ctx.db.query("manPageDerived").take(20));
  expect(rows.filter((row) => row.name === "z-good")).toHaveLength(7);
  expect(rows.some((row) => row.name === "a-oversized")).toBe(false);
  expectBounded(samples);
}, 60_000);

it("replans after a scheduled too-large-batch failure and drains later pages and promotions", async () => {
  vi.useFakeTimers(); const { t, samples, failures } = measuredHarness();
  const old = await makeRelease(t, "debian", "08");
  const current = await makeRelease(t, "debian", "09", old);
  const next = await makeRelease(t, "debian", "10", current);
  for (let i = 0; i < 32; i++) {
    const name = `manual-${String(i).padStart(2, "0")}`;
    await addPage(t, old, name, true);
    await addPage(t, current, name, false);
    await addPage(t, next, name, false);
  }
  await point(t, current);
  await t.mutation(internal.derived.rebuildActive, {});
  const before = await t.run((ctx) => ctx.db.query("derivedScanJobs").withIndex("by_locale", (q) => q.eq("locale", "en")).first());
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  failures.nextBatch = true;
  await finish(t);
  expect(errors).toHaveBeenCalled();
  expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", error: "SCHEDULED_BATCH_FAILED" });
  const after = await t.run((ctx) => ctx.db.query("derivedScanJobs").withIndex("by_locale", (q) => q.eq("locale", "en")).first());
  expect(after?.cursor).toBe(before?.cursor);
  expect(await t.mutation(internal.derived.rebuildActive, {})).toBe(true);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ batchPageLimit: 16 });
  await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ healthy: true, state: "complete", pendingJobs: 0 });
  expectBounded(samples);
  await point(t, next);
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ healthy: true, state: "complete", pendingJobs: 0 });
  expectBounded(samples);
}, 60_000);


it("drains legacy detail chunks in bounded transactions and hides a partially cleaned row", async () => {
  vi.useFakeTimers(); const { t, samples } = measuredHarness();
  const release = await makeRelease(t, "debian", "08");
  await addPage(t, release, "a-legacy", true);
  await addPage(t, release, "z-good", false);
  await point(t, release);
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  const legacy = await t.run((ctx) => ctx.db.query("manPageDerived")
    .withIndex("by_locale_and_distro_and_name_and_section", (q) => q.eq("locale", "en").eq("distro", "debian").eq("name", "a-legacy").eq("section", "1")).unique());
  await t.run((ctx) => ctx.db.patch(legacy!._id, { detailBytes: undefined, detailChunkCount: undefined }));
  samples.length = 0;
  await t.mutation(internal.derived.rebuildActive, { force: true });
  const build = await t.run((ctx) => ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", "en")).unique());
  const result = await t.mutation(internal.derived.runBatch, { locale: "en", key: build!.key });
  expect(result.processed).toBe(0);
  expect(await t.run((ctx) => ctx.db.get(legacy!._id))).toMatchObject({ cleanupPending: true });
  const page = await t.query(internal.content.getManByNameAndSectionReadModel, { stage: "prod", distro: "debian", name: "a-legacy", section: "1" });
  expect(page?.kind === "page" && page.data.derived).toBeNull();
  await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ healthy: true, state: "complete", pendingJobs: 0 });
  expect((await t.run((ctx) => ctx.db.get(legacy!._id)))?.cleanupPending).not.toBe(true);
  expectBounded(samples);
}, 60_000);

it("shrinks successive failed batches to one then isolates that page so the queue and retry can progress", async () => {
  vi.useFakeTimers(); const { t, samples, failures } = measuredHarness();
  const release = await makeRelease(t, "debian", "09");
  await addPage(t, release, "a-failed", false);
  await addPage(t, release, "z-good", false);
  await point(t, release);
  await t.mutation(internal.derived.rebuildActive, {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const limit of [16, 8, 4, 2, 1, 1]) {
    failures.nextBatch = true;
    await finish(t);
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", error: "SCHEDULED_BATCH_FAILED" });
    expect(await t.mutation(internal.derived.rebuildActive, {})).toBe(true);
    expect(await t.query(internal.derived.status, {})).toMatchObject({ batchPageLimit: limit });
  }
  const isolated = await t.run((ctx) => ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", "en")).unique());
  expect(isolated?.isolateNext).toBe(true);
  await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", failedPages: 1, pendingJobs: 0, error: "DERIVED_PAGES_UNAVAILABLE" });
  const rows = await t.run((ctx) => ctx.db.query("manPageDerived").take(3));
  expect(rows.map((row) => row.name)).toEqual(["z-good"]);
  const retry = await t.run((ctx) => ctx.db.query("derivedRetryPages").withIndex("by_locale_and_key", (q) => q.eq("locale", "en")).unique());
  expect(retry).toMatchObject({ name: "a-failed", error: "DERIVED_TRANSACTION_LIMIT" });
  // A later repair/resume can recover the isolated page without a full restart.
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "complete", healthy: true, failedPages: 0, pendingJobs: 0 });
  expectBounded(samples);
}, 60_000);

it("keeps a fully drained legacy row hidden while another distro's chunks still need cleanup", async () => {
  vi.useFakeTimers(); const { t, samples } = measuredHarness();
  const medium = Array.from({ length: 1800 }, (_, i) => ({ anchorId: `${"a".repeat(200)}${i}`, flags: `--${"f".repeat(70)}${i}` }));
  for (const distro of ["debian", "ubuntu"] as const) {
    const release = await makeRelease(t, distro, "08");
    const id = await addPage(t, release, "legacy", false);
    await t.run((ctx) => persistOptionSignature(ctx, id, medium, 1));
    await point(t, release);
  }
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  const rows = await t.run((ctx) => ctx.db.query("manPageDerived").take(3));
  expect(rows).toHaveLength(2);
  for (const row of rows) await t.run((ctx) => ctx.db.patch(row._id, { detailBytes: undefined, detailChunkCount: undefined }));
  await t.mutation(internal.derived.rebuildActive, { force: true });
  const build = await t.run((ctx) => ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", "en")).unique());
  let partial = false;
  for (let step = 0; step < 20 && !partial; step++) {
    await t.mutation(internal.derived.runBatch, { locale: "en", key: build!.key });
    const state = await t.run((ctx) => ctx.db.query("manPageDerived").take(3));
    partial = state.some((row) => row.distro === "debian" && row.detailChunkCount === 0 && row.cleanupPending === true) &&
      state.some((row) => row.distro === "ubuntu" && row.cleanupPending === true && row.detailChunkCount === undefined);
  }
  expect(partial).toBe(true);
  const page = await t.query(internal.content.getManByNameAndSectionReadModel, { stage: "prod", distro: "debian", name: "legacy", section: "1" });
  expect(page?.kind === "page" && page.data.derived).toBeNull();
  expect(await t.query(api.portability.getDetails, { distro: "debian", name: "legacy", section: "1" })).toBeNull();
  await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "complete", healthy: true, pendingJobs: 0 });
  expect((await t.query(api.portability.getDetails, { distro: "debian", name: "legacy", section: "1" }))?.rows.length).toBeGreaterThan(0);
  expectBounded(samples);
}, 60_000);

it("drops removed-page rows and stale retries when an oversized peer group would otherwise retain their pins", async () => {
  vi.useFakeTimers(); const { t, samples } = measuredHarness();
  const a = await makeRelease(t, "debian", "07");
  const b = await makeRelease(t, "debian", "08", a);
  const c = await makeRelease(t, "debian", "09", b);
  await addPage(t, a, "foo", false); await addPage(t, a, "z-good", false);
  await addPage(t, b, "z-good", false); await addPage(t, c, "z-good", false);
  await point(t, a);
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("derivedRetryPages", { locale: "en", key: JSON.stringify(["debian", "foo", "1"]), releaseId: a,
      distro: "debian", name: "foo", section: "1", error: "LEGACY_FAILED_INPUT" });
    const build = await ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", "en")).unique();
    await ctx.db.patch(build!._id, { failedPages: 1 });
  });
  for (const distro of ["ubuntu", "fedora", "arch", "alpine", "freebsd", "macos"] as const) {
    const release = await makeRelease(t, distro, "08");
    await addPage(t, release, "foo", true); await point(t, release);
  }
  await point(t, b);
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", failedPages: 6, pendingJobs: 0 });
  expect(await t.run((ctx) => ctx.db.query("manPageDerived").withIndex("by_locale_and_distro_and_name_and_section", (q) =>
    q.eq("locale", "en").eq("distro", "debian").eq("name", "foo").eq("section", "1")).unique())).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("derivedRetryPages").withIndex("by_locale_and_key", (q) =>
    q.eq("locale", "en").eq("key", JSON.stringify(["debian", "foo", "1"]))).unique())).toBeNull();
  await point(t, c);
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  expect(await t.run((ctx) => ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", a)).unique()))
    .toMatchObject({ required: false, readyRows: 0, pendingRefs: 0 });
  let pruned = false;
  for (let step = 0; step < 30 && !pruned; step++) {
    const result = await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { datasetReleaseId: "debian-07", confirmDatasetReleaseId: "debian-07", maxDocs: 5 });
    pruned = result.deletedRelease;
  }
  expect(pruned).toBe(true);
  expect(await t.run((ctx) => ctx.db.get(a))).toBeNull();
  const good = await t.query(internal.content.getManByNameAndSectionReadModel, { stage: "prod", distro: "debian", name: "z-good", section: "1" });
  expect(good?.kind === "page" && good.data.derived?.stale).toBe(false);
  expectBounded(samples);
}, 60_000);

it.each(["unknown", "different"] as const)("ignores %s extractor history without charging or reading its option payload", async (kind) => {
  vi.useFakeTimers(); const { t, samples } = measuredHarness();
  const oldPages: Id<"manPages">[] = [];
  for (const distro of ["debian", "ubuntu"] as const) {
    const old = await makeRelease(t, distro, "08");
    const current = await makeRelease(t, distro, "09", old);
    const oldPage = await addPage(t, old, "manual", kind === "different"); oldPages.push(oldPage);
    await t.run(async (ctx) => {
      if (kind === "different") await persistOptionSignature(ctx, oldPage, largeOptions, 2);
      else {
        const input = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", old).eq("pageId", oldPage)).unique();
        await ctx.db.delete(input!._id);
        await ctx.db.patch(oldPage, { optionSignatureBytes: undefined, optionInputBytes: undefined, optionSignatureHash: undefined, optionExtractorVersion: undefined });
      }
    });
    await addPage(t, current, "manual", false); await point(t, current);
  }
  await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "complete", healthy: true, failedPages: 0, pendingJobs: 0 });
  const rows = await t.run((ctx) => ctx.db.query("manPageDerived").take(3));
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(decodeSummary(row.summaryJson).newIn).toEqual([]);
  expect(Math.max(...samples.map((sample) => sample.readBytes))).toBeLessThan(200_000);
  for (const id of oldPages) {
    const old = await t.run((ctx) => ctx.db.get(id));
    if (kind === "unknown") expect(old?.optionInputBytes).toBeUndefined();
    else {
      // Saving unknown provenance must also erase an earlier known version.
      await t.run((ctx) => persistOptionSignature(ctx, id, largeOptions, null));
      expect((await t.run((ctx) => ctx.db.get(id)))?.optionExtractorVersion).toBeUndefined();
    }
  }
  expectBounded(samples);
}, 60_000);

it("keeps five good peer rows when two known-unavailable peers need legacy input-size metadata", async () => {
  vi.useFakeTimers(); const { t, samples } = measuredHarness();
  const bad = new Set<Distro>(["freebsd", "macos"]);
  const badPages: Id<"manPages">[] = [];
  for (const distro of DISTROS) {
    const release = await makeRelease(t, distro, "09");
    const id = await addPage(t, release, "manual", false);
    if (bad.has(distro)) {
      await t.run((ctx) => persistPackedSignature(ctx, id, "null", 1));
      badPages.push(id);
    }
    await point(t, release);
  }
  for (let pass = 0; pass < 2; pass++) {
    if (pass) for (const id of badPages) await t.run((ctx) => ctx.db.patch(id, { optionInputBytes: undefined }));
    await t.mutation(internal.derived.rebuildActive, { force: pass === 1 }); await finish(t);
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", failedPages: 2, pendingJobs: 0 });
    const rows = await t.run((ctx) => ctx.db.query("manPageDerived").take(8));
    expect(rows).toHaveLength(5);
    const details = await t.query(api.portability.getDetails, { distro: "debian", name: "manual", section: "1" });
    expect(details?.rows[0][2]).toBe(DISTROS.map((distro) => bad.has(distro) ? "e" : "a").join(""));
    for (const id of badPages) {
      const page = await t.run((ctx) => ctx.db.get(id));
      expect(page?.optionInputBytes).toBe(2);
      expect(page?.optionSignatureBytes).toBeUndefined();
      expect(page?.optionSignatureHash).toBeUndefined();
    }
  }
  expectBounded(samples);
}, 60_000);

it("warms full legacy inline content-row sizes before admitting eligible current and predecessor inputs", async () => {
  vi.useFakeTimers(); const { t, samples } = measuredHarness();
  const allPages: Id<"manPages">[] = [];
  const field = JSON.stringify("x".repeat(255_998));
  expect(new TextEncoder().encode(field).length).toBe(256_000);
  for (const distro of ["debian", "ubuntu"] as const) {
    const old = await makeRelease(t, distro, "08");
    const current = await makeRelease(t, distro, "09", old);
    for (const release of [old, current]) {
      const id = await addPage(t, release, "manual", false); allPages.push(id);
      await t.run(async (ctx) => {
        const content = await ctx.db.query("manPageContents").withIndex("by_pageId", (q) => q.eq("pageId", id)).unique();
        await ctx.db.patch(content!._id, { docJson: field, optionsJson: field, synopsisJson: field, seeAlsoJson: field });
        await ctx.db.patch(id, { optionContentBytes: undefined });
      });
    }
    await point(t, current);
  }
  await t.mutation(internal.derived.rebuildActive, {});
  const build = await t.run((ctx) => ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", "en")).unique());
  const first = await t.mutation(internal.derived.runBatch, { locale: "en", key: build!.key });
  expect(first.processed).toBe(0);
  for (const id of allPages) expect((await t.run((ctx) => ctx.db.get(id)))?.optionContentBytes).toBeGreaterThan(1_024_000);
  await finish(t);
  expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "complete", healthy: true, failedPages: 0, pendingJobs: 0 });
  expect(await t.run((ctx) => ctx.db.query("manPageDerived").take(3))).toHaveLength(2);
  expectBounded(samples);
}, 60_000);
