/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { MANIFEST_CONTENT_TYPE, MANIFEST_ORPHAN_MIN_AGE_MS } from "./_manifestStorage";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const activatedAt = "2026-09-07T00:00:00Z";

async function seededRelease(completed = true) {
  const t = convexTest(schema, modules);
  const releaseId = await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "pruning-test", locale: "en", distro: "debian",
      imageRef: "test", imageDigest: "test", ingestedAt: activatedAt, pageCount: 2,
      aliasCount: 0, licenseCount: 0, uploadedPageCount: 2, uploadedAliasCount: 0, uploadedLicenseCount: 0, manifestBasis: "declared",
      ...(completed ? { sealed: true, relatedMetadataCompletedVersion: 0 } : {}),
    });
    await ctx.db.insert("releaseSectionStats", {
      releaseId, datasetReleaseId: "pruning-test", section: "1", label: "User Commands", total: 2, uploaded: 2,
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
        await ctx.db.insert("manPageOptionFlags", {
          releaseId, pageId, nameNorm: name, section: "1", flag: "-c", anchorId: "c", flags: "-c",
        });
        await ctx.db.insert('manPageSymbols', { releaseId, pageId, name, section: '1', title: `${name}(1)`, description: 'symbol source', term: 'VARIABLE', termNorm: 'variable', anchorId: 'variable', excerpt: 'Definition', kind: 'environment' });
      }
    }
    return releaseId;
  });
  return { t, releaseId };
}

afterEach(() => vi.useRealTimers());

