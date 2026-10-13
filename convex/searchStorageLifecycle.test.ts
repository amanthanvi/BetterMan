/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { MAX_SNIPPET_TEXT_CHARS } from "./lib";
import { serializeStoredPayload } from "./_storedPayload";

const modules = import.meta.glob("./**/*.ts");

const page = {
  externalId: "cp.1", name: "cp", section: "1", sitemapPage: 1,
  title: "cp(1)", description: "Copy files — preserve Unicode", sourcePath: "cp.1",
  sourcePackage: null, sourcePackageVersion: null, contentSha256: "test-sha",
  hasParseWarnings: false, doc: { toc: [], blocks: [] }, synopsis: null, options: null, seeAlso: null,
  searchText: "unneeded body ".repeat(1000), snippetText: "copy files ".repeat(100), links: [],
};

async function fixture() {
  const t = convexTest(schema, modules);
  const { releaseId } = await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId: "search-storage", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-10-12T00:00:00Z", packageManifest: null,
    pageCount: 1, aliasCount: 0, licenseCount: 0,
    sectionTotals: [{ section: "1", total: 1 }], licensePackages: [],
  });
  return { t, releaseId };
}

async function state(t: Awaited<ReturnType<typeof fixture>>["t"]) {
  return t.run(async (ctx) => ({
    candidates: await ctx.db.query("manPageSearchDocuments").take(10),
    details: await ctx.db.query("manPageSearchDetails").take(10),
  }));
}

describe("slim search storage lifecycle", () => {
  it.each(["inline", "stored"] as const)("writes slim candidates and bounded details atomically for %s ingestion and replay", async (kind) => {
    const { t, releaseId } = await fixture();
    const upload = kind === "inline"
      ? () => t.mutation(internal.ingest.insertPages, { datasetReleaseId: "search-storage", pages: [page] })
      : await (async () => {
        const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob([
          serializeStoredPayload(page.contentSha256, { docJson: JSON.stringify(page.doc) }),
        ], { type: "application/json" })));
        const { doc: _doc, synopsis: _synopsis, options: _options, seeAlso: _seeAlso, ...storedPage } = page;
        return () => t.mutation(internal.ingest.insertStoredPages, {
          datasetReleaseId: "search-storage", pages: [{ ...storedPage, contentStorageId }],
        });
      })();
    expect(await upload()).toMatchObject({ inserted: 1 });
    const before = await state(t);
    expect(before.candidates).toHaveLength(1);
    expect(before.details).toHaveLength(1);
    const candidate = before.candidates[0];
    expect(candidate).toMatchObject({ releaseId, name: page.name, nameNorm: "cp", section: "1", descNorm: page.description.toLowerCase() });
    for (const field of ["title", "description", "snippetText", "searchText", "datasetReleaseId"]) expect(candidate).not.toHaveProperty(field);
    expect(before.details[0]).toMatchObject({
      searchDocumentId: candidate._id, releaseId,
      title: page.title, description: page.description,
      snippetText: page.snippetText.slice(0, MAX_SNIPPET_TEXT_CHARS),
    });
    expect(await upload()).toMatchObject({ inserted: 0 });
    expect(await state(t)).toEqual(before);
  });

  it("samples, measures, skips compaction, and prunes details in bounded release batches", async () => {
    const { t, releaseId } = await fixture();
    await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "search-storage", pages: [page] });
    const before = await state(t);
    const compact = await t.mutation(internal.maintenance.compactSearchDocumentsBatch, { datasetReleaseId: "search-storage", cursor: null });
    expect(compact).toMatchObject({ scanned: 1, compacted: 0 });
    expect(await state(t)).toEqual(before);
    const preview = await t.query(internal.maintenance.previewInactiveReleases, {});
    expect(preview.inactive[0].children.manPageSearchDetails).toEqual({ count: 1, hasMore: false });
    const stats = await t.query(internal.maintenance.estimateStorageStatsBatch, { table: "manPageSearchDetails", cursor: null });
    expect(stats).toMatchObject({ scanned: 1, charsByField: { title: page.title.length, description: page.description.length, snippetText: MAX_SNIPPET_TEXT_CHARS } });
    // The section stats consume the first one-row batch; the second deletes
    // details, proving it is included before candidates and cannot be orphaned.
    const prune = () => t.mutation(internal.maintenance.deleteInactiveReleaseBatch, {
      datasetReleaseId: "search-storage", confirmDatasetReleaseId: "search-storage", maxDocs: 1,
    });
    await prune();
    expect(await prune()).toMatchObject({ deleted: 1, deletedByTable: { manPageSearchDetails: 1 } });
    expect((await state(t)).details).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(releaseId))).not.toBeNull();
    for (let i = 0; i < 10; i += 1) {
      const result = await prune();
      if (result.deletedRelease) break;
    }
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toBeNull();
    expect(await state(t)).toEqual({ candidates: [], details: [] });
  });

  it("rolls back both search tables when a later inline upload is invalid", async () => {
    const { t } = await fixture();
    await expect(t.mutation(internal.ingest.insertPages, {
      datasetReleaseId: "search-storage", pages: [page, { ...page, externalId: "bad.1", contentSha256: "" }],
    })).rejects.toThrow();
    expect(await state(t)).toEqual({ candidates: [], details: [] });
  });
});
