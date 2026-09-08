/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type State = "draft" | "sealed" | "staging" | "prod" | "pruning";

async function seed(state: State) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "maintenance", locale: "en", distro: "debian",
      imageRef: "test", imageDigest: "test", ingestedAt: "2026-09-07T00:00:00Z", pageCount: 2,
      ...(state === "sealed" ? { sealed: true } : {}),
      ...(state === "pruning" ? { pruning: true } : {}),
    });
    if (state === "staging" || state === "prod") {
      await ctx.db.insert("activeReleases", {
        releaseId, datasetReleaseId: "maintenance", locale: "en", distro: "debian",
        stage: state, activatedAt: "2026-09-07T00:00:00Z",
      });
    }
    const pages = [];
    for (const name of ["source", "duplicate"]) {
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId: "maintenance", externalId: name,
        locale: "en", distro: "debian", name, section: "1", sitemapPage: 0,
        title: name, description: "description", sourcePath: `${name}.1`,
        contentSha256: "same-hash", hasParseWarnings: false,
      });
      const contentId = await ctx.db.insert("manPageContents", { pageId, docJson: '{"text":"original"}' });
      const searchId = await ctx.db.insert("manPageSearchDocuments", {
        pageId, releaseId, datasetReleaseId: "maintenance", name, nameNorm: name,
        section: "1", title: name, description: "description", descNorm: "description",
        searchText: "old body ".repeat(1000), snippetText: "original snippet ".repeat(1000),
      });
      pages.push({ pageId, contentId, searchId });
    }
    return { releaseId, pages };
  });
  return { t, ...ids };
}

