import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { CLEANUP_BATCH_LIMIT, CLEANUP_FOLLOWUP_LIMIT } from "./rateLimit";

const crons = cronJobs();

// Bucket keys embed the client identifier and expire with the 60-second window.
// Run every minute so those identifiers are not retained after the window, and
// let the mutation schedule further bounded batches while expired rows remain.
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
