/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { startLegacyManifestVerification } from "./manifest";
import { serializeStoredPayload, storedPayloadDigest } from "./_storedPayload";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
const declaration = (datasetReleaseId = "candidate") => ({
  datasetReleaseId, locale: "en", distro: "debian" as const, imageRef: "test", imageDigest: "test",
  ingestedAt: "2026-09-07T00:00:00Z", packageManifest: null,
  pageCount: 1, aliasCount: 0, licenseCount: 0,
  sectionTotals: [{ section: "1", total: 1 }], licensePackages: [] as Array<{ name: string; version: string; hasLicenseText: boolean }>,
});
const page = (name = "page", section = "1") => ({
  externalId: `${name}-${section}`, name, section, sitemapPage: 0, title: name, description: name,
  sourcePath: `${name}.${section}`, sourcePackage: null, sourcePackageVersion: null,
  contentSha256: "same-source", hasParseWarnings: false, doc: { text: name },
  synopsis: null, options: null, seeAlso: null, searchText: name, snippetText: name, links: [],
});
const alias = { name: "alias", section: "1", targetName: "page", targetSection: "1" };
const license = { packageName: "pkg", licenseId: "mit", licenseName: "MIT", licenseText: "permission granted", sourceUrl: null };
const activation = (datasetReleaseId = "candidate") => ({ datasetReleaseId, stage: "prod" as const, activatedAt: "2026-09-07T00:00:00Z" });

async function upload(t: Harness, mode: "inline" | "storage", pages = [page()], datasetReleaseId = "candidate") {
  if (mode === "inline") return t.mutation(internal.ingest.insertPages, { datasetReleaseId, pages });
  const stored = [];
  for (const input of pages) {
    const { doc, synopsis, options, seeAlso, ...metadata } = input;
    const payload = serializeStoredPayload(input.contentSha256, { docJson: JSON.stringify(doc),
      synopsisJson: synopsis === null ? undefined : JSON.stringify(synopsis),
      optionsJson: options === null ? undefined : JSON.stringify(options),
      seeAlsoJson: seeAlso === null ? undefined : JSON.stringify(seeAlso) });
    const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob([payload])));
    stored.push({ ...metadata, contentStorageId });
  }
  return t.mutation(internal.ingest.insertStoredPages, { datasetReleaseId, pages: stored });
}

afterEach(() => vi.useRealTimers());

