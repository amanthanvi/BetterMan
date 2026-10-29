import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "clean up expired rate-limit buckets",
  { minutes: 10 },
  internal.rateLimit.cleanupExpired,
  {},
);

// Bootstrap existing prod data and resume failed/canceled bounded chains after deploy.
crons.interval("bootstrap legacy option signatures", { hours: 1 }, internal.derivedSignatures.backfillActive, {});
crons.interval("refresh derived prod snapshot", { hours: 1 }, internal.derived.rebuildActive, {});

export default crons;
