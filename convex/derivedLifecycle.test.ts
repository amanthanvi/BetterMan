/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Distro } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
const now = "2026-10-28T00:00:00Z";

async function readyRelease(t: Harness, name: string, ingestedAt: string, distro: Distro = "debian") {
  const { releaseId } = await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId: name, distro, locale: "en", imageRef: "test", imageDigest: "test",
    ingestedAt, packageManifest: null, pageCount: 3, aliasCount: 0, licenseCount: 0,
    sectionTotals: [{ section: "1", total: 3 }], licensePackages: [],
  });
  await t.mutation(internal.ingest.insertPages, {
    datasetReleaseId: name,
    pages: ["tar", "gzip", "cpio"].map((name) => ({
      externalId: name, name, section: "1", sitemapPage: 0, title: "tar(1)", description: "archive",
      sourcePath: "tar.1", sourcePackage: null, sourcePackageVersion: null,
      contentSha256: name, hasParseWarnings: false, searchText: "tar", snippetText: "archive", links: [],
      doc: { toc: [], blocks: [] }, synopsis: null, options: null, seeAlso: null,
    })),
  });
  await t.run((ctx) => ctx.db.patch(releaseId, {
    sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 1,
  }));
  return releaseId;
}

const activate = (t: Harness, datasetReleaseId: string, stage: "prod" | "staging" = "prod") =>
  t.mutation(internal.ingest.activateRelease, { datasetReleaseId, stage, activatedAt: now });