describe("declared release manifests", () => {
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid counters %s without creating a release", async (count) => {
    const t = convexTest(schema, modules);
    for (const field of ["pageCount", "aliasCount", "licenseCount"] as const) {
      await expect(t.mutation(internal.ingest.createRelease, { ...declaration(), [field]: count })).rejects.toThrow("INVALID_RELEASE_MANIFEST");
    }
    expect(await t.run((ctx) => ctx.db.query("datasetReleases").take(1))).toEqual([]);
  });

  it.each([
    [{ section: "1", total: 2 }],
    [{ section: "1", total: 1 }, { section: "1", total: 0 }],
    [{ section: " 1", total: 1 }],
    [{ section: "1", total: -1 }],
  ])("rejects inconsistent or ambiguous sections %#", async (...sectionTotals) => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.ingest.createRelease, { ...declaration(), sectionTotals })).rejects.toThrow("INVALID_RELEASE_MANIFEST");
  });

  it("rejects inconsistent package declarations including normalized duplicates", async () => {
    const t = convexTest(schema, modules);
    const pkg = { name: "pkg", version: "1", hasLicenseText: true };
    await expect(t.mutation(internal.ingest.createRelease, { ...declaration(), licensePackages: [pkg] })).rejects.toThrow("INVALID_RELEASE_MANIFEST");
    await expect(t.mutation(internal.ingest.createRelease, {
      ...declaration(), licenseCount: 2, licensePackages: [pkg, { ...pkg, name: " PKG " }],
    })).rejects.toThrow("INVALID_RELEASE_MANIFEST");
  });

  it("freezes the declaration across duplicate create calls", async () => {
    const t = convexTest(schema, modules);
    const args = { ...declaration(), packageManifest: { z: 1, a: { z: 2, a: 3 } } };
    const { releaseId } = await t.mutation(internal.ingest.createRelease, args);
    expect(await t.mutation(internal.ingest.createRelease, args)).toEqual({ releaseId, existed: true });
    expect(await t.mutation(internal.ingest.createRelease, { ...args, packageManifest: { a: { a: 3, z: 2 }, z: 1 } })).toEqual({ releaseId, existed: true });
    await expect(t.mutation(internal.ingest.createRelease, { ...args, aliasCount: 1 })).rejects.toThrow("RELEASE_MANIFEST_CONFLICT");
    await expect(t.mutation(internal.ingest.createRelease, { ...args, imageDigest: "different" })).rejects.toThrow("RELEASE_MANIFEST_CONFLICT");
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ aliasCount: 0, imageDigest: "test", uploadedPageCount: 0 });
  });

  it("does not publish a declared empty release", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...declaration(), pageCount: 0, sectionTotals: [] });
    await expect(t.mutation(internal.ingest.activateRelease, activation())).rejects.toThrow("RELEASE_MANIFEST_EMPTY");
    expect((await t.run((ctx) => ctx.db.get(releaseId)))?.sealed).not.toBe(true);
  });

  it.each(["inline", "storage"] as const)("keeps incomplete %s uploads resumable and counts only new records", async (mode) => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, {
      ...declaration(), aliasCount: 1, licenseCount: 1,
      licensePackages: [{ name: "PKG", version: "1", hasLicenseText: true }],
    });
    for (let step = 0; step < 3; step += 1) {
      await expect(t.mutation(internal.ingest.activateRelease, activation())).rejects.toThrow("RELEASE_MANIFEST_INCOMPLETE");
      expect((await t.run((ctx) => ctx.db.get(releaseId)))?.sealed).not.toBe(true);
      expect(await t.run((ctx) => ctx.db.query("activeReleases").take(1))).toEqual([]);
      if (step === 0) {
        expect(await upload(t, mode)).toMatchObject({ inserted: 1, skipped: 0 });
        expect(await upload(t, mode)).toMatchObject({ inserted: 0, skipped: 1 });
      } else if (step === 1) {
        expect(await t.mutation(internal.ingest.insertAliases, { datasetReleaseId: "candidate", aliases: [alias, alias] })).toEqual({ inserted: 1, skipped: 1 });
      } else {
        expect(await t.mutation(internal.ingest.insertLicenses, { datasetReleaseId: "candidate", licenses: [license, license] })).toEqual({ inserted: 1, skipped: 1 });
      }
    }
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ uploadedPageCount: 1, uploadedAliasCount: 1, uploadedLicenseCount: 1 });
    expect(await t.mutation(internal.ingest.activateRelease, activation())).toMatchObject({ pending: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.ingest.activateRelease, activation())).toMatchObject({ pending: false });
    expect(await t.query(internal.related.activeMetadataStatus, {})).toMatchObject({ complete: true, releases: [{ manifestVerified: true }] });
  });

  it.each(["inline", "storage"] as const)("rolls back excess sections and route collisions for %s batches", async (mode) => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, {
      ...declaration(), pageCount: 2, sectionTotals: [{ section: "1", total: 1 }, { section: "2", total: 1 }],
    });
    await expect(upload(t, mode, [page("one"), page("two")])).rejects.toThrow("RELEASE_MANIFEST_EXCEEDED");
    await expect(upload(t, mode, [page("one", "3")])).rejects.toThrow("UNDECLARED_MAN_PAGE_SECTION");
    await expect(upload(t, mode, [page("MixedCase")])).rejects.toThrow("INVALID_MAN_PAGE_ROUTE");
    await expect(upload(t, mode, [page(), { ...page(), externalId: "different-id" }])).rejects.toThrow("DUPLICATE_MAN_PAGE_ROUTE");
    expect(await t.run((ctx) => ctx.db.query("manPages").take(1))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ uploadedPageCount: 0 });
    await upload(t, mode, [page()]);
    await expect(t.mutation(internal.ingest.activateRelease, activation())).rejects.toThrow("RELEASE_MANIFEST_INCOMPLETE");
    expect((await t.run((ctx) => ctx.db.get(releaseId)))?.sealed).not.toBe(true);
  });

  it("rejects alias collisions, dangling targets, blank licenses, and excess records atomically", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, {
      ...declaration(), aliasCount: 1, licenseCount: 1,
      licensePackages: [{ name: "pkg", version: "1", hasLicenseText: true }],
    });
    await upload(t, "inline");
    await expect(t.mutation(internal.ingest.insertAliases, { datasetReleaseId: "candidate", aliases: [{ ...alias, name: "page" }] })).rejects.toThrow("DUPLICATE_MAN_PAGE_ROUTE");
    await expect(t.mutation(internal.ingest.insertAliases, { datasetReleaseId: "candidate", aliases: [{ ...alias, targetName: "missing" }] })).rejects.toThrow("ALIAS_TARGET_NOT_FOUND");
    await expect(t.mutation(internal.ingest.insertAliases, { datasetReleaseId: "candidate", aliases: [alias, { ...alias, name: "extra" }] })).rejects.toThrow("RELEASE_MANIFEST_EXCEEDED");
    await expect(t.mutation(internal.ingest.insertLicenses, { datasetReleaseId: "candidate", licenses: [{ ...license, licenseText: "  \n" }] })).rejects.toThrow("EMPTY_LICENSE_TEXT");
    await expect(t.mutation(internal.ingest.insertLicenses, { datasetReleaseId: "candidate", licenses: [{ ...license, packageName: "missing" }] })).rejects.toThrow("UNDECLARED_LICENSE_PACKAGE");
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ uploadedAliasCount: 0, uploadedLicenseCount: 0 });
    expect(await t.run((ctx) => ctx.db.query("manPageAliases").take(1))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("licenses").take(1))).toEqual([]);
  });
});

