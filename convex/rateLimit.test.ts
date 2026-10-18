/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const now = 1_800_000_015_000;
const windowStart = Math.floor(now / 60_000) * 60_000;
const bucket = Math.floor(now / 60_000);

// RFC 4231 test case 2. nextjs/lib/rateLimit.test.ts signs the same vector, so
// both sides are pinned to standard HMAC-SHA256 hex.
const key = "Jefe";
const identifier = "what do ya want for nothing?";
const tag = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";

function buckets(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) => ctx.db.query("rateLimitBuckets").take(10));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("RATE_LIMIT_TAG_KEY", key);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("consume", () => {
  it("counts a correctly tagged identifier against its server-owned limit", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("rateLimitBuckets", {
      key: `rl:search:${identifier}:${bucket}`, count: 59, expiresAt: windowStart + 60_000,
    }));

    expect(await t.mutation(api.rateLimit.consume, { kind: "search", identifier, tag })).toEqual({
      allowed: true, count: 60, retryAfterSeconds: 45,
    });
    expect(await t.mutation(api.rateLimit.consume, { kind: "search", identifier, tag })).toEqual({
      allowed: false, count: 61, retryAfterSeconds: 45,
    });
  });

  it.each([
    ["an empty tag", ""],
    ["a wrong tag", "0".repeat(64)],
    ["another identifier's tag", tag],
  ])("rejects %s without touching an existing bucket", async (_label, badTag) => {
    const t = convexTest(schema, modules);
    const bucketId = await t.run((ctx) => ctx.db.insert("rateLimitBuckets", {
      key: `rl:search:victim:${bucket}`, count: 10, expiresAt: windowStart + 60_000,
    }));
    await expect(t.mutation(api.rateLimit.consume, { kind: "search", identifier: "victim", tag: badTag }))
      .rejects.toThrow("RATE_LIMIT_TAG_INVALID");
    expect(await t.run((ctx) => ctx.db.get(bucketId))).toMatchObject({ count: 10 });
  });

  it("rejects a missing tag or an unset key before writing a bucket", async () => {
    const t = convexTest(schema, modules);
    // @ts-expect-error An untrusted caller can omit the tag.
    await expect(t.mutation(api.rateLimit.consume, { kind: "search", identifier })).rejects.toThrow();
    vi.stubEnv("RATE_LIMIT_TAG_KEY", "");
    await expect(t.mutation(api.rateLimit.consume, { kind: "search", identifier, tag }))
      .rejects.toThrow("RATE_LIMIT_TAG_KEY_NOT_CONFIGURED");
    expect(await buckets(t)).toEqual([]);
  });

  it("rejects identifiers over 128 characters before writing a bucket", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.rateLimit.consume, { kind: "search", identifier: "x".repeat(129), tag }))
      .rejects.toThrow("RATE_LIMIT_IDENTIFIER_TOO_LONG");
    expect(await buckets(t)).toEqual([]);
  });
});

describe("cleanupExpired", () => {
  it("deletes buckets at or past expiry and keeps live ones", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimitBuckets", { key: "old", count: 1, expiresAt: now - 1 });
      await ctx.db.insert("rateLimitBuckets", { key: "boundary", count: 1, expiresAt: now });
      await ctx.db.insert("rateLimitBuckets", { key: "live", count: 1, expiresAt: now + 1 });
    });
    expect(await t.mutation(internal.rateLimit.cleanupExpired, { maxBuckets: 2 })).toEqual({
      deleted: 2, hasMore: false,
    });
    expect(await buckets(t)).toMatchObject([{ key: "live" }]);
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
  });

  it("schedules the next batch until the backlog is drained", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i += 1) {
        await ctx.db.insert("rateLimitBuckets", { key: `expired:${i}`, count: 1, expiresAt: now - 1 });
      }
      await ctx.db.insert("rateLimitBuckets", { key: "live", count: 1, expiresAt: now + 60_000 });
    });

    expect(await t.mutation(internal.rateLimit.cleanupExpired, { maxBuckets: 2 })).toEqual({
      deleted: 2, hasMore: true,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    expect(await buckets(t)).toMatchObject([{ key: "live" }]);
    const runs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.name === "rateLimit:cleanupExpired" && run.state.kind === "success")).toBe(true);
  });
});
