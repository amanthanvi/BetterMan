/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { persistOptionSignature } from "./_derivedInputs";
import { decodeOptions, encodeOptions } from "./_derivedEncoding";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
const options = (flag: string) => [{ anchorId: flag.slice(2), flags: flag, argument: null, description: "test" }];

async function release(ctx: MutationCtx) {
  const releaseId = await ctx.db.insert("datasetReleases", { datasetReleaseId: "legacy", distro: "debian", locale: "en", imageRef: "test", imageDigest: "test", ingestedAt: "2026-08-01T00:00:00Z", pageCount: 0, sealed: true, manifestVerified: true });
  await ctx.db.insert("activeReleases", { stage: "prod", distro: "debian", locale: "en", releaseId, datasetReleaseId: "legacy", activatedAt: "now" });
  return releaseId;
}
async function page(ctx: MutationCtx, releaseId: Id<"datasetReleases">, name: string, hash = "same-raw-roff") {
  return ctx.db.insert("manPages", { releaseId, datasetReleaseId: "legacy", externalId: name, locale: "en", distro: "debian", name, section: "1", sitemapPage: 0, title: name, description: "test", sourcePath: name, contentSha256: hash, hasParseWarnings: false });
}
async function blob(ctx: MutationCtx, flag: string) {
  const storageId = await ctx.storage.store(new Blob([JSON.stringify({ content: { optionsJson: JSON.stringify(options(flag)), docJson: "{}" } })]));
  return ctx.db.insert("manPageContentBlobs", { contentSha256: "same-raw-roff", storageId });
}
async function state(t: Harness) {
  return t.run((ctx) => ctx.db.query("derivedSignatureBackfills").take(1));
}
async function finish(t: Harness) { await t.finishAllScheduledFunctions(() => vi.runAllTimers()); }
function countStorageReads() {
  const host = globalThis as unknown as { Convex: object };
  const original = host.Convex;
  let reads = 0;
  host.Convex = new Proxy(original, { get(target, key) {
    if (key !== "jsSyscall" && key !== "asyncSyscall") return Reflect.get(target, key);
    return async (op: string, ...args: unknown[]) => {
      if (op === "storage/getBlob") reads++;
      return Reflect.get(target, key)(op, ...args);
    };
  } });
  return { count: () => reads, restore: () => { host.Convex = original; } };
}
afterEach(() => vi.useRealTimers());

