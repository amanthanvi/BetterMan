import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { CLEANUP_BATCH_LIMIT, CLEANUP_FOLLOWUP_LIMIT } from "./rateLimit";

const crons = cronJobs();

// Bucket keys embed the client identifier. Expired rows are removed on this
// one-minute schedule, in bounded batches. A backlog larger than one wave
// continues on the next tick rather than inside a single transaction.
crons.interval(
  "delete expired rate limit buckets",
  { minutes: 1 },
  internal.rateLimit.cleanupExpired,
  {
    maxBuckets: CLEANUP_BATCH_LIMIT,
    followupsRemaining: CLEANUP_FOLLOWUP_LIMIT,
  },
);

export default crons;
