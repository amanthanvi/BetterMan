import { v } from "convex/values";
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

// Internal: this deletes rows on a time predicate. As a public mutation taking
// a caller-supplied `now`, one call with a far-future timestamp emptied the
// whole table and turned rate limiting off.
export const cleanupExpired = internalMutation({
  args: {
    maxBuckets: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxBuckets =
      typeof args.maxBuckets === "number" && Number.isFinite(args.maxBuckets)
        ? Math.max(1, Math.min(Math.floor(args.maxBuckets), 500))
        : 100;
    const expired = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(maxBuckets);
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }

    return { deleted: expired.length, hasMore: expired.length === maxBuckets };
  },
});
