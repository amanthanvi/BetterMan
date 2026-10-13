import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// Each transaction removes a bounded batch. Continue immediately until the
// backlog is drained, including when it exceeds one cron interval's batch.
export const cleanupRateLimitBuckets = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const result: { deleted: number; hasMore: boolean } = await ctx.runMutation(
      internal.rateLimit.cleanupExpired,
      {},
    );
    if (result.hasMore) {
      await ctx.scheduler.runAfter(0, internal.crons.cleanupRateLimitBuckets, {});
    }
    return null;
  },
});

const crons = cronJobs();

crons.interval(
  "clean up expired rate-limit buckets",
  { minutes: 10 },
  internal.crons.cleanupRateLimitBuckets,
  {},
);

export default crons;
