/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DISTROS, type DatasetStage, type Distro } from "./lib";
import { variantsForPage } from "./_releaseLookups";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
const activatedAt = "2026-10-12T00:00:00Z";
afterEach(() => vi.useRealTimers());

async function seed(t: Harness, distro: Distro, suffix = "old", names = ["tar", "removed"]) {
  return t.run(async (ctx) => {
    const datasetReleaseId = `${distro}:${suffix}`;
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId, distro, locale: "en", imageRef: "fixture", imageDigest: "fixture", ingestedAt: activatedAt,
      pageCount: names.length, sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0,
    });
    const pages: Array<Id<"manPages">> = [];
    for (const name of names) {
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId, distro, locale: "en", name, section: "1", sitemapPage: 0,
        externalId: `${name}:1`, title: name, description: name, sourcePath: name,
        contentSha256: `${distro}:${suffix}:${name}`, hasParseWarnings: false,
      });
      await ctx.db.insert("manPageContents", { pageId, docJson: "{}" });
      pages.push(pageId);
    }
    return { releaseId, datasetReleaseId, pages };
  });
}
async function activate(t: Harness, datasetReleaseId: string, stage: DatasetStage = "prod") {
  return t.mutation(internal.ingest.activateRelease, { datasetReleaseId, stage, activatedAt });
}
async function drain(t: Harness) {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
}
async function read(t: Harness, stage: DatasetStage = "prod", name = "tar") {
  const model = await t.query(internal.content.getManByNameAndSectionReadModel, {
    stage, distro: "debian", name, section: "1",
  });
  if (model?.kind !== "page") throw new Error("fixture page missing");
  return model.data.variants;
}

