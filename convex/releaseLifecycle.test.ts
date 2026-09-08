/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DATASET_STAGES, DISTROS, type DatasetStage, type Distro } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
const kinds = ["inline", "storage", "aliases", "licenses"] as const;
const activation = (datasetReleaseId: string) => ({
  datasetReleaseId, stage: "prod" as const, activatedAt: "2026-09-07T00:00:00Z",
});
const releaseInput = (datasetReleaseId: string, distro: Distro = "debian") => ({
  datasetReleaseId, distro, locale: "en", imageRef: "test", imageDigest: "test",
  ingestedAt: "2026-09-07T00:00:00Z", packageManifest: null,
  pageCount: 1, sectionTotals: [], licensePackages: [],
});

async function pointRelease(t: Harness, releaseId: Id<"datasetReleases">, stage: DatasetStage) {
  return t.run(async (ctx) => {
    const release = await ctx.db.get(releaseId);
    if (!release) throw new Error("fixture release missing");
    return ctx.db.insert("activeReleases", {
      releaseId, datasetReleaseId: release.datasetReleaseId,
      stage, locale: release.locale, distro: release.distro, activatedAt: "2026-09-07T00:00:00Z",
    });
  });
}
async function write(t: Harness, kind: typeof kinds[number], datasetReleaseId: string, name: string) {
  if (kind === "aliases") {
    return t.mutation(internal.ingest.insertAliases, {
      datasetReleaseId, aliases: [{ name, section: "1", targetName: "target", targetSection: "1" }],
    });
  }
  if (kind === "licenses") {
    return t.mutation(internal.ingest.insertLicenses, {
      datasetReleaseId, licenses: [{ packageName: name, licenseId: name, licenseName: name, licenseText: name, sourceUrl: null }],
    });
  }
  const metadata = {
    externalId: name, name, section: "1", sitemapPage: 0, title: name, description: name,
    sourcePath: name, sourcePackage: null, sourcePackageVersion: null,
    contentSha256: name, hasParseWarnings: false, searchText: name, snippetText: name, links: [],
  };
  if (kind === "storage") {
    const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["{}"], { type: "application/json" })));
    return t.mutation(internal.ingest.insertStoredPages, { datasetReleaseId, pages: [{ ...metadata, contentStorageId }] });
  }
  return t.mutation(internal.ingest.insertPages, {
    datasetReleaseId, pages: [{ ...metadata, doc: {}, synopsis: null, options: null, seeAlso: null }],
  });
}
async function releaseRows(t: Harness, releaseId: Id<"datasetReleases">) {
  return t.run(async (ctx) => ({
    release: await ctx.db.get(releaseId),
    pages: await ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId)).take(100),
    aliases: await ctx.db.query("manPageAliases").withIndex("by_releaseId_and_name", (q) => q.eq("releaseId", releaseId)).take(100),
    licenses: await ctx.db.query("licenses").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId)).take(100),
  }));
}

afterEach(() => vi.useRealTimers());