describe("maintenance release integrity", () => {
  it.each(["sealed", "staging", "prod", "pruning"] as const)("blocks content and search writes for %s releases", async (state) => {
    const { t, pages } = await seed(state);
    const before = await t.run(async (ctx) => ({
      content: await ctx.db.get(pages[0].contentId), search: await ctx.db.get(pages[0].searchId),
    }));
    const error = state === "pruning" ? "RELEASE_PRUNING" : "RELEASE_SEALED";
    const args = { datasetReleaseId: "maintenance", cursor: null, limit: 1 };
    await expect(t.mutation(internal.maintenance.compactSearchDocumentsBatch, args)).rejects.toThrow(error);
    await expect(t.mutation(internal.maintenance.dedupePageContentBatch, args)).rejects.toThrow(error);
    expect(await t.run(async (ctx) => ({
      content: await ctx.db.get(pages[0].contentId), search: await ctx.db.get(pages[0].searchId),
    }))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("manPageContentBlobs").take(1))).toEqual([]);

    expect(await t.mutation(internal.maintenance.compactSearchDocumentsBatch, { ...args, dryRun: true }))
      .toMatchObject({ dryRun: true, scanned: 1, compacted: 1 });
    expect(await t.mutation(internal.maintenance.dedupePageContentBatch, { ...args, dryRun: true }))
      .toMatchObject({ dryRun: true, scanned: 1, migrated: 1 });
    expect(await t.run(async (ctx) => ({
      content: await ctx.db.get(pages[0].contentId), search: await ctx.db.get(pages[0].searchId),
    }))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("manPageContentBlobs").take(1))).toEqual([]);
  });

  it("retains bounded maintenance for unpublished drafts", async () => {
    const { t } = await seed("draft");
    const args = { datasetReleaseId: "maintenance", cursor: null, limit: 1 };
    expect(await t.mutation(internal.maintenance.compactSearchDocumentsBatch, args))
      .toMatchObject({ scanned: 1, compacted: 1 });
    expect(await t.mutation(internal.maintenance.dedupePageContentBatch, args))
      .toMatchObject({ scanned: 1, migrated: 1, blobCreates: 1 });
  });

  it("rejects same-source-hash blobs with different rendered fields", async () => {
    const { t, pages } = await seed("draft");
    await t.run((ctx) => ctx.db.insert("manPageContentBlobs", {
      contentSha256: "same-hash", docJson: '{"text":"different"}',
    }));
    await expect(t.mutation(internal.maintenance.dedupePageContentBatch, {
      datasetReleaseId: "maintenance", cursor: null, limit: 1,
    })).rejects.toThrow("CONTENT_PAYLOAD_MISMATCH");
    for (const page of pages) {
      expect(await t.run((ctx) => ctx.db.get(page.contentId)))
        .toMatchObject({ docJson: '{"text":"original"}' });
      expect(await t.run((ctx) => ctx.db.get(page.contentId))).not.toHaveProperty("blobId");
    }
  });

  it("can reuse an equal chunked blob without changing rendered bytes", async () => {
    const { t } = await seed("draft");
    const blobId = await t.run(async (ctx) => {
      const blobId = await ctx.db.insert("manPageContentBlobs", { contentSha256: "same-hash" });
      await ctx.db.insert("manPageContentBlobChunks", {
        blobId, contentSha256: "same-hash", kind: "docJson", chunkIndex: 0, chunk: '{"text":"original"}',
      });
      return blobId;
    });
    expect(await t.mutation(internal.maintenance.dedupePageContentBatch, {
      datasetReleaseId: "maintenance", cursor: null, limit: 1,
    })).toMatchObject({ migrated: 1, blobCreates: 0 });
    expect(await t.run((ctx) => ctx.db.query("manPageContents")
      .withIndex("by_blobId", (q) => q.eq("blobId", blobId)).take(2))).toHaveLength(1);
  });

  it.each(["source", "destination"] as const)("refuses dedupe when %s storage bytes cannot be verified in a mutation", async (side) => {
    const { t, pages } = await seed("draft");
    await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["unverified"]));
      if (side === "source") {
        for (const page of pages) await ctx.db.patch(page.contentId, { storageId });
      } else {
        await ctx.db.insert("manPageContentBlobs", { contentSha256: "same-hash", storageId });
      }
    });
    await expect(t.mutation(internal.maintenance.dedupePageContentBatch, {
      datasetReleaseId: "maintenance", cursor: null, limit: 1,
    })).rejects.toThrow("CONTENT_STORAGE_VALIDATION_REQUIRED");
    for (const page of pages) {
      expect(await t.run((ctx) => ctx.db.get(page.contentId))).not.toHaveProperty("blobId");
    }
  });

  it("preserves shared active content while deleting only unreferenced blobs", async () => {
    const { t, pages } = await seed("prod");
    const { sharedId, orphanId } = await t.run(async (ctx) => {
      const sharedId = await ctx.db.insert("manPageContentBlobs", { contentSha256: "same-hash", docJson: "keep" });
      for (const page of pages) await ctx.db.patch(page.contentId, { blobId: sharedId });
      const orphanId = await ctx.db.insert("manPageContentBlobs", { contentSha256: "orphan" });
      for (const blobId of [sharedId, orphanId]) {
        await ctx.db.insert("manPageContentBlobChunks", {
          blobId, contentSha256: blobId === sharedId ? "same-hash" : "orphan",
          kind: "docJson", chunkIndex: 0, chunk: "payload",
        });
      }
      return { sharedId, orphanId };
    });
    expect(await t.mutation(internal.maintenance.cleanupOrphanContentBlobsBatch, { cursor: null, dryRun: true }))
      .toMatchObject({ orphans: 1, blobDeletes: 0, chunkDeletes: 0 });
    expect(await t.run((ctx) => ctx.db.get(orphanId))).not.toBeNull();
    expect(await t.mutation(internal.maintenance.cleanupOrphanContentBlobsBatch, { cursor: null }))
      .toMatchObject({ orphans: 1, blobDeletes: 1, chunkDeletes: 1 });
    expect(await t.run((ctx) => ctx.db.get(orphanId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(sharedId))).toMatchObject({ docJson: "keep" });
    expect(await t.run((ctx) => ctx.db.query("manPageContentBlobChunks")
      .withIndex("by_blobId_and_kind_and_chunkIndex", (q) => q.eq("blobId", sharedId)).take(2)))
      .toMatchObject([{ chunk: "payload" }]);
  });

  it("leaves oversized orphan blobs intact so later references cannot see partial content", async () => {
    const { t, pages } = await seed("draft");
    const blobId = await t.run(async (ctx) => {
      const blobId = await ctx.db.insert("manPageContentBlobs", { contentSha256: "large" });
      for (let chunkIndex = 0; chunkIndex < 101; chunkIndex += 1) {
        await ctx.db.insert("manPageContentBlobChunks", {
          blobId, contentSha256: "large", kind: "docJson", chunkIndex, chunk: `part-${chunkIndex}`,
        });
      }
      return blobId;
    });
    expect(await t.mutation(internal.maintenance.cleanupOrphanContentBlobsBatch, { cursor: null, limit: 1 }))
      .toMatchObject({ oversizedSkipped: 1, blobDeletes: 0, chunkDeletes: 0 });
    await t.run((ctx) => ctx.db.patch(pages[0].contentId, { blobId }));
    expect(await t.mutation(internal.maintenance.cleanupOrphanContentBlobsBatch, { cursor: null, limit: 1 }))
      .toMatchObject({ orphans: 0, blobDeletes: 0, chunkDeletes: 0 });
    expect(await t.run((ctx) => ctx.db.query("manPageContentBlobChunks")
      .withIndex("by_blobId_and_kind_and_chunkIndex", (q) => q.eq("blobId", blobId)).take(102)))
      .toHaveLength(101);
  });

  it("rolls back draft deduplication rather than leaving excess source chunks behind", async () => {
    const { t, pages } = await seed("draft");
    const first = pages[1]; // The release index visits "duplicate" before "source".
    await t.run(async (ctx) => {
      await ctx.db.patch(first.contentId, { docJson: undefined });
      for (let chunkIndex = 0; chunkIndex < 101; chunkIndex += 1) {
        await ctx.db.insert("manPageContentChunks", {
          contentId: first.contentId, pageId: first.pageId,
          kind: "docJson", chunkIndex, chunk: "x",
        });
      }
    });
    await expect(t.mutation(internal.maintenance.dedupePageContentBatch, {
      datasetReleaseId: "maintenance", cursor: null, limit: 1,
    })).rejects.toThrow("CONTENT_CHUNK_LIMIT");
    expect(await t.run((ctx) => ctx.db.get(first.contentId))).not.toHaveProperty("blobId");
    expect(await t.run((ctx) => ctx.db.query("manPageContentBlobs").take(1))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("manPageContentChunks").take(102))).toHaveLength(101);
  });
});
