/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;

beforeEach(() => vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

function page(externalId: string, text = "original") {
  return {
    externalId, name: externalId, section: "1", sitemapPage: 1,
    title: `${externalId}(1)`, description: "description", sourcePath: `${externalId}.1`,
    sourcePackage: null, sourcePackageVersion: null, contentSha256: "same-raw-source-hash",
    hasParseWarnings: false,
    doc: { toc: [], blocks: [{ type: "paragraph", inlines: [{ type: "text", text }] }] },
    synopsis: null, options: null, seeAlso: null, searchText: text, snippetText: text, links: [],
  };
}

function createRelease(t: Harness, datasetReleaseId: string, pageCount = 1) {
  return t.mutation(internal.ingest.createRelease, {
    datasetReleaseId, locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-09-07T00:00:00Z", packageManifest: { packages: [] },
    pageCount, aliasCount: 0, licenseCount: 0,
    sectionTotals: [{ section: "1", total: pageCount }], licensePackages: [],
  });
}

function upload(t: Harness, datasetReleaseId: string, pages: ReturnType<typeof page>[]) {
  return t.fetch("/ingest/pages/storage", {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ datasetReleaseId, pages }),
  });
}

function snapshot(t: Harness) {
  return t.run(async (ctx) => ({
    pages: await ctx.db.query("manPages").take(20),
    contents: await ctx.db.query("manPageContents").take(20),
    blobs: await ctx.db.query("manPageContentBlobs").take(20),
    files: await ctx.db.system.query("_storage").take(20),
  }));
}

it("stores different rendered documents separately despite an identical raw source hash", async () => {
  const t = convexTest(schema, modules);
  const first = await createRelease(t, "first");
  await createRelease(t, "second");
  expect((await upload(t, "first", [page("first")])).status).toBe(200);
  await t.run((ctx) => ctx.db.patch(first.releaseId, { sealed: true }));
  const before = await snapshot(t);

  const response = await upload(t, "second", [page("second", "rendered by a newer parser")]);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ inserted: 1, storedContentFiles: 1, reusedContentFiles: 0 });
  const after = await snapshot(t);
  expect(after.blobs).toHaveLength(2);
  expect(after.files).toHaveLength(2);
  expect(after.blobs.find((blob) => blob._id === before.blobs[0]._id)).toEqual(before.blobs[0]);
  expect(after.contents[0].blobId).not.toBe(after.contents[1].blobId);
  const documents = await t.run(async (ctx) => Promise.all(after.files.map(async (file) => {
    const stored = await ctx.storage.get(file._id);
    if (!stored) throw new Error("uploaded file missing");
    return JSON.parse(JSON.parse(await stored.text()).content.docJson);
  })));
  expect(documents).toEqual(expect.arrayContaining([page("first").doc, page("second", "rendered by a newer parser").doc]));
});

it("reuses an identical stored payload across releases without allocating another file", async () => {
  const t = convexTest(schema, modules);
  await createRelease(t, "first");
  await createRelease(t, "second");
  expect((await upload(t, "first", [page("first")])).status).toBe(200);
  const before = await snapshot(t);
  const response = await upload(t, "second", [page("second")]);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ inserted: 1, storedContentFiles: 0, reusedContentFiles: 1 });
  const after = await snapshot(t);
  expect(after.blobs).toEqual(before.blobs);
  expect(after.files).toEqual(before.files);
  expect(after.contents).toHaveLength(2);
  expect(after.contents[0].blobId).toBe(after.contents[1].blobId);
});

it("rejects an invalid later page without retaining any allocated storage or rows", async () => {
  const t = convexTest(schema, modules);
  await createRelease(t, "invalid", 2);
  const before = await snapshot(t);
  const response = await upload(t, "invalid", [page("valid"), { ...page("invalid"), contentSha256: "" }]);
  expect(response.status).toBe(400);
  expect(await snapshot(t)).toEqual(before);
});

it("removes an unused new upload from a duplicate replay while preserving the original content", async () => {
  const t = convexTest(schema, modules);
  const release = await createRelease(t, "replay");
  expect((await upload(t, "replay", [page("original")])).status).toBe(200);
  await t.run((ctx) => ctx.db.patch(release.releaseId, { sealed: true }));
  const before = await snapshot(t);
  const response = await upload(t, "replay", [page("original", "changed replay payload")]);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ inserted: 0, skipped: 1, storedContentFiles: 1 });
  expect(await snapshot(t)).toEqual(before);
});

it("does not remove a replay upload when a new page in the same batch uses that file", async () => {
  const t = convexTest(schema, modules);
  await createRelease(t, "mixed", 2);
  expect((await upload(t, "mixed", [page("original")])).status).toBe(200);
  const response = await upload(t, "mixed", [page("original", "new shared payload"), page("new", "new shared payload")]);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ inserted: 1, skipped: 1, storedContentFiles: 1, reusedContentFiles: 1 });
  const after = await snapshot(t);
  expect(after.pages).toHaveLength(2);
  expect(after.blobs).toHaveLength(2);
  expect(after.files).toHaveLength(2);
  for (const blob of after.blobs) {
    expect(blob.storageId).toBeDefined();
    expect(after.files.some((file) => file._id === blob.storageId)).toBe(true);
  }
});

it("cleans new uploads from a rejected batch without deleting reused files", async () => {
  const t = convexTest(schema, modules);
  await createRelease(t, "existing");
  const sealed = await createRelease(t, "sealed", 2);
  expect((await upload(t, "existing", [page("existing")])).status).toBe(200);
  await t.run((ctx) => ctx.db.patch(sealed.releaseId, { sealed: true }));
  const before = await snapshot(t);
  await expect(upload(t, "sealed", [page("reused"), page("new", "new payload")])).rejects.toThrow("RELEASE_SEALED");
  expect(await snapshot(t)).toEqual(before);
  expect(await t.run(async (ctx) => (await ctx.storage.get(before.files[0]._id)) !== null)).toBe(true);
});
