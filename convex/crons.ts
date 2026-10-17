import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "clean up expired rate-limit buckets",
  { minutes: 10 },
  internal.rateLimit.cleanupExpired,
  {},
);

export default crons;
