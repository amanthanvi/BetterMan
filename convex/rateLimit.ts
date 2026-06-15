import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const enforce = mutation({
  args: {
    key: v.string(),
    limit: v.number(),
    windowSeconds: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const bucket = Math.floor(args.now / (args.windowSeconds * 1000));
    const bucketKey = `rl:${args.key}:${bucket}`;
    const expiresAt = (bucket + 1) * args.windowSeconds * 1000;

    const existing = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_key", (q) => q.eq("key", bucketKey))
      .unique();

    const count = existing && existing.expiresAt > args.now ? existing.count + 1 : 1;
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
      allowed: count <= args.limit,
      count,
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - args.now) / 1000)),
    };
  },
});

export const cleanupExpired = mutation({
  args: {
    now: v.number(),
    maxBuckets: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxBuckets =
      typeof args.maxBuckets === "number" && Number.isFinite(args.maxBuckets)
        ? Math.max(1, Math.min(Math.floor(args.maxBuckets), 500))
        : 100;
    const expired = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", args.now))
      .take(maxBuckets);
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }

    return { deleted: expired.length, hasMore: expired.length === maxBuckets };
  },
});
