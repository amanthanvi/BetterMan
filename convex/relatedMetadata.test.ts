/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const releaseInput = (datasetReleaseId: string) => ({
  datasetReleaseId,
  locale: "en",
  distro: "debian" as const,
  imageRef: "test",
  imageDigest: "test",
  ingestedAt: "2026-09-07T00:00:00Z",
  packageManifest: null,
  pageCount: 3,
  sectionTotals: [],
  licensePackages: [],
});
const pageInput = (name: string) => ({
  externalId: name,
  name,
  section: "1",
  sitemapPage: 0,
  title: `${name}(1)`,
  description: `${name} description`,
  sourcePath: `/man/${name}.1`,
  sourcePackage: null,
  sourcePackageVersion: null,
  contentSha256: name,
  hasParseWarnings: false,
  doc: {},
  synopsis: null,
  options: null,
  seeAlso: null,
  searchText: "",
  snippetText: "",
  links: [],
});

async function seedPage(ctx: MutationCtx, releaseId: Id<"datasetReleases">, name: string) {
  return ctx.db.insert("manPages", {
    releaseId, datasetReleaseId: "fixture", externalId: name,
    locale: "en", distro: "debian", name, section: "1", sitemapPage: 0,
    title: `${name}(1)`, description: `${name} description`,
    sourcePath: `/man/${name}.1`, contentSha256: name, hasParseWarnings: false,
  });
}

afterEach(() => vi.useRealTimers());