describe("once-only legacy signature bootstrap", () => {
  it("deduplicates actual blobs, never guesses an unknown parse from its raw roff hash, and keeps extractor provenance unknown", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const r = await release(ctx);
      const one = await blob(ctx, "--one"), two = await blob(ctx, "--two");
      const ids: Id<"manPages">[] = [];
      for (const [name, blobId] of [["a-one", one], ["b-two", two], ["c-one-copy", one], ["d-two-copy", two]] as const) {
        const id = await page(ctx, r, name); ids.push(id);
        await ctx.db.insert("manPageContents", { pageId: id, blobId });
      }
      return ids;
    });
    const counter = countStorageReads();
    try {
      await t.mutation(internal.derivedSignatures.backfillActive, {}); await finish(t);
      expect(counter.count()).toBe(2);
      const actual = await t.run((ctx) => ctx.db.query("derivedPageInputs").take(10));
      expect(actual).toHaveLength(4);
      for (const input of actual) {
        expect(input.extractorVersion).toBeNull();
        expect(decodeOptions(input.optionsJson)[0].flags).toEqual([input.name.includes("two") ? "--two" : "--one"]);
      }
      expect(await t.query(internal.derivedSignatures.status, {})).toMatchObject({ healthy: true });
      expect((await state(t))[0]).toMatchObject({ state: "complete", failures: 0, migrationPin: false });
      const sourceCache = await t.run((ctx) => ctx.db.query("derivedLegacySignatures").take(10));
      expect(sourceCache).toHaveLength(2);
    } finally { counter.restore(); }
  });

  it("reads inline and bounded options chunks without reading body chunks", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const r = await release(ctx);
      const inline = await page(ctx, r, "inline", "inline");
      await ctx.db.insert("manPageContents", { pageId: inline, optionsJson: JSON.stringify(options("--inline")) });
      const chunked = await page(ctx, r, "chunked", "chunked");
      const contentId = await ctx.db.insert("manPageContents", { pageId: chunked });
      const json = JSON.stringify(options("--chunked"));
      await ctx.db.insert("manPageContentChunks", { pageId: chunked, contentId, kind: "optionsJson", chunkIndex: 0, chunk: json.slice(0, 12) });
      await ctx.db.insert("manPageContentChunks", { pageId: chunked, contentId, kind: "optionsJson", chunkIndex: 1, chunk: json.slice(12) });
      await ctx.db.insert("manPageContentChunks", { pageId: chunked, contentId, kind: "docJson", chunkIndex: 999, chunk: "must not read this gap" });
    });
    const counter = countStorageReads();
    try {
      await t.mutation(internal.derivedSignatures.backfillActive, {}); await finish(t);
      expect(counter.count()).toBe(0);
      const inputs = await t.run((ctx) => ctx.db.query("derivedPageInputs").take(5));
      expect(inputs.map((input) => decodeOptions(input.optionsJson)[0].flags[0]).sort()).toEqual(["--chunked", "--inline"]);
      expect((await state(t))[0].state).toBe("complete");
    } finally { counter.restore(); }
  });

  it("never downloads content for new versioned uploads and processes a multi-page release in bounded metadata batches", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const r = await release(ctx);
      for (let i = 0; i < 70; i++) {
        const id = await page(ctx, r, `new-${String(i).padStart(2, "0")}`, `new-${i}`);
        await ctx.db.insert("manPageContents", { pageId: id, optionsJson: JSON.stringify(options(`--flag-${i}`)) });
        await persistOptionSignature(ctx, id, options(`--flag-${i}`), 1);
      }
    });
    const counter = countStorageReads();
    try {
      await t.mutation(internal.derivedSignatures.backfillActive, {}); await finish(t);
      expect(counter.count()).toBe(0);
      expect((await state(t))[0]).toMatchObject({ state: "complete", processed: 70, cacheHits: 70 });
      expect(await t.mutation(internal.derivedSignatures.backfillActive, {})).toEqual({ scheduled: 0 });
    } finally { counter.restore(); }
  });

  it("skips a missing page, retains a durable pin after lease expiry, and retries only the repaired failed page", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const r = await release(ctx);
      const good = await page(ctx, r, "good", "good"), bad = await page(ctx, r, "bad", "bad");
      await ctx.db.insert("manPageContents", { pageId: good, optionsJson: JSON.stringify(options("--good")) });
      return { r, bad };
    });
    await t.mutation(internal.derivedSignatures.backfillActive, {}); await finish(t);
    expect((await state(t))[0]).toMatchObject({ state: "failed", failures: 1, processed: 2, phase: "retry", migrationPin: true });
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    const pin = await t.run((ctx) => ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", ids.r)).unique());
    expect(pin!.pendingRefs).toBeGreaterThan(0);
    expect(pin!.leaseUntil).toBeLessThan(Date.now());
    await t.run((ctx) => ctx.db.insert("manPageContents", { pageId: ids.bad, optionsJson: JSON.stringify(options("--repaired")) }));
    await t.mutation(internal.derivedSignatures.backfillActive, {}); await finish(t);
    expect((await state(t))[0]).toMatchObject({ state: "complete", failures: 0, processed: 3, migrationPin: false });
    expect(await t.query(internal.derivedSignatures.status, {})).toMatchObject({ healthy: true });
  });

  it("resumes a crashed action from server progress and rejects stale commits", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const r = await release(ctx);
      for (const name of ["a", "b", "c"]) {
        const id = await page(ctx, r, name, name);
        await ctx.db.insert("manPageContents", { pageId: id, optionsJson: JSON.stringify(options(`--${name}`)) });
      }
    });
    await t.mutation(internal.derivedSignatures.backfillActive, {});
    const old = (await state(t))[0];
    const prepared = await t.mutation(internal.derivedSignatures.readBatch, { releaseId: old.releaseId, revision: old.revision });
    expect(prepared?.items).toHaveLength(1);
    await t.mutation(internal.derivedSignatures.failBatch, { releaseId: old.releaseId, revision: old.revision, error: "SIMULATED_ACTION_CRASH" });
    await t.mutation(internal.derivedSignatures.backfillActive, {});
    expect(await t.mutation(internal.derivedSignatures.commitBatch, { releaseId: old.releaseId, revision: old.revision, cursor: old.cursor, items: [] })).toBe(false);
    await finish(t);
    expect((await state(t))[0]).toMatchObject({ state: "complete", processed: 3, failures: 0 });
  });

  it("releases a retired failed migration pin on the next bounded active check", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const r = await t.run(async (ctx) => { const id = await release(ctx); await page(ctx, id, "bad"); return id; });
    await t.mutation(internal.derivedSignatures.backfillActive, {}); await finish(t);
    await t.run(async (ctx) => {
      const pointer = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", "debian")).unique();
      await ctx.db.delete(pointer!._id);
    });
    await t.mutation(internal.derivedSignatures.backfillActive, {});
    expect((await state(t))[0]).toMatchObject({ state: "complete", error: "RELEASE_RETIRED", migrationPin: false });
    expect((await t.run((ctx) => ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", r)).unique()))?.pendingRefs).toBe(0);
  });
  it("bounds cached-input reads by bytes before touching the next large signature", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const optionsJson = encodeOptions(Array.from({ length: 1800 }, (_, i) => ({ anchorId: `${"a".repeat(200)}${i}`, flags: [`--${"f".repeat(70)}${i}`], argumentShape: "none" as const })));
    const bytes = new TextEncoder().encode(optionsJson).length;
    expect(bytes).toBeLessThan(700_000);
    await t.run(async (ctx) => {
      const r = await release(ctx);
      for (let i = 0; i < 32; i++) {
        const id = await page(ctx, r, `large-${String(i).padStart(2, "0")}`, `large-${i}`);
        await ctx.db.patch(id, { optionSignatureBytes: bytes, optionSignatureHash: "sig" });
        await ctx.db.insert("derivedPageInputs", { releaseId: r, pageId: id, name: `large-${String(i).padStart(2, "0")}`, section: "1", contentSha256: `large-${i}`, optionsJson, truncated: false, status: "ready", signatureHash: "sig", extractorVersion: 1 });
      }
    });
    await t.mutation(internal.derivedSignatures.backfillActive, {});
    const job = (await state(t))[0];
    const prepared = await t.mutation(internal.derivedSignatures.readBatch, { releaseId: job.releaseId, revision: job.revision });
    expect(prepared!.items.length).toBeLessThan(4);
    expect(prepared!.items.length * bytes).toBeLessThanOrEqual(2_000_000);
    await t.run((ctx) => ctx.scheduler.cancel(job.jobId!));
  });

  it("flags invalid legacy options without preventing other pages from migrating", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const r = await release(ctx);
      const bad = await page(ctx, r, "a-bad", "bad");
      const good = await page(ctx, r, "b-good", "good");
      await ctx.db.insert("manPageContents", { pageId: bad, optionsJson: "not JSON" });
      await ctx.db.insert("manPageContents", { pageId: good, optionsJson: JSON.stringify(options("--good")) });
    });
    await t.mutation(internal.derivedSignatures.backfillActive, {}); await finish(t);
    const inputs = await t.run((ctx) => ctx.db.query("derivedPageInputs").take(5));
    expect(inputs.find((input) => input.name === "b-good")?.status).toBe("ready");
    expect((await state(t))[0]).toMatchObject({ state: "failed", failures: 1, processed: 2 });
  });

  it("leaves oversized legacy pages unavailable while completing healthy pages", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const r = await release(ctx);
      const hugeStorage = await page(ctx, r, "a-storage-limit", "storage");
      const storageId = await ctx.storage.store(new Blob([" ".repeat(32_000_001)]));
      await ctx.db.insert("manPageContents", { pageId: hugeStorage, storageId });
      const hugeOptions = await page(ctx, r, "b-options-limit", "options");
      const optionsStorage = await ctx.storage.store(new Blob([JSON.stringify({ content: {
        optionsJson: JSON.stringify([{ flags: "--big", anchorId: "big", description: "x".repeat(2_048_001) }]), docJson: "{}",
      } })]));
      await ctx.db.insert("manPageContents", { pageId: hugeOptions, storageId: optionsStorage });
      const good = await page(ctx, r, "c-good", "good");
      await ctx.db.insert("manPageContents", { pageId: good, optionsJson: JSON.stringify(options("--good")) });
    });
    await t.mutation(internal.derivedSignatures.backfillActive, {}); await finish(t);
    const inputs = await t.run((ctx) => ctx.db.query("derivedPageInputs").take(5));
    expect(inputs.find((input) => input.name === "a-storage-limit")).toMatchObject({ status: "unavailable", error: "DERIVED_STORAGE_LIMIT" });
    expect(inputs.find((input) => input.name === "b-options-limit")).toMatchObject({ status: "unavailable", error: "DERIVED_OPTIONS_LIMIT" });
    expect(inputs.find((input) => input.name === "c-good")?.status).toBe("ready");
    expect((await state(t))[0]).toMatchObject({ state: "failed", failures: 2, processed: 3, phase: "retry" });
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", failedPages: 2, healthy: false });
    const read = await t.query(internal.content.getManByNameAndSectionReadModel, { stage: "prod", distro: "debian", name: "c-good", section: "1" });
    expect(read?.kind === "page" && read.data.derived?.stale).toBe(false);
  });

});