describe("content-addressed blob identity", () => {
  it("does not overwrite or share different parsed payloads that have the same source SHA", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ingest.createRelease, declaration("original"));
    await upload(t, "inline", [page("original")], "original");
    const originalBlob = (await t.run((ctx) => ctx.db.query("manPageContentBlobs").take(10)))[0];
    await t.mutation(internal.ingest.createRelease, declaration("candidate"));
    await upload(t, "storage", [page("different-parsing")]);
    const blobs = await t.run((ctx) => ctx.db.query("manPageContentBlobs").take(10));
    expect(blobs).toHaveLength(2);
    expect(blobs.find((blob) => blob._id === originalBlob._id)).toEqual(originalBlob);
    expect(new Set(blobs.map((blob) => blob.contentDigest)).size).toBe(2);
  });

  it("uses verified storage metadata as identity and returns unused uploads without mutating shared blobs", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ingest.createRelease, declaration("original"));
    await upload(t, "storage", [page()], "original");
    const original = (await t.run((ctx) => ctx.db.query("manPageContentBlobs").take(10)))[0];
    await t.mutation(internal.ingest.createRelease, declaration());
    const result = await upload(t, "storage");
    expect(result).toMatchObject({ inserted: 1, skipped: 0, unusedStorageIds: [expect.any(String)] });
    expect(await t.run((ctx) => ctx.db.query("manPageContentBlobs").take(10))).toEqual([original]);
    const contentDigest = await storedPayloadDigest(serializeStoredPayload("same-source", { docJson: JSON.stringify(page().doc) }));
    expect(original.contentDigest).toBe(contentDigest);
    expect(await t.query(internal.ingest.listContentBlobStorageByDigest, { contentDigests: [contentDigest] })).toMatchObject([{ contentDigest, storageId: original.storageId }]);
  });
});

describe("legacy manifest diagnostics", () => {
  it.each([0, 1])("never promotes observed alias count %s into a verified manifest", async (aliasCount) => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...declaration(), aliasCount });
    await upload(t, "inline");
    if (aliasCount) await t.mutation(internal.ingest.insertAliases, { datasetReleaseId: "candidate", aliases: [alias] });
    await t.run(async (ctx) => {
      await ctx.db.patch(releaseId, { manifestBasis: undefined, aliasCount: undefined, licenseCount: undefined });
      await ctx.db.insert("activeReleases", { ...activation(), releaseId, distro: "debian", locale: "en" });
    });
    await t.mutation(internal.related.backfillActiveReleases, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({
      sealed: true, manifestVerified: false, manifestError: "LEGACY_ALIAS_EXPECTATION_UNKNOWN", uploadedAliasCount: aliasCount,
      manifestVerification: { phase: "complete" },
    });
    expect(await t.query(internal.related.activeMetadataStatus, {})).toMatchObject({ complete: false, releases: [{ manifestVerified: false }] });
    await expect(t.mutation(internal.ingest.promoteActiveReleases, { fromStage: "prod", toStage: "staging", distros: ["debian"], activatedAt: activation().activatedAt })).rejects.toThrow("RELEASE_MANIFEST_UNVERIFIED");
  });

  it("keeps scan cursors and counters server-owned and bounds legacy pages to 100 per batch", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, {
      ...declaration(), pageCount: 105, sectionTotals: [{ section: "1", total: 105 }],
    });
    await upload(t, "inline", Array.from({ length: 105 }, (_, i) => page(`page-${i}`)));
    await t.run(async (ctx) => {
      await ctx.db.patch(releaseId, { manifestBasis: undefined, aliasCount: undefined });
      const release = await ctx.db.get(releaseId);
      if (!release) throw new Error("missing fixture release");
      await startLegacyManifestVerification(ctx, release);
      const started = await ctx.db.get(releaseId);
      if (started?.manifestVerification?.jobId) await ctx.scheduler.cancel(started.manifestVerification.jobId);
    });
    await expect(t.mutation(internal.manifest.verifyLegacyBatch, { releaseId, cursor: "forged", pageCount: 105 } as never)).rejects.toThrow();
    expect(await t.mutation(internal.manifest.verifyLegacyBatch, { releaseId })).toEqual({ status: "pending" });
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ manifestVerification: { phase: "pages", pageCount: 100 } });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ manifestVerified: false, manifestVerification: { phase: "complete", pageCount: 105 } });
  });

  it("records a legacy count mismatch without making an active release ready", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, declaration());
    await t.run(async (ctx) => {
      await ctx.db.patch(releaseId, { manifestBasis: undefined });
      await ctx.db.insert("activeReleases", { ...activation(), releaseId, distro: "debian", locale: "en" });
    });
    await t.mutation(internal.related.backfillActiveReleases, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ manifestVerified: false, manifestError: "LEGACY_PAGE_COUNT_MISMATCH" });
    expect(await t.mutation(internal.manifest.verifyLegacyBatch, { releaseId })).toEqual({ status: "failed" });
  });
});
