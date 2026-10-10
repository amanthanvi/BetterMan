import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";

// Server-owned limits. These used to arrive as arguments, which let any caller
// pick the threshold it would be held to.
const LIMITS = {
  search: { limit: 60, windowSeconds: 60 },
  page: { limit: 300, windowSeconds: 60 },
} as const;

export const enforce = mutation({
  args: {
    kind: v.union(v.literal("search"), v.literal("page")),
    identifier: v.string(),
  },
  handler: async (ctx, args) => {
    const { limit, windowSeconds } = LIMITS[args.kind];

    // Derived here rather than accepted from the caller: a caller-supplied
    // clock lets an attacker choose which bucket a request lands in and so
    // step around the window entirely.
    const now = Date.now();
    const bucket = Math.floor(now / (windowSeconds * 1000));
    const bucketKey = `rl:${args.kind}:${args.identifier}:${bucket}`;
    const expiresAt = (bucket + 1) * windowSeconds * 1000;

    const existing = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_key", (q) => q.eq("key", bucketKey))
      .unique();

    const count = existing && existing.expiresAt > now ? existing.count + 1 : 1;
    if (existing) {
      await ctx.db.patch(existing._id, { count, expiresAt });
    } else {
      await ctx.db.insert("rateLimitBuckets", {
        key: bucketKey,
        count,
        expiresAt,
      });
    }

    return {
      allowed: count <= limit,
      count,
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
    };
  },
});

// One mutation stays under Convex's per-transaction document limits.
// The cron asks for the cap; a caller that omits maxBuckets deletes a smaller page.
export const CLEANUP_BATCH_DEFAULT = 100;
export const CLEANUP_BATCH_LIMIT = 500;
// Further batches one wave may schedule after the current mutation. The next
// cron tick continues any remainder, so a stuck hasMore cannot loop forever.
export const CLEANUP_FOLLOWUP_LIMIT = 40;

function cleanupBatchSize(maxBuckets: number | undefined): number {
  if (typeof maxBuckets !== "number" || !Number.isFinite(maxBuckets)) return CLEANUP_BATCH_DEFAULT;
  return Math.max(1, Math.min(Math.floor(maxBuckets), CLEANUP_BATCH_LIMIT));
}

function cleanupFollowupsRemaining(followupsRemaining: number | undefined): number {
  if (typeof followupsRemaining !== "number" || !Number.isFinite(followupsRemaining)) {
    return CLEANUP_FOLLOWUP_LIMIT;
  }
  return Math.max(0, Math.min(Math.floor(followupsRemaining), CLEANUP_FOLLOWUP_LIMIT));
}

// Internal: this deletes rows on a time predicate. As a public mutation taking
// a caller-supplied `now`, one call with a far-future timestamp emptied the
// whole table and turned rate limiting off. The clock is read here, and
// convex/crons.ts is what schedules the run.
export const cleanupExpired = internalMutation({
  args: {
    maxBuckets: v.optional(v.number()),
    followupsRemaining: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    hasMore: v.boolean(),
    scheduledFollowup: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const maxBuckets = cleanupBatchSize(args.maxBuckets);
    const followupsRemaining = cleanupFollowupsRemaining(args.followupsRemaining);
    // Read one past the page so a full final page is not mistaken for
    // "more remain", which would schedule follow-ups forever on the last batch.
    const expired = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(maxBuckets + 1);
    const deletable = expired.slice(0, maxBuckets);
    for (const row of deletable) {
      await ctx.db.delete(row._id);
    }

    const hasMore = expired.length > maxBuckets;
    const scheduledFollowup = hasMore && followupsRemaining > 0;
    if (scheduledFollowup) {
      await ctx.scheduler.runAfter(0, internal.rateLimit.cleanupExpired, {
        maxBuckets,
        followupsRemaining: followupsRemaining - 1,
      });
    }

    return { deleted: deletable.length, hasMore, scheduledFollowup };
  },
});
