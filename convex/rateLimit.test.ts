/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import rateLimitCrons from "./crons";
import {
  CLEANUP_BATCH_DEFAULT,
  CLEANUP_BATCH_LIMIT,
  CLEANUP_FOLLOWUP_LIMIT,
  cleanupExpired,
} from "./rateLimit";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function harness() {
  return convexTest(schema, modules);
}

function freezeNow() {
  const now = Date.now();
  vi.useFakeTimers({ now });
  return now;
}

async function seedBuckets(
  t: ReturnType<typeof harness>,
  rows: Array<{ key: string; expiresAt: number }>,
) {
  await t.run(async (ctx) => {
    for (const row of rows) {
      await ctx.db.insert("rateLimitBuckets", {
        key: row.key,
        count: 1,
        expiresAt: row.expiresAt,
      });
    }
  });
}

async function remainingKeys(t: ReturnType<typeof harness>) {
  const rows = await t.run(async (ctx) => ctx.db.query("rateLimitBuckets").take(CLEANUP_BATCH_LIMIT + 5));
  return rows.map((row) => row.key).sort();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("expired rate-limit cleanup", () => {
  it("stays internal and is scheduled every minute with a bounded batch", () => {
    const registered = cleanupExpired as { isInternal?: boolean; isPublic?: boolean };
    expect(registered.isInternal).toBe(true);
    expect(registered.isPublic).toBeUndefined();

    expect(Object.keys(rateLimitCrons.crons)).toEqual(["delete expired rate limit buckets"]);
    expect(rateLimitCrons.crons["delete expired rate limit buckets"]).toEqual({
      name: "rateLimit:cleanupExpired",
      args: [{ maxBuckets: CLEANUP_BATCH_LIMIT, followupsRemaining: CLEANUP_FOLLOWUP_LIMIT }],
      schedule: { type: "interval", minutes: 1 },
    });
  });

  it("deletes expired identifier keys and keeps buckets still inside the window", async () => {
    const now = freezeNow();
    const t = harness();
    await seedBuckets(t, [
      { key: "rl:page:203.0.113.8:1", expiresAt: now - 1_000 },
      { key: "rl:search:203.0.113.8:1", expiresAt: now - 60_000 },
      { key: "rl:page:203.0.113.9:2", expiresAt: now + 60_000 },
    ]);

    expect(await t.mutation(internal.rateLimit.cleanupExpired, { followupsRemaining: 0 })).toEqual({
      deleted: 2,
      hasMore: false,
      scheduledFollowup: false,
    });
    expect(await remainingKeys(t)).toEqual(["rl:page:203.0.113.9:2"]);
  });

  it("does not schedule another batch when the last page is exactly full", async () => {
    const now = freezeNow();
    const t = harness();
    await seedBuckets(t, [
      { key: "rl:page:203.0.113.1:1", expiresAt: now - 1 },
      { key: "rl:page:203.0.113.2:1", expiresAt: now - 1 },
    ]);

    expect(await t.mutation(internal.rateLimit.cleanupExpired, {
      maxBuckets: 2,
      followupsRemaining: CLEANUP_FOLLOWUP_LIMIT,
    })).toEqual({ deleted: 2, hasMore: false, scheduledFollowup: false });
    expect(await remainingKeys(t)).toEqual([]);
  });

  it("drains a backlog across scheduled batches and leaves the live bucket", async () => {
    const now = freezeNow();
    const t = harness();
    await seedBuckets(t, [
      ...[1, 2, 3, 4, 5].map((octet) => ({
        key: `rl:page:203.0.113.${octet}:1`,
        expiresAt: now - 5_000,
      })),
      { key: "rl:search:203.0.113.9:2", expiresAt: now + 30_000 },
    ]);

    expect(await t.mutation(internal.rateLimit.cleanupExpired, { maxBuckets: 2 })).toEqual({
      deleted: 2,
      hasMore: true,
      scheduledFollowup: true,
    });
    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
    });
    expect(await remainingKeys(t)).toEqual(["rl:search:203.0.113.9:2"]);
  });

  it("stops chaining when the follow-up budget is exhausted", async () => {
    const now = freezeNow();
    const t = harness();
    await seedBuckets(t, [1, 2, 3, 4, 5].map((octet) => ({
      key: `rl:search:198.51.100.${octet}:1`,
      expiresAt: now - 5_000,
    })));

    expect(await t.mutation(internal.rateLimit.cleanupExpired, {
      maxBuckets: 2,
      followupsRemaining: 1,
    })).toEqual({ deleted: 2, hasMore: true, scheduledFollowup: true });
    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
    });
    // Two batches of two, then the budget stops the chain. Index order is
    // expiresAt then creation time, so the last inserted key remains.
    expect(await remainingKeys(t)).toEqual(["rl:search:198.51.100.5:1"]);
  });

  it("clamps an oversized page to the transaction cap and uses the default page otherwise", async () => {
    const now = freezeNow();
    const t = harness();
    await seedBuckets(t, Array.from({ length: CLEANUP_BATCH_LIMIT + 1 }, (_, index) => ({
      key: `rl:page:192.0.2.${index}:1`,
      expiresAt: now - 1,
    })));

    expect(await t.mutation(internal.rateLimit.cleanupExpired, {
      maxBuckets: 10_000,
      followupsRemaining: 0,
    })).toEqual({ deleted: CLEANUP_BATCH_LIMIT, hasMore: true, scheduledFollowup: false });
    expect(await remainingKeys(t)).toHaveLength(1);

    const defaults = harness();
    await seedBuckets(defaults, Array.from({ length: CLEANUP_BATCH_DEFAULT + 1 }, (_, index) => ({
      key: `rl:page:192.0.2.${index}:9`,
      expiresAt: now - 1,
    })));
    expect(await defaults.mutation(internal.rateLimit.cleanupExpired, { followupsRemaining: 0 })).toEqual({
      deleted: CLEANUP_BATCH_DEFAULT,
      hasMore: true,
      scheduledFollowup: false,
    });
  });
});