const build = (t: Harness) => t.run((ctx) => ctx.db.query("derivedBuilds")
  .withIndex("by_locale", (q) => q.eq("locale", "en")).unique());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("derived release lifecycle", () => {
  it("starts only after a prod pointer is active, and joins the same pending build", async () => {
    const t = convexTest(schema, modules);
    const releaseId = await readyRelease(t, "new", "2026-10-01T00:00:00Z");
    await t.run((ctx) => ctx.db.patch(releaseId, { relatedMetadataCompletedVersion: undefined }));
    expect(await activate(t, "new")).toMatchObject({ pending: true });
    expect(await build(t)).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("activeReleases").take(1))).toEqual([]);
    await t.run((ctx) => ctx.db.patch(releaseId, { relatedMetadataCompletedVersion: 1 }));
    await activate(t, "new", "staging");
    expect(await build(t)).toBeNull();
    await activate(t, "new");
    const started = await build(t);
    expect(started).not.toBeNull();
    expect(started?.pointers).toEqual([{ distro: "debian", releaseId, datasetReleaseId: "new" }]);
    await activate(t, "new");
    expect(await build(t)).toEqual(started);
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({
      previousProdReleaseRecorded: true, derivedExpectedKey: started!.key,
    });
  });

  it("captures the older prod predecessor once and preserves it across rollbacks", async () => {
    const t = convexTest(schema, modules);
    const oldId = await readyRelease(t, "old", "2026-08-01T00:00:00Z");
    const nextId = await readyRelease(t, "next", "2026-09-01T00:00:00Z");
    await readyRelease(t, "ancient", "2026-07-01T00:00:00Z");
    await activate(t, "old");
    await activate(t, "next");
    expect(await t.run((ctx) => ctx.db.get(nextId))).toMatchObject({
      previousProdReleaseRecorded: true, previousProdReleaseId: oldId,
    });
    expect(await t.run((ctx) => ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", oldId)).unique())).toMatchObject({ required: true });
    await activate(t, "ancient");
    await activate(t, "old");
    expect((await t.run((ctx) => ctx.db.get(oldId)))?.previousProdReleaseId).toBeUndefined();
    await activate(t, "ancient");
    await activate(t, "next");
    expect((await t.run((ctx) => ctx.db.get(nextId)))?.previousProdReleaseId).toBe(oldId);
  });

  it.each(["2026-10-01T00:00:00Z", "not-a-date"])("does not use an ineligible predecessor dated %s", async (date) => {
    const t = convexTest(schema, modules);
    const previousId = await readyRelease(t, "previous", date);
    const nextId = await readyRelease(t, "next", "2026-09-01T00:00:00Z");
    await activate(t, "previous");
    await activate(t, "next");
    expect((await t.run((ctx) => ctx.db.get(nextId)))?.previousProdReleaseId).toBeUndefined();
    expect(previousId).not.toBe(nextId);
  });

  it("captures promotion history from prod and rolls back failed multi-distro promotions", async () => {
    const t = convexTest(schema, modules);
    const previousId = await readyRelease(t, "previous", "2026-08-01T00:00:00Z");
    const nextId = await readyRelease(t, "next", "2026-09-01T00:00:00Z");
    await activate(t, "previous");
    await activate(t, "next", "staging");
    const before = await build(t);
    const promotion = { fromStage: "staging" as const, toStage: "prod" as const, activatedAt: now };
    await expect(t.mutation(internal.ingest.promoteActiveReleases, {
      ...promotion, distros: ["debian", "ubuntu"],
    })).rejects.toThrow("ACTIVE_RELEASE_NOT_FOUND");
    expect(await build(t)).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get(nextId)))?.previousProdReleaseRecorded).toBeUndefined();
    await t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, distros: ["debian"] });
    expect((await t.run((ctx) => ctx.db.get(nextId)))?.previousProdReleaseId).toBe(previousId);
    expect((await build(t))?.key).not.toBe(before?.key);
    const started = await build(t);
    await t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, distros: ["debian"] });
    expect(await build(t)).toEqual(started);
  });

  it("keeps durable dependency pins protected after lease expiry until references clear", async () => {
    const t = convexTest(schema, modules);
    const releaseId = await readyRelease(t, "leased", "2026-08-01T00:00:00Z");
    const statusId = await t.run((ctx) => ctx.db.insert("derivedReleaseStatus", { releaseId, locale: "en", required: true, pendingRefs: 1, readyRows: 0, leaseUntil: Date.now() + 1000, updatedAt: Date.now() }));
    const args = { datasetReleaseId: "leased", confirmDatasetReleaseId: "leased", maxDocs: 1 };
    await expect(t.mutation(internal.maintenance.deleteInactiveReleaseBatch, args)).rejects.toThrow("RELEASE_DERIVED_BUILD_IN_PROGRESS");
    vi.setSystemTime(new Date(Date.now() + 1001));
    await expect(t.mutation(internal.maintenance.deleteInactiveReleaseBatch, args)).rejects.toThrow("RELEASE_DERIVED_BUILD_IN_PROGRESS");
    await t.run((ctx) => ctx.db.patch(statusId, { required: false, pendingRefs: 0 }));
    expect(await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, args)).toMatchObject({ deleted: 1 });
  });

  it("includes derived children in bounded pruning and storage statistics", async () => {
    const t = convexTest(schema, modules);
    const releaseId = await readyRelease(t, "prune", "2026-08-01T00:00:00Z");
    await t.run(async (ctx) => {
      const page = await ctx.db.query("manPages")
        .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId).eq("externalId", "tar")).unique();
      const pageId = page!._id;
      const existing = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", releaseId).eq("pageId", pageId)).unique();
      if (!existing) await ctx.db.insert("derivedPageInputs", {
        releaseId, pageId, name: "tar", section: "1", contentSha256: "hash", optionsJson: "[]", truncated: false,
      });
      await ctx.db.insert("manPageDerived", { releaseId, pageId, key: "test", summaryJson: "{}" });
    });
    const preview = await t.query(internal.maintenance.previewInactiveReleases, {});
    expect(preview.inactive[0].children).toMatchObject({
      derivedPageInputs: { count: 3, hasMore: false }, manPageDerived: { count: 1, hasMore: false },
    });
    for (const table of ["derivedPageInputs", "manPageDerived"] as const) {
      expect(await t.query(internal.maintenance.estimateStorageStatsBatch, { table, cursor: null, limit: 1 }))
        .toMatchObject({ scanned: 1 });
    }
    const args = { datasetReleaseId: "prune", confirmDatasetReleaseId: "prune", maxDocs: 1 };
    const removed = new Set<string>();
    for (let batch = 0; batch < 30; batch += 1) {
      const result = await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, args);
      expect(result.deleted).toBe(1);
      for (const table of Object.keys(result.deletedByTable)) removed.add(table);
      if (result.deletedRelease) break;
    }
    expect(removed.has("derivedPageInputs")).toBe(true);
    expect(removed.has("manPageDerived")).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toBeNull();
  });
  it("freezes unknown pre-B7 active history before rollback and re-promotion", async () => {
    const t = convexTest(schema, modules);
    const current = await readyRelease(t, "legacy-current", "2026-10-01T00:00:00Z");
    await readyRelease(t, "older", "2026-07-01T00:00:00Z");
    await t.run((ctx) => ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId: current, datasetReleaseId: "legacy-current", activatedAt: now }));
    await activate(t, "legacy-current");
    expect((await t.run((ctx) => ctx.db.get(current)))?.previousProdReleaseRecorded).toBe(true);
    await activate(t, "older");
    await activate(t, "legacy-current");
    expect((await t.run((ctx) => ctx.db.get(current)))?.previousProdReleaseId).toBeUndefined();
  });

  it("does not let an unrelated legacy peer block verified promotion and resumes once verified", async () => {
    const t = convexTest(schema, modules);
    const legacy = await readyRelease(t, "legacy-ubuntu", "2026-09-01T00:00:00Z", "ubuntu");
    await t.run(async (ctx) => {
      await ctx.db.patch(legacy, { manifestVerified: undefined });
      await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "ubuntu", releaseId: legacy, datasetReleaseId: "legacy-ubuntu", activatedAt: now });
    });
    await readyRelease(t, "new-debian", "2026-10-01T00:00:00Z");
    await activate(t, "new-debian", "staging");
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { fromStage: "staging", toStage: "prod", distros: ["debian"], activatedAt: now }))
      .toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "new-debian" }] });
    expect(await build(t)).toMatchObject({ phase: "blocked", error: "DERIVED_RELEASE_NOT_READY" });
    await t.run((ctx) => ctx.db.patch(legacy, { manifestVerified: true }));
    expect(await t.mutation(internal.derived.rebuildActive, {})).toBe(true);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await build(t))?.phase).toBe("complete");
  });

});
