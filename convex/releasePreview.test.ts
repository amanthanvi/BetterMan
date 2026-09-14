/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("inactive release preview", () => {
  it("pages through every release and reports rollback eligibility", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const base = { locale: "en", distro: "debian", imageRef: "test", imageDigest: "test", pageCount: 1 } as const;
      const active = await ctx.db.insert("datasetReleases", {
        ...base, datasetReleaseId: "active", ingestedAt: "2026-09-14T00:00:00Z", sealed: true, manifestBasis: "declared", manifestVerified: true,
      });
      await ctx.db.insert("activeReleases", {
        stage: "prod", locale: "en", distro: "debian", releaseId: active, datasetReleaseId: "active", activatedAt: "2026-09-14T00:00:00Z",
      });
      await ctx.db.insert("datasetReleases", {
        ...base, datasetReleaseId: "legacy", ingestedAt: "2026-09-01T00:00:00Z", sealed: true,
        manifestBasis: "legacy_unverified_aliases", manifestVerified: false, manifestError: "LEGACY_ALIAS_EXPECTATION_UNKNOWN",
      });
      await ctx.db.insert("datasetReleases", {
        ...base, datasetReleaseId: "draft", ingestedAt: "2026-09-13T00:00:00Z", manifestBasis: "declared",
      });
      await ctx.db.insert("datasetReleases", {
        ...base, datasetReleaseId: "verified", ingestedAt: "2026-09-07T00:00:00Z", sealed: true, manifestBasis: "declared", manifestVerified: true,
      });
    });

    const first = await t.query(internal.maintenance.previewInactiveReleases, { limit: 2 });
    expect(first.scanned).toBe(2);
    expect(first.isDone).toBe(false);
    expect(typeof first.continueCursor).toBe("string");
    const second = await t.query(internal.maintenance.previewInactiveReleases, { cursor: first.continueCursor, limit: 2 });
    expect(second.isDone).toBe(true);
    expect(second.continueCursor).toBeNull();

    const inactive = [...first.inactive, ...second.inactive];
    expect(inactive.map((release) => release.datasetReleaseId)).toEqual(["legacy", "draft", "verified"]);
    expect(inactive).toMatchObject([
      { sealed: true, pruning: false, manifestBasis: "legacy_unverified_aliases", manifestVerified: false, manifestError: "LEGACY_ALIAS_EXPECTATION_UNKNOWN" },
      { sealed: false, pruning: false, manifestBasis: "declared", manifestVerified: false, manifestError: null },
      { sealed: true, pruning: false, manifestBasis: "declared", manifestVerified: true, manifestError: null },
    ]);
  });
});
