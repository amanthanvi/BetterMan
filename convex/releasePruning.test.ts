/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const activatedAt = "2026-09-07T00:00:00Z";

async function seededRelease(completed = true) {
  const t = convexTest(schema, modules);
  const releaseId = await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "pruning-test", locale: "en", distro: "debian",
      imageRef: "test", imageDigest: "test", ingestedAt: activatedAt, pageCount: 2,
      ...(completed ? { sealed: true, relatedMetadataCompletedVersion: 0 } : {}),
    });
    await ctx.db.insert("releaseSectionStats", {
      releaseId, datasetReleaseId: "pruning-test", section: "1", label: "User Commands", total: 2,
    });
    for (const name of ["source", "target"]) {
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId: "pruning-test", externalId: name,
        locale: "en", distro: "debian", name, section: "1", sitemapPage: 0,
        title: `${name}(1)`, description: `${name} description`,
        sourcePath: `/man/${name}.1`, contentSha256: name, hasParseWarnings: false,
      });
      if (name === "source") {
        await ctx.db.insert("manPageLinks", {
          releaseId, fromPageId: pageId, fromExternalId: name,
          toName: "target", toSection: "1", linkType: "see_also",
        });
      }
    }
    return releaseId;
  });
  return { t, releaseId };
}

afterEach(() => vi.useRealTimers());

describe("release pruning safety", () => {
  it("marks the first deletion batch and rejects activation between batches", async () => {
    const { t, releaseId } = await seededRelease();
    expect(await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, {
      datasetReleaseId: "pruning-test", confirmDatasetReleaseId: "pruning-test", maxDocs: 1,
    })).toMatchObject({ deleted: 1, deletedRelease: false, hasMore: true });
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ pruning: true });
    expect(await t.run((ctx) => ctx.db.query("manPages").take(10))).toHaveLength(2);
    await expect(t.mutation(internal.ingest.activateRelease, {
      datasetReleaseId: "pruning-test", stage: "prod", activatedAt,
    })).rejects.toThrow("RELEASE_PRUNING");
    expect(await t.run((ctx) => ctx.db.query("activeReleases").take(10))).toEqual([]);

    expect(await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, {
      datasetReleaseId: "pruning-test", confirmDatasetReleaseId: "pruning-test", maxDocs: 20,
    })).toMatchObject({ deletedRelease: true, hasMore: false });
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toBeNull();
  });

  it.each(["staging", "prod"] as const)("does not mark or delete a %s active release", async (stage) => {
    const { t, releaseId } = await seededRelease();
    await t.run((ctx) => ctx.db.insert("activeReleases", {
      stage, locale: "en", distro: "debian", releaseId, datasetReleaseId: "pruning-test", activatedAt,
    }));
    const before = await t.run((ctx) => ctx.db.get(releaseId));
    await expect(t.mutation(internal.maintenance.deleteInactiveReleaseBatch, {
      datasetReleaseId: "pruning-test", confirmDatasetReleaseId: "pruning-test", maxDocs: 1,
    })).rejects.toThrow("REFUSING_TO_DELETE_ACTIVE_RELEASE");
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("releaseSectionStats").take(10))).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("manPages").take(10))).toHaveLength(2);
  });

  it("prevents pending sealed activation from publishing after pruning begins", async () => {
    vi.useFakeTimers();
    const { t, releaseId } = await seededRelease(false);
    expect(await t.mutation(internal.ingest.activateRelease, {
      datasetReleaseId: "pruning-test", stage: "prod", activatedAt,
    })).toMatchObject({ pending: true });
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ sealed: true });
    await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, {
      datasetReleaseId: "pruning-test", confirmDatasetReleaseId: "pruning-test", maxDocs: 1,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const release = await t.run((ctx) => ctx.db.get(releaseId));
    expect(release).toMatchObject({ pruning: true });
    expect(release?.relatedMetadataCompletedVersion).toBeUndefined();
    const links = await t.run((ctx) => ctx.db.query("manPageLinks").take(10));
    expect(links).toHaveLength(1);
    expect(links[0]).not.toHaveProperty("toTitle");
    await expect(t.mutation(internal.ingest.activateRelease, {
      datasetReleaseId: "pruning-test", stage: "prod", activatedAt,
    })).rejects.toThrow("RELEASE_PRUNING");
    expect(await t.run((ctx) => ctx.db.query("activeReleases").take(10))).toEqual([]);
  });
});
