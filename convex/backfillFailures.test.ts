/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("stops after three deliberately injected duplicate-route failures, and re-arms only after repair", async () => {
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
  // Deliberate database corruption: production ingestion rejects a second row
  // for the same (releaseId, name, section), including concurrent writers via
  // OCC. Bypass that guard here to make the real scheduled mutation fail. The
  // canonical route lookup's unique() is expected to reject this invalid state.
  const duplicate = await t.run(async (ctx) => {
    const first = await ctx.db.insert("manPages", { ...page, externalId: "one" });
    const duplicate = await ctx.db.insert("manPages", { ...page, externalId: "duplicate" });
    await ctx.db.insert("manPageLinks", { releaseId, fromPageId: first, fromExternalId: "one", toName: "target", toSection: "1", linkType: "xref" });
    await ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, uploadedPageCount: 1 });
    return duplicate;
  });
  const isInjectedFailure = (args: unknown[]) => args[0] === "Error when running scheduled function related:backfillRelease"
    && args[1] instanceof Error
    && args[1].message.startsWith("unique() query returned more than one result from table manPages:")
    && args[1].message.includes(duplicate);
  const reportError = console.error.bind(console);
  const scheduledFailure = vi.spyOn(console, "error").mockImplementation((...args) => {
    // Suppress only the exact injected failure. Unexpected diagnostics remain
    // visible and fail the assertions below rather than disappearing from CI.
    if (!isInjectedFailure(args)) reportError(...args);
  });
  const activate = () => t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "failed", stage: "prod", activatedAt: "now" });
  for (let attempt = 1; attempt <= 3; attempt++) {
    expect(await activate()).toMatchObject({ pending: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const release = await t.run((ctx) => ctx.db.get(releaseId));
    const job = await t.run((ctx) => ctx.db.system.get(release!.relatedMetadataBackfillJobId!));
    expect(job?.state.kind).toBe("failed");
    expect(scheduledFailure).toHaveBeenCalledTimes(attempt);
    expect(scheduledFailure).toHaveBeenLastCalledWith(
      "Error when running scheduled function related:backfillRelease",
      expect.objectContaining({ message: expect.stringContaining(duplicate) }),
    );
    expect(isInjectedFailure(scheduledFailure.mock.calls.at(-1)!)).toBe(true);
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
  expect(scheduledFailure).toHaveBeenCalledTimes(3); // Repair/healthy jobs add no errors.
});