describe("related metadata backfill", () => {
  it.each(["inline", "storage"])("hydrates forward references from %s ingestion after activation", async (storageMode) => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("new"));
    const source = {
      ...pageInput("source"),
      links: [
        { toExternalId: "target", toName: "target", toSection: "1", linkType: "see_also" as const },
        { toExternalId: null, toName: "missing", toSection: "1", linkType: "xref" as const },
      ],
    };
    if (storageMode === "inline") {
      await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "new", pages: [source] });
    } else {
      const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["{}"], { type: "application/json" })));
      const { doc, synopsis, options, seeAlso, ...metadata } = source;
      void doc; void synopsis; void options; void seeAlso;
      await t.mutation(internal.ingest.insertStoredPages, {
        datasetReleaseId: "new", pages: [{ ...metadata, contentStorageId }],
      });
    }
    await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "new", pages: [pageInput("target")] });
    expect(await t.mutation(internal.ingest.activateRelease, {
      datasetReleaseId: "new", stage: "prod", activatedAt: "2026-09-07T00:00:00Z",
    })).toMatchObject({ pending: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.ingest.activateRelease, {
      datasetReleaseId: "new", stage: "prod", activatedAt: "2026-09-07T00:00:00Z",
    })).toMatchObject({ pending: false });
    const links = await t.run((ctx) => ctx.db.query("manPageLinks").withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(10));
    expect(links[0]).toMatchObject({ toTitle: "target(1)", toDescription: "target description" });
    expect(links[1]).not.toHaveProperty("toTitle");
    expect(await t.query(api.queries.getRelated, { distro: "debian", name: "source", section: "1" })).toEqual({
      items: [{ name: "target", section: "1", title: "target(1)", description: "target description" }],
    });
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "new", cursor: null })).toMatchObject({ updated: 0, isDone: true });
    const completed = await t.run((ctx) => ctx.db.get(releaseId));
    expect(completed?.relatedMetadataCompletedVersion).toBe(completed?.relatedMetadataVersion);
    // Once sealed, a missing reference cannot become a stale cached result.
    if (storageMode === "inline") {
      await expect(t.mutation(internal.ingest.insertPages, { datasetReleaseId: "new", pages: [pageInput("missing")] })).rejects.toThrow("RELEASE_SEALED");
    } else {
      const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["{}"], { type: "application/json" })));
      const { doc, synopsis, options, seeAlso, ...metadata } = pageInput("missing");
      void doc; void synopsis; void options; void seeAlso;
      await expect(t.mutation(internal.ingest.insertStoredPages, { datasetReleaseId: "new", pages: [{ ...metadata, contentStorageId }] })).rejects.toThrow("RELEASE_SEALED");
    }
    expect((await t.query(api.queries.getRelated, { distro: "debian", name: "source", section: "1" }))?.items.map((item) => item.name)).toEqual(["target"]);
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toEqual(completed);
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 0, skipped: 1 });
  });

  it("bounds batches and schedules the remainder", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("large"));
    await t.run(async (ctx) => {
      await ctx.db.patch(releaseId, { sealed: true });
      const sourceId = await seedPage(ctx, releaseId, "source");
      await seedPage(ctx, releaseId, "target");
      for (let index = 0; index < 205; index += 1) {
        await ctx.db.insert("manPageLinks", {
          releaseId, fromPageId: sourceId, fromExternalId: "source",
          toName: "target", toSection: "1", linkType: "xref",
        });
      }
    });
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "large", cursor: null })).toMatchObject({ processed: 100, updated: 100, isDone: false });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const links = await t.run((ctx) => ctx.db.query("manPageLinks").withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(300));
    expect(links).toHaveLength(205);
    expect(links.every((link) => link.toTitle === "target(1)" && link.toDescription === "target description")).toBe(true);
  });

  it("migrates and seals legacy releases before promotion without resolving into another release", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("legacy"));
    const other = await t.mutation(internal.ingest.createRelease, releaseInput("other"));
    await t.run(async (ctx) => {
      const sourceId = await seedPage(ctx, releaseId, "source");
      await seedPage(ctx, releaseId, "target");
      await seedPage(ctx, other.releaseId, "elsewhere");
      for (const toName of ["target", "elsewhere"]) {
        await ctx.db.insert("manPageLinks", {
          releaseId, fromPageId: sourceId, fromExternalId: "source", toName, toSection: "1", linkType: "see_also",
        });
      }
      await ctx.db.insert("activeReleases", {
        stage: "staging", locale: "en", distro: "debian", releaseId,
        datasetReleaseId: "legacy", activatedAt: "2026-09-07T00:00:00Z",
      });
    });
    await expect(t.mutation(internal.ingest.promoteActiveReleases, {
      fromStage: "staging", toStage: "prod", distros: ["debian"], activatedAt: "2026-09-07T00:00:00Z",
    })).rejects.toThrow("RELEASE_NOT_SEALED");
    await t.mutation(internal.related.backfillActiveReleases, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.mutation(internal.ingest.promoteActiveReleases, {
      fromStage: "staging", toStage: "prod", distros: ["debian"], activatedAt: "2026-09-07T00:00:00Z",
    });
    const links = await t.run((ctx) => ctx.db.query("manPageLinks").withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(10));
    expect(links[0]).toMatchObject({ toTitle: "target(1)" });
    expect(links[1]).not.toHaveProperty("toTitle");
  });

  it("stops when a release was removed before its batch ran", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "removed", cursor: null })).toEqual({
      processed: 0, updated: 0, isDone: true, continueCursor: null,
    });
  });

  it("deduplicates active stages and skips completed releases on later deployments and activations", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("active"));
    await t.run(async (ctx) => {
      for (const stage of ["staging", "prod"] as const) {
        await ctx.db.insert("activeReleases", {
          stage, locale: "en", distro: "debian", releaseId,
          datasetReleaseId: "active", activatedAt: "2026-09-07T00:00:00Z",
        });
      }
    });
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 1, skipped: 0 });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 0, skipped: 1 });
    const before = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100));
    await t.mutation(internal.ingest.activateRelease, {
      stage: "prod", datasetReleaseId: "active", activatedAt: "2026-09-07T01:00:00Z",
    });
    await t.mutation(internal.ingest.promoteActiveReleases, {
      fromStage: "staging", toStage: "prod", distros: ["debian"], activatedAt: "2026-09-07T01:00:00Z",
    });
    const after = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100));
    expect(after).toHaveLength(before.length);
  });

  it("rejects uploads between hydration batches while preserving duplicate replays", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("resumed"));
    await t.run(async (ctx) => {
      await ctx.db.patch(releaseId, { sealed: true });
      const sourceId = await seedPage(ctx, releaseId, "source");
      for (let index = 0; index < 105; index += 1) {
        await ctx.db.insert("manPageLinks", {
          releaseId, fromPageId: sourceId, fromExternalId: "source",
          toName: "later", toSection: "1", linkType: "xref",
        });
      }
    });
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "resumed", cursor: null })).toMatchObject({ processed: 100, updated: 0, isDone: false });
    await expect(t.mutation(internal.ingest.insertPages, { datasetReleaseId: "resumed", pages: [pageInput("later")] })).rejects.toThrow("RELEASE_SEALED");
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const links = await t.run((ctx) => ctx.db.query("manPageLinks").withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(200));
    expect(links).toHaveLength(105);
    expect(links.every((link) => link.toTitle === undefined)).toBe(true);
    const release = await t.run((ctx) => ctx.db.get(releaseId));
    expect(release?.relatedMetadataCompletedVersion).toBe(release?.relatedMetadataVersion ?? 0);
    // Replaying already-uploaded pages neither changes metadata nor invalidates completion.
    expect(await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "resumed", pages: [pageInput("source")] })).toEqual({ inserted: 0, skipped: 1 });
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toEqual(release);
  });
});

