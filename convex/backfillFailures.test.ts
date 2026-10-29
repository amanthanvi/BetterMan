/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());

it("stops after three failed attempts at one cursor, and re-arms only explicitly after repair", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const { releaseId } = await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId: "failed", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
    ingestedAt: "now", packageManifest: null, pageCount: 1, aliasCount: 0, licenseCount: 0,
    sectionTotals: [{ section: "1", total: 1 }], licensePackages: [],
  });
  const page = { releaseId, datasetReleaseId: "failed", locale: "en", distro: "debian" as const,
    name: "target", section: "1", sitemapPage: 1, title: "target", description: "test", sourcePath: "test",
    contentSha256: "test", hasParseWarnings: false };
  const duplicate = await t.run(async (ctx) => {
    const first = await ctx.db.insert("manPages", { ...page, externalId: "one" });
    const duplicate = await ctx.db.insert("manPages", { ...page, externalId: "duplicate" });
    await ctx.db.insert("manPageLinks", { releaseId, fromPageId: first, fromExternalId: "one", toName: "target", toSection: "1", linkType: "xref" });
    await ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, uploadedPageCount: 1 });
    return duplicate;
  });
  const activate = () => t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "failed", stage: "prod", activatedAt: "now" });
  for (let attempt = 1; attempt <= 3; attempt++) {
    expect(await activate()).toMatchObject({ pending: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const release = await t.run((ctx) => ctx.db.get(releaseId));
    const job = await t.run((ctx) => ctx.db.system.get(release!.relatedMetadataBackfillJobId!));
    expect(job?.state.kind).toBe("failed");
    expect(release?.relatedMetadataBackfillAttempts).toBe(attempt);
  }
  const stopped = await t.run((ctx) => ctx.db.get(releaseId));
  for (let poll = 0; poll < 2; poll++) await expect(activate()).rejects.toThrow("RELATED_METADATA_BACKFILL_FAILED");
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toEqual(stopped);
  const healthyId = await t.run(async (ctx) => {
    const healthyId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "healthy", locale: "en", distro: "ubuntu", imageRef: "test", imageDigest: "test",
      ingestedAt: "now", pageCount: 1, sealed: true, manifestBasis: "declared", manifestVerified: true,
    });
    for (const [id, datasetReleaseId, distro] of [[releaseId, "failed", "debian"], [healthyId, "healthy", "ubuntu"]] as const) {
      await ctx.db.insert("activeReleases", { releaseId: id, datasetReleaseId, distro, stage: "prod", locale: "en", activatedAt: "now" });
    }
    return healthyId;
  });
  expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({
    scheduled: 1, skipped: 0, stopped: [{ datasetReleaseId: "failed", distro: "debian", error: "RELATED_METADATA_BACKFILL_FAILED" }],
  });
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toEqual(stopped);
  expect((await t.query(internal.related.activeMetadataStatus, {})).releases).toEqual(expect.arrayContaining([
    expect.objectContaining({ datasetReleaseId: "failed", backfillStopped: true, complete: false }),
    expect.objectContaining({ datasetReleaseId: "healthy", backfillStopped: false }),
  ]));
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await t.run((ctx) => ctx.db.get(healthyId)))?.relatedMetadataCompletedVersion).toBe(0);
  await t.run((ctx) => ctx.db.delete(duplicate));
  await t.mutation(internal.related.retryFailedBackfill, { datasetReleaseId: "failed" });
  expect(await activate()).toMatchObject({ pending: true });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await activate()).toMatchObject({ pending: false });
});
