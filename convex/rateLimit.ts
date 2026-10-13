import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

// Server-owned limits. These used to arrive as arguments, which let any caller
// pick the threshold it would be held to.
const LIMITS = {
  search: { limit: 60, windowSeconds: 60 },
  page: { limit: 300, windowSeconds: 60 },
} as const;

async function requireIdentifierTag(identifier: string, tag: string): Promise<void> {
  const configured = process.env.RATE_LIMIT_TAG_KEY;
  if (!configured?.trim()) throw new Error("RATE_LIMIT_TAG_KEY_NOT_CONFIGURED");
  if (!/^[0-9a-f]{64}$/.test(tag)) throw new Error("RATE_LIMIT_TAG_INVALID");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(configured), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(identifier));
  const expected = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");

  // Match http.ts: hash both strings before comparing every byte, so a
  // tag's shared prefix cannot short-circuit comparison.
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(tag)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const actualBytes = new Uint8Array(actualDigest);
  const expectedBytes = new Uint8Array(expectedDigest);
  let diff = 0;
  for (let index = 0; index < actualBytes.length; index += 1) {
    diff |= actualBytes[index] ^ expectedBytes[index];
  }
  if (diff !== 0) throw new Error("RATE_LIMIT_TAG_INVALID");
}

export const enforce = mutation({
  args: {
    kind: v.union(v.literal("search"), v.literal("page")),
    identifier: v.string(),
    tag: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.identifier.length > 128) {
      throw new Error("RATE_LIMIT_IDENTIFIER_TOO_LONG");
    }
    await requireIdentifierTag(args.identifier, args.tag);
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
    // Read one past the page so a full final page is not mistaken for
    // "more remain", which would loop a caller forever on the last batch.
    const expired = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(maxBuckets + 1);
    const deletable = expired.slice(0, maxBuckets);
    for (const row of deletable) {
      await ctx.db.delete(row._id);
    }

    return { deleted: deletable.length, hasMore: expired.length > maxBuckets };
  },
});
