/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const now = 1_800_000_015_000;
const windowStart = Math.floor(now / 60_000) * 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe("server-owned rate limits", () => {
  it.each([
    ["search", 60],
    ["page", 300],
  ] as const)("rejects %s requests after its server-owned threshold of %i", async (kind, limit) => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("rateLimitBuckets", {
      key: `rl:${kind}:client:${Math.floor(now / 60_000)}`,
      count: limit - 1,
      expiresAt: windowStart + 60_000,
    }));

    expect(await t.mutation(api.rateLimit.enforce, { kind, identifier: "client" })).toEqual({
      allowed: true, count: limit, retryAfterSeconds: 45,
    });
    expect(await t.mutation(api.rateLimit.enforce, { kind, identifier: "client" })).toEqual({
      allowed: false, count: limit + 1, retryAfterSeconds: 45,
    });
    const otherKind = kind === "search" ? "page" : "search";
    expect(await t.mutation(api.rateLimit.enforce, { kind: otherKind, identifier: "client" })).toMatchObject({
      allowed: true, count: 1,
    });
  });

  it("starts a new window at the boundary and computes retry-after from the server clock", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("rateLimitBuckets", {
      key: `rl:search:client:${Math.floor(now / 60_000)}`,
      count: 60,
      expiresAt: windowStart + 60_000,
    }));
    vi.setSystemTime(windowStart + 59_999);
    expect(await t.mutation(api.rateLimit.enforce, { kind: "search", identifier: "client" })).toEqual({
      allowed: false, count: 61, retryAfterSeconds: 1,
    });
    vi.setSystemTime(windowStart + 60_000);
    expect(await t.mutation(api.rateLimit.enforce, { kind: "search", identifier: "client" })).toEqual({
      allowed: true, count: 1, retryAfterSeconds: 60,
    });
  });

  it("resets an expired matching bucket instead of retaining its old count", async () => {
    const t = convexTest(schema, modules);
    const bucketId = await t.run((ctx) => ctx.db.insert("rateLimitBuckets", {
      key: `rl:search:client:${Math.floor(now / 60_000)}`,
      count: 60,
      expiresAt: now,
    }));
    expect(await t.mutation(api.rateLimit.enforce, { kind: "search", identifier: "client" })).toEqual({
      allowed: true, count: 1, retryAfterSeconds: 45,
    });
    expect(await t.run((ctx) => ctx.db.get(bucketId))).toMatchObject({
      count: 1, expiresAt: windowStart + 60_000,
    });
    expect(await t.run((ctx) => ctx.db.query("rateLimitBuckets").take(2))).toHaveLength(1);
  });

  it("preserves bounded identifiers and rejects longer identifiers before writing a bucket", async () => {
    const t = convexTest(schema, modules);
    const identifier = "x".repeat(128);
    expect(await t.mutation(api.rateLimit.enforce, { kind: "search", identifier })).toMatchObject({
      allowed: true, count: 1,
    });
    await expect(t.mutation(api.rateLimit.enforce, {
      kind: "search", identifier: `${identifier}x`,
    })).rejects.toThrow("RATE_LIMIT_IDENTIFIER_TOO_LONG");
    const buckets = await t.run((ctx) => ctx.db.query("rateLimitBuckets").take(2));
    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe(`rl:search:${identifier}:${Math.floor(now / 60_000)}`);
  });
});

describe("expired rate-limit cleanup", () => {
  it("reports no continuation for an exactly full final batch and preserves live buckets", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimitBuckets", { key: "old", count: 1, expiresAt: now - 1 });
      await ctx.db.insert("rateLimitBuckets", { key: "boundary", count: 1, expiresAt: now });
      await ctx.db.insert("rateLimitBuckets", { key: "live", count: 1, expiresAt: now + 60_000 });
    });
    expect(await t.mutation(internal.rateLimit.cleanupExpired, { maxBuckets: 2 })).toEqual({
      deleted: 2, hasMore: false,
    });
    expect(await t.mutation(internal.rateLimit.cleanupExpired, { maxBuckets: 2 })).toEqual({
      deleted: 0, hasMore: false,
    });
    expect(await t.run((ctx) => ctx.db.query("rateLimitBuckets").take(2))).toMatchObject([
      { key: "live" },
    ]);
  });

  it("continues cleanup across bounded transactions until all expired buckets are gone", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 201; index++) {
        await ctx.db.insert("rateLimitBuckets", { key: `expired:${index}`, count: 1, expiresAt: now - 1 });
      }
      await ctx.db.insert("rateLimitBuckets", { key: "live", count: 1, expiresAt: now + 60_000 });
    });
    await t.mutation(internal.crons.cleanupRateLimitBuckets, {});
    expect(await t.run((ctx) => ctx.db.query("rateLimitBuckets").take(500))).toHaveLength(102);
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ name: "crons:cleanupRateLimitBuckets", state: { kind: "pending" } });

    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    expect(await t.run((ctx) => ctx.db.query("rateLimitBuckets").take(2))).toMatchObject([{ key: "live" }]);
    const finished = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
    expect(finished).toHaveLength(2);
    expect(finished.every((job) => job.state.kind === "success")).toBe(true);
  });

  it("does not schedule another batch when the default batch is exactly the last 100 rows", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 100; index++) {
        await ctx.db.insert("rateLimitBuckets", { key: `expired:${index}`, count: 1, expiresAt: now - 1 });
      }
    });
    await t.mutation(internal.crons.cleanupRateLimitBuckets, {});
    expect(await t.run((ctx) => ctx.db.query("rateLimitBuckets").take(1))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
  });
});