describe("release pruning safety", () => {
  it("preserves pinned payloads across every orphan sweep and lets unpinned pruning stop backfills", async () => {
    vi.useFakeTimers();
    const { t, releaseId } = await seededRelease();
    const ids = await t.run(async (ctx) => {
      await ctx.db.patch(releaseId, { relatedMetadataCompletedVersion: undefined });
      const pin = await ctx.db.insert("derivedReleaseStatus", { releaseId, locale: "en", required: false,
        pendingRefs: 1, readyRows: 1, leaseUntil: 0, updatedAt: 0 });
      const manifestStorage = await ctx.storage.store(new Blob(["{}"], { type: MANIFEST_CONTENT_TYPE }));
      const manifest = await ctx.db.insert("releaseManifests", { releaseId, storageId: manifestStorage });
      const contentStorage = await ctx.storage.store(new Blob(["page content"]));
      const blob = await ctx.db.insert("manPageContentBlobs", { contentSha256: "source", storageId: contentStorage });
      const source = await ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId).eq("externalId", "source")).unique();
      await ctx.db.insert("manPageContents", { pageId: source!._id, blobId: blob });
      const signature = await ctx.db.insert("derivedSignatureCache", { key: "source:1:signature", contentSha256: "source", extractorVersion: 1, signatureHash: "signature", optionsJson: "[]" });
      await ctx.db.insert("derivedPageInputs", { releaseId, pageId: source!._id, name: "source", section: "1",
        contentSha256: "source", signatureHash: "signature", optionsJson: "[]", status: "ready", truncated: false });
      const legacy = await ctx.db.insert("derivedLegacySignatures", { sourceKey: `options-v2:blob:${blob}`, optionsJson: "[]" });
      return { pin, manifestStorage, manifest, contentStorage, blob, signature, legacy };
    });
    vi.setSystemTime(Date.now() + MANIFEST_ORPHAN_MIN_AGE_MS + 1);
    const args = { datasetReleaseId: "pruning-test", confirmDatasetReleaseId: "pruning-test", maxDocs: 1 };
    await expect(t.mutation(internal.maintenance.deleteInactiveReleaseBatch, args)).rejects.toThrow("RELEASE_DERIVED_BUILD_IN_PROGRESS");
    expect((await t.run((ctx) => ctx.db.get(releaseId)))?.pruning).toBeUndefined();
    expect(await t.mutation(internal.maintenance.cleanupOrphanManifestFilesBatch, { cursor: null })).toMatchObject({ orphans: 0, storageDeletes: 0 });
    expect(await t.mutation(internal.maintenance.cleanupOrphanContentBlobsBatch, { cursor: null })).toMatchObject({ orphans: 0, blobDeletes: 0 });
    for (const table of ["derivedSignatureCache", "derivedLegacySignatures"] as const) {
      expect(await t.mutation(internal.maintenance.cleanupOrphanDerivedCachesBatch, { table, cursor: null })).toMatchObject({ orphans: 0, deleted: 0 });
    }
    for (const id of [ids.manifest, ids.blob, ids.signature, ids.legacy]) expect(await t.run((ctx) => ctx.db.get(id))).not.toBeNull();
    for (const id of [ids.manifestStorage, ids.contentStorage]) expect(await t.run(async (ctx) => (await ctx.storage.get(id)) !== null)).toBe(true);
    // A rejected prune cannot mark the release pruning and silently stop its queued backfill.
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "pruning-test" })).toMatchObject({ processed: 1, updated: 1, isDone: true });
    await t.run((ctx) => ctx.db.patch(ids.pin, { pendingRefs: 0, readyRows: 0 }));
    expect(await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, args)).toMatchObject({ deleted: 1, deletedRelease: false });
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "pruning-test" })).toEqual({ processed: 0, updated: 0, isDone: true, continueCursor: null });
    let deletedRelease = false;
    for (let i = 0; i < 20 && !deletedRelease; i++) {
      const result = await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { ...args, maxDocs: 2 });
      expect(result.deleted).toBeLessThanOrEqual(2);
      deletedRelease = result.deletedRelease;
    }
    expect(deletedRelease).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toBeNull();
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "pruning-test" })).toMatchObject({ processed: 0, isDone: true });
  });

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
    expect(await t.run(ctx => ctx.db.query('manPageSymbols').take(1))).toEqual([]);
  });

  it("deletes unpinned derived status and scan rows with release children in bounded batches", async () => {
    const { t, releaseId } = await seededRelease();
    await t.run(async (ctx) => {
      await ctx.db.insert("derivedReleaseStatus", { releaseId, locale: "en", required: false, pendingRefs: 0, readyRows: 0, leaseUntil: 0, updatedAt: 0 });
      await ctx.db.insert("derivedScanJobs", { releaseId, locale: "en", cursor: null, createdForKey: "old", scanned: 0, kind: "pages" });
    });
    let done = false;
    const counts: Record<string, number> = {};
    for (let batch = 0; batch < 20 && !done; batch++) {
      const result = await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { datasetReleaseId: "pruning-test", confirmDatasetReleaseId: "pruning-test", maxDocs: 2 });
      expect(result.deleted).toBeLessThanOrEqual(2);
      for (const [table, count] of Object.entries(result.deletedByTable)) counts[table] = (counts[table] ?? 0) + (count ?? 0);
      done = result.deletedRelease;
    }
    expect(done).toBe(true);
    expect(counts.derivedReleaseStatus).toBe(1);
    expect(counts.derivedScanJobs).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("derivedReleaseStatus").take(1))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("derivedScanJobs").take(1))).toEqual([]);
  });

  it("deletes stored page-content files with their content rows", async () => {
    const { t, releaseId } = await seededRelease();
    const storageId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["stored payload"]));
      const page = await ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId)).first();
      await ctx.db.insert("manPageContents", { pageId: page!._id, contentSha256: "source", storageId });
      return storageId;
    });
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null)).toBe(true);
    const result = await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, {
      datasetReleaseId: "pruning-test", confirmDatasetReleaseId: "pruning-test", maxDocs: 50,
    });
    expect(result).toMatchObject({ deletedRelease: true, storageDeletes: 1 });
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null)).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("manPageContents").take(5))).toEqual([]);
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