describe("materialized distribution variants", () => {
  it("activation writes caches for every active distro, preserving the exact fallback response", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const fedora = await seed(t, "fedora");
    const debian = await seed(t, "debian");
    await activate(t, fedora.datasetReleaseId);
    await activate(t, debian.datasetReleaseId);
    const fallback = await read(t);
    expect(fallback).toEqual([
      { distro: "debian", datasetReleaseId: "debian:old", contentSha256: "debian:old:tar" },
      { distro: "fedora", datasetReleaseId: "fedora:old", contentSha256: "fedora:old:tar" },
    ]);
    await drain(t);
    expect(await read(t)).toEqual(fallback);
    for (const pageId of [debian.pages[0], fedora.pages[0]]) {
      const page = await t.run((ctx) => ctx.db.get(pageId));
      expect(page?.variants).toEqual(fallback.map((item) => ({ ...item, name: "tar", section: "1" })));
      expect(page?.variantsVersion).toBe(2);
    }
  });

  it("promotion refreshes unchanged distro pages and removes absent variants immediately and after backfill", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const debian = await seed(t, "debian");
    const oldFedora = await seed(t, "fedora");
    await activate(t, debian.datasetReleaseId);
    await activate(t, oldFedora.datasetReleaseId);
    await drain(t);
    const nextFedora = await seed(t, "fedora", "next", ["tar"]);
    await activate(t, nextFedora.datasetReleaseId, "staging");
    await drain(t);
    await t.mutation(internal.ingest.promoteActiveReleases, {
      fromStage: "staging", toStage: "prod", distros: ["fedora"], activatedAt,
    });
    const expected = [
      { distro: "debian", datasetReleaseId: "debian:old", contentSha256: "debian:old:tar" },
      { distro: "fedora", datasetReleaseId: "fedora:next", contentSha256: "fedora:next:tar" },
    ];
    expect(await read(t)).toEqual(expected);
    expect(await read(t, "prod", "removed")).toHaveLength(1);
    await drain(t);
    expect(await read(t)).toEqual(expected);
    expect(await read(t, "prod", "removed")).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(debian.pages[0])))?.variants).toMatchObject(expected);
  });

  it("keeps stage caches independent when a release is active in both stages", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const shared = await seed(t, "debian");
    const prodFedora = await seed(t, "fedora", "prod");
    const stagingFedora = await seed(t, "fedora", "staging");
    await activate(t, shared.datasetReleaseId, "prod");
    await activate(t, shared.datasetReleaseId, "staging");
    await activate(t, prodFedora.datasetReleaseId, "prod");
    await activate(t, stagingFedora.datasetReleaseId, "staging");
    await drain(t);
    expect((await read(t, "prod"))[1].datasetReleaseId).toBe(prodFedora.datasetReleaseId);
    expect((await read(t, "staging"))[1].datasetReleaseId).toBe(stagingFedora.datasetReleaseId);
  });

  it("chains bounded batches, rejects superseded writes and can restart canceled refreshes", async () => {
    vi.useFakeTimers();
    const t = convexTest({ schema, modules, transactionLimits: true });
    const names = Array.from({ length: 121 }, (_, index) => `page${String(index).padStart(3, "0")}`);
    const release = await seed(t, "debian", "large", names);
    await activate(t, release.datasetReleaseId);
    const oldState = await t.run((ctx) => ctx.db.query("variantSnapshots").take(1));
    await t.mutation(internal.variants.refreshBatch, {
      stage: "prod", locale: "en", version: oldState[0].version, releaseIndex: 0, cursor: null,
    });
    expect(await t.run((ctx) => ctx.db.query("manPages").take(200).then((rows) => rows.filter((page) => page.variants).length))).toBe(50);
    await t.run((ctx) => ctx.scheduler.cancel(oldState[0].jobId));
    await t.mutation(internal.variants.backfillActiveReleases, {});
    // This old job must neither patch rows nor spawn more work.
    await t.mutation(internal.variants.refreshBatch, {
      stage: "prod", locale: "en", version: oldState[0].version, releaseIndex: 0, cursor: null,
    });
    await drain(t);
    const rows = await t.run((ctx) => ctx.db.query("manPages").take(200));
    expect(rows).toHaveLength(121);
    expect(rows.every((page) => page.variantsVersion === 2 && page.variants?.length === 1)).toBe(true);
  });

  it("reduces seven-distro variants reads from 14 documents to one snapshot read", async () => {
    vi.useFakeTimers();
    for (const [documentsRead, cached, passes] of [[14, false, true], [13, false, false], [1, true, true]] as const) {
      const t = convexTest({ schema, modules, transactionLimits: { documentsRead } });
      let debianPageId: Id<"manPages"> | undefined;
      const expected = DISTROS.map((distro) => ({
        distro, datasetReleaseId: `${distro}:budget`, contentSha256: `${distro}:budget:tar`,
      }));
      for (const distro of DISTROS) {
        const release = await seed(t, distro, "budget", ["tar"]);
        if (distro === "debian") debianPageId = release.pages[0];
        await t.run((ctx) => ctx.db.insert("activeReleases", {
          stage: "prod", locale: "en", distro, releaseId: release.releaseId,
          datasetReleaseId: release.datasetReleaseId, activatedAt,
        }));
      }
      if (!debianPageId) throw new Error("fixture page missing");
      const pageId = debianPageId;
      if (cached) await t.run(async (ctx) => {
        const jobId = await ctx.scheduler.runAfter(0, internal.variants.refreshBatch, {
          stage: "prod", locale: "en", version: 1, releaseIndex: 0, cursor: null,
        });
        await ctx.db.insert("variantSnapshots", { stage: "prod", locale: "en", version: 1, jobId });
        await ctx.db.patch(pageId, {
          variants: expected.map((item) => ({ ...item, name: "tar", section: "1" })), variantsVersion: 1,
        });
      });
      const page = await t.run((ctx) => ctx.db.get(pageId));
      if (!page) throw new Error("fixture page missing");
      const query = t.query((ctx) => variantsForPage(ctx, {
        stage: "prod", locale: "en", name: "tar", section: "1", page,
      }));
      if (passes) expect(await query).toEqual(expected);
      else await expect(query).rejects.toThrow("Scanned too many documents");
    }
  });
});