describe("release sealing", () => {
  it("leaves the old pointer in place while pending, joins polling jobs, then activates atomically", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const previous = await t.mutation(internal.ingest.createRelease, releaseInput("previous"));
    const pointerId = await pointRelease(t, previous.releaseId, "prod");
    const next = await t.mutation(internal.ingest.createRelease, releaseInput("next"));
    await write(t, "inline", "next", "uploaded-before-seal");
    const oldPointer = await t.run((ctx) => ctx.db.get(pointerId));
    for (let poll = 0; poll < 5; poll += 1) {
      expect(await t.mutation(internal.ingest.activateRelease, activation("next"))).toEqual({
        stage: "prod", distro: "debian", datasetReleaseId: "next", pending: true,
      });
      expect(await t.run((ctx) => ctx.db.get(pointerId))).toEqual(oldPointer);
    }
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100));
    expect(jobs).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(next.releaseId)))?.sealed).toBe(true);
    await expect(write(t, "inline", "next", "upload-after-seal")).rejects.toThrow("RELEASE_SEALED");
    expect(await t.run((ctx) => ctx.db.get(pointerId))).toEqual(oldPointer);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.ingest.activateRelease, activation("next"))).toEqual({
      stage: "prod", distro: "debian", datasetReleaseId: "next", pending: false,
    });
    expect(await t.run((ctx) => ctx.db.get(pointerId))).toMatchObject({ releaseId: next.releaseId, datasetReleaseId: "next" });
    expect((await t.run((ctx) => ctx.db.get(previous.releaseId)))?.sealed).toBe(true);
    expect((await releaseRows(t, next.releaseId)).pages.map((page) => page.name)).toEqual(["uploaded-before-seal"]);
  });

  it.each(["sealed", "legacy-active", "retired-sealed"])("permits only duplicate no-op replays for all four ingestion paths on %s releases", async (state) => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("locked"));
    for (const kind of kinds) await write(t, kind, "locked", `original-${kind}`);
    if (state === "legacy-active") {
      await pointRelease(t, releaseId, "prod");
    } else if (state === "sealed") {
      await t.mutation(internal.ingest.activateRelease, activation("locked"));
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } else {
      await pointRelease(t, releaseId, "prod");
      await t.mutation(internal.ingest.createRelease, releaseInput("replacement"));
      await t.mutation(internal.ingest.activateRelease, activation("replacement"));
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      await t.mutation(internal.ingest.activateRelease, activation("replacement"));
      expect((await t.run((ctx) => ctx.db.get(releaseId)))?.sealed).toBe(true);
    }
    const before = await releaseRows(t, releaseId);
    for (const kind of kinds) {
      expect(await write(t, kind, "locked", `original-${kind}`)).toEqual({ inserted: 0, skipped: 1 });
      await expect(write(t, kind, "locked", `new-${kind}`)).rejects.toThrow("RELEASE_SEALED");
    }
    expect(await t.mutation(internal.ingest.createRelease, releaseInput("locked"))).toEqual({ releaseId, existed: true });
    expect(await releaseRows(t, releaseId)).toEqual(before);
  });

  it("recovers a canceled hydration chain on a later activation poll", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("retry"));
    await t.mutation(internal.ingest.activateRelease, activation("retry"));
    await t.run(async (ctx) => {
      const release = await ctx.db.get(releaseId);
      if (!release?.relatedMetadataBackfillJobId) throw new Error("missing fixture job");
      await ctx.scheduler.cancel(release.relatedMetadataBackfillJobId);
    });
    expect(await t.mutation(internal.ingest.activateRelease, activation("retry"))).toMatchObject({ pending: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.ingest.activateRelease, activation("retry"))).toMatchObject({ pending: false });
  });

  it.each(["missing", "unsealed", "incomplete", "pruning"])("rejects an entire multi-distro promotion when a requested source is %s", async (invalid) => {
    const t = convexTest(schema, modules);
    const previous = await t.mutation(internal.ingest.createRelease, releaseInput("previous"));
    const targetId = await pointRelease(t, previous.releaseId, "prod");
    const ready = await t.mutation(internal.ingest.createRelease, releaseInput("ready"));
    await t.run((ctx) => ctx.db.patch(ready.releaseId, { sealed: true, relatedMetadataCompletedVersion: 0 }));
    await pointRelease(t, ready.releaseId, "staging");
    if (invalid !== "missing") {
      const bad = await t.mutation(internal.ingest.createRelease, releaseInput("bad", "ubuntu"));
      await t.run((ctx) => ctx.db.patch(bad.releaseId, {
        sealed: invalid !== "unsealed",
        pruning: invalid === "pruning",
        relatedMetadataCompletedVersion: invalid === "incomplete" ? undefined : 0,
      }));
      await pointRelease(t, bad.releaseId, "staging");
    }
    const before = await t.run((ctx) => ctx.db.get(targetId));
    await expect(t.mutation(internal.ingest.promoteActiveReleases, {
      fromStage: "staging", toStage: "prod", distros: ["debian", "ubuntu"], activatedAt: "2026-09-07T00:00:00Z",
    })).rejects.toThrow({ missing: "ACTIVE_RELEASE_NOT_FOUND", unsealed: "RELEASE_NOT_SEALED", incomplete: "RELATED_METADATA_INCOMPLETE", pruning: "RELEASE_PRUNING" }[invalid]);
    expect(await t.run((ctx) => ctx.db.get(targetId))).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get(previous.releaseId)))?.sealed).not.toBe(true);
  });

  it("seals and hydrates all 14 supported active pointers before reporting ready", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    for (const stage of DATASET_STAGES) {
      for (const distro of DISTROS) {
        const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput(`${stage}-${distro}`, distro));
        await pointRelease(t, releaseId, stage);
      }
    }
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(false);
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 14, skipped: 0 });
    const pending = await t.query(internal.related.activeMetadataStatus, {});
    expect(pending.complete).toBe(false);
    expect(pending.releases).toHaveLength(14);
    expect(pending.releases.every((release) => release.sealed)).toBe(true);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(true);
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 0, skipped: 14 });
  });

  it("does not declare a completed but unsealed legacy release ready", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("legacy"));
    await t.run((ctx) => ctx.db.patch(releaseId, { relatedMetadataCompletedVersion: 0 }));
    await pointRelease(t, releaseId, "prod");
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(false);
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 0, skipped: 1 });
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(true);
  });

  it("rejects pruning release inputs and activation while stopping hydration and readiness", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("pruning"));
    for (const kind of kinds) await write(t, kind, "pruning", `original-${kind}`);
    await pointRelease(t, releaseId, "prod");
    await t.run((ctx) => ctx.db.patch(releaseId, { sealed: true, pruning: true, relatedMetadataCompletedVersion: 2 }));
    const before = await releaseRows(t, releaseId);
    for (const kind of kinds) {
      await expect(write(t, kind, "pruning", `original-${kind}`)).rejects.toThrow("RELEASE_PRUNING");
    }
    await expect(t.mutation(internal.ingest.createRelease, releaseInput("pruning"))).rejects.toThrow("RELEASE_PRUNING");
    await expect(t.mutation(internal.ingest.activateRelease, activation("pruning"))).rejects.toThrow("RELEASE_PRUNING");
    await expect(t.mutation(internal.related.backfillActiveReleases, {})).rejects.toThrow("RELEASE_PRUNING");
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "pruning", cursor: null })).toEqual({
      processed: 0, updated: 0, isDone: true, continueCursor: null,
    });
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(false);
    expect(await releaseRows(t, releaseId)).toEqual(before);
  });
});