describe("active metadata readiness", () => {
  it("reports pending and sealed completion without scheduling work itself", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("readiness"));
    await t.run(async (ctx) => {
      for (const stage of ["staging", "prod"] as const) {
        await ctx.db.insert("activeReleases", {
          stage, locale: "en", distro: "debian", releaseId,
          datasetReleaseId: "readiness", activatedAt: "2026-09-07T00:00:00Z",
        });
      }
    });
    const pending = {
      complete: false,
      releases: ["staging", "prod"].map((stage) => ({
        datasetReleaseId: "readiness", stage, distro: "debian",
        currentVersion: 0, completedVersion: null, sealed: false, complete: false,
      })),
    };
    expect(await t.query(internal.related.activeMetadataStatus, {})).toEqual(pending);
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
    await expect(t.mutation(internal.related.backfillRelease, { datasetReleaseId: "readiness", cursor: null })).rejects.toThrow("RELEASE_NOT_SEALED");
    await t.mutation(internal.related.backfillActiveReleases, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.query(internal.related.activeMetadataStatus, {})).toEqual({
      complete: true,
      releases: pending.releases.map((release) => ({ ...release, completedVersion: 0, sealed: true, complete: true })),
    });
    await expect(t.mutation(internal.ingest.insertPages, { datasetReleaseId: "readiness", pages: [pageInput("new")] })).rejects.toThrow("RELEASE_SEALED");
    const before = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100));
    expect(await t.query(internal.related.activeMetadataStatus, {})).toEqual({
      complete: true,
      releases: pending.releases.map((release) => ({ ...release, completedVersion: 0, sealed: true, complete: true })),
    });
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100))).toEqual(before);
  });

  it("reports a missing release as incomplete", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("missing"));
    await t.run(async (ctx) => {
      await ctx.db.insert("activeReleases", {
        stage: "prod", locale: "en", distro: "debian", releaseId,
        datasetReleaseId: "missing", activatedAt: "2026-09-07T00:00:00Z",
      });
      await ctx.db.delete(releaseId);
    });
    expect(await t.query(internal.related.activeMetadataStatus, {})).toEqual({
      complete: false,
      releases: [{
        datasetReleaseId: "missing", stage: "prod", distro: "debian",
        currentVersion: null, completedVersion: null, sealed: false, complete: false,
      }],
    });
  });

  it("does not declare an empty dataset ready", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(internal.related.activeMetadataStatus, {})).toEqual({ complete: false, releases: [] });
  });

  it("fails closed on duplicate active pointers", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("duplicate"));
    await t.run(async (ctx) => {
      await ctx.db.patch(releaseId, { relatedMetadataCompletedVersion: 0 });
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("activeReleases", {
          stage: "prod", locale: "en", distro: "debian", releaseId,
          datasetReleaseId: "duplicate", activatedAt: "2026-09-07T00:00:00Z",
        });
      }
    });
    await expect(t.query(internal.related.activeMetadataStatus, {})).rejects.toThrow();
    await expect(t.mutation(internal.related.backfillActiveReleases, {})).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(releaseId)))?.sealed).not.toBe(true);
  });
});
