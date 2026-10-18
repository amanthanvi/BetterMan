import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { secretsMatch } from "./lib";

// Server-owned limits. These used to arrive as arguments, which let any caller
// pick the threshold it would be held to.
const LIMITS = {
  search: { limit: 60, windowSeconds: 60 },
  page: { limit: 300, windowSeconds: 60 },
} as const;

const MAX_IDENTIFIER_LENGTH = 128;

const rateLimitKindValidator = v.union(v.literal("search"), v.literal("page"));

async function identifierTag(key: string, identifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(identifier));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The tag is an HMAC of the identifier under RATE_LIMIT_TAG_KEY, which is set
// only on Convex and the Next server. Without it, any client could spend
// another caller's bucket by passing that caller's identifier.
export const consume = mutation({
  args: {
    kind: rateLimitKindValidator,
    identifier: v.string(),
    tag: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.identifier.length > MAX_IDENTIFIER_LENGTH) {
      throw new Error("RATE_LIMIT_IDENTIFIER_TOO_LONG");
    }
    const key = process.env.RATE_LIMIT_TAG_KEY?.trim();
    if (!key) throw new Error("RATE_LIMIT_TAG_KEY_NOT_CONFIGURED");
    if (!(await secretsMatch(args.tag, await identifierTag(key, args.identifier)))) {
      throw new Error("RATE_LIMIT_TAG_INVALID");
    }

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
// whole table and turned rate limiting off. The cron in crons.ts starts it;
// each call deletes one bounded batch and schedules the next while more remain.
export const cleanupExpired = internalMutation({
  args: {
    maxBuckets: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ deleted: number; hasMore: boolean }> => {
    const maxBuckets =
      typeof args.maxBuckets === "number" && Number.isFinite(args.maxBuckets)
        ? Math.max(1, Math.min(Math.floor(args.maxBuckets), 500))
        : 100;
    // `lte`: a bucket is live only while `expiresAt > now`, as in `consume`.
    // Read one past the page so a full final page is not mistaken for
    // "more remain", which would reschedule forever on the last batch.
    const expired = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(maxBuckets + 1);
    const deletable = expired.slice(0, maxBuckets);
    for (const row of deletable) {
      await ctx.db.delete(row._id);
    }

    const hasMore = expired.length > maxBuckets;
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.rateLimit.cleanupExpired, { maxBuckets });
    }
    return { deleted: deletable.length, hasMore };
  },
});
