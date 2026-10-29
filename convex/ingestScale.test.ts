/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { canonicalJson } from "./ingest";
import { storedPayloadDigest } from "./_storedPayload";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const declaration = {
  datasetReleaseId: "scale", locale: "en", distro: "debian" as const,
  imageRef: "local", imageDigest: "local", ingestedAt: "2026-10-28",
  packageManifest: null, pageCount: 1, aliasCount: 0, licenseCount: 0,
  sectionTotals: [{ section: "1", total: 1 }],
};
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("keeps a >1 MiB manifest with 20k package entries off the release and reclaims replay files", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "local-test");
  const t = convexTest(schema, modules);
  const manifest = { packages: Array.from({ length: 20_000 }, (_, i) => ({ name: `pkg${i}`, version: "v".repeat(80) })) };
  expect(canonicalJson(manifest).length).toBeGreaterThan(1024 * 1024);
  const post = () => t.fetch("/ingest/release", { method: "POST",
    headers: { authorization: "Bearer local-test", "content-type": "application/json" },
    body: JSON.stringify({ ...declaration, packageManifest: manifest, packageBatches: [] }),
  });
  const first = await post();
  expect(first.status).toBe(200);
  const { releaseId } = await first.json();
  expect((await post()).status).toBe(200);
  const release = await t.run((ctx) => ctx.db.get(releaseId));
  expect(JSON.stringify(release).length).toBeLessThan(2000);
  expect(release).not.toHaveProperty("packageManifestJson");
  const manifests = await t.run((ctx) => ctx.db.query("releaseManifests").take(2));
  expect(manifests).toHaveLength(1);
  const stored = await t.run(async (ctx) => (await ctx.storage.get(manifests[0].storageId!))!.text());
  expect(JSON.parse(stored)).toEqual(manifest);
  expect(await t.run((ctx) => ctx.db.system.query("_storage").take(3))).toHaveLength(1);
});

it("declares 9k packages in bounded transactions, resumes replays, and refuses incomplete or changed declarations", async () => {
  vi.useFakeTimers();
  // Real limits, including documentsWritten and array length. This would fail
  // the former single-transaction package declaration.
  const t = convexTest({ schema, modules, transactionLimits: { documentsWritten: 256 } });
  const packages = Array.from({ length: 9000 }, (_, i) => ({ name: `pkg${String(i).padStart(5, "0")}`, version: "1", hasLicenseText: false }));
  const batches = Array.from({ length: 45 }, (_, i) => packages.slice(i * 200, (i + 1) * 200));
  const packageBatches = await Promise.all(batches.map(async (batch) => ({ digest: await storedPayloadDigest(canonicalJson(batch)), count: 200, licenseCount: 0 })));
  const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...declaration, packageBatches });
  for (const [batchIndex, batch] of batches.entries()) {
    expect(await t.mutation(internal.ingest.insertLicensePackages, { datasetReleaseId: "scale", batchIndex, packages: batch })).toEqual({ inserted: 200, skipped: 0 });
    if (batchIndex === 0) {
      expect(await t.mutation(internal.ingest.insertLicensePackages, { datasetReleaseId: "scale", batchIndex, packages: batch })).toEqual({ inserted: 0, skipped: 200 });
      await expect(t.mutation(internal.ingest.insertLicensePackages, { datasetReleaseId: "scale", batchIndex, packages: [{ ...batch[0], version: "changed" }, ...batch.slice(1)] })).rejects.toThrow("RELEASE_MANIFEST_CONFLICT");
      await expect(t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "scale", stage: "prod", activatedAt: "now" })).rejects.toThrow("RELEASE_MANIFEST_INCOMPLETE");
    }
  }
  const page = (cursor?: string) => t.query(api.queries.listLicenses, { distro: "debian", cursor });
  await t.run(async (ctx) => {
    await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "scale", activatedAt: "now" });
  });
  let cursor: string | null = null;
  const names = [];
  do {
    const batch = await page(cursor ?? undefined);
    names.push(...batch.packages.map((pkg) => pkg.name));
    cursor = batch.nextCursor;
  } while (cursor);
  expect(names).toEqual(packages.map((pkg) => pkg.name));
  expect((await t.run((ctx) => ctx.db.get(releaseId)))?.uploadedPackageBatchCount).toBe(45);
}, 60_000);

it("reads a deep 20k-page section in at most seven documents", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 7 } });
  const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...declaration, licensePackages: [] });
  await t.run(async (ctx) => {
    await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "scale", activatedAt: "now" });
  });
  for (let start = 0; start < 20_000; start += 1000) {
    await t.run(async (ctx) => {
      for (let i = start; i < start + 1000; i++) {
        const name = `page${String(i).padStart(5, "0")}`;
        await ctx.db.insert("manPages", { releaseId, datasetReleaseId: "scale", externalId: name,
          locale: "en", distro: "debian", name, section: "1", sitemapPage: 1, title: name,
          description: "test", sourcePath: name, contentSha256: name, hasParseWarnings: false });
      }
    });
  }
  expect(await t.query(api.queries.getManMetaByNameAndSection, { distro: "debian", name: "page19000", section: "1" })).not.toBeNull();
  const result = await t.query(api.queries.listSection, { distro: "debian", section: "1", limit: 2, cursor: "page19000", offset: 19001 });
  expect(result?.results.map((row) => row.name)).toEqual(["page19001", "page19002"]);
  await expect(t.query(api.queries.listSection, { distro: "debian", section: "1", limit: 2, offset: 19001 })).rejects.toThrow("requires cursor");
});

it("lists all 114 declared sections", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 120 } });
  const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...declaration, licensePackages: [] });
  await t.run(async (ctx) => {
    await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "scale", activatedAt: "now" });
    for (let i = 1; i < 114; i++) await ctx.db.insert("releaseSectionStats", { releaseId, datasetReleaseId: "scale", section: `3s${i}`, label: "Library", total: 0 });
  });
  expect(await t.query(api.queries.listSections, { distro: "debian" })).toHaveLength(114);
});

it("prunes >16k children over restartable 2k batches, deletes manifest storage and fences activation", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["{}"], { type: "application/json" })));
  const { packageManifest, ...withoutManifest } = declaration;
  void packageManifest;
  const { releaseId } = await t.mutation(internal.ingest.createRelease, {
    ...withoutManifest, packageManifestStorageId: storageId,
    packageManifestDigest: await storedPayloadDigest("{}"), licensePackages: [],
  });
  for (let start = 0; start < 18_000; start += 1000) {
    await t.run(async (ctx) => {
      for (let i = start; i < start + 1000; i++) await ctx.db.insert("manPageAliases", { releaseId, datasetReleaseId: "scale", name: `alias${i}`, section: "1", targetName: "target", targetSection: "1" });
    });
  }
  const remove = () => t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { datasetReleaseId: "scale", confirmDatasetReleaseId: "scale", maxDocs: 2000 });
  expect(await remove()).toMatchObject({ deleted: 2000, hasMore: true });
  await expect(t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "scale", stage: "prod", activatedAt: "now" })).rejects.toThrow("RELEASE_PRUNING");
  let batches = 1;
  while (!(await remove()).deletedRelease) batches++;
  expect(batches).toBeLessThan(12);
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
}, 30_000);

it("folds sharded uploads only at seal and refuses a cross-shard section excess", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const input = (name: string) => ({ externalId: name, name, section: "1", sitemapPage: 1,
    title: name, description: name, sourcePath: name, sourcePackage: null, sourcePackageVersion: null,
    contentSha256: name, hasParseWarnings: false, doc: { blocks: [] }, synopsis: null,
    options: null, seeAlso: null, searchText: name, snippetText: name, links: [] });
  const { releaseId } = await t.mutation(internal.ingest.createRelease, {
    ...declaration, pageCount: 2, sectionTotals: [{ section: "1", total: 2 }], packageBatches: [],
  });
  for (const name of ["a", "b"]) await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "scale", pages: [input(name)] });
  const before = await t.run((ctx) => ctx.db.get(releaseId));
  expect(before).toMatchObject({ uploadedPageCount: 0, shardedPageUploads: true, relatedMetadataVersion: 1 });
  expect(await t.run((ctx) => ctx.db.query("releasePageUploadShards").take(17))).toHaveLength(2);
  expect(await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "scale", pages: [input("a")] })).toEqual({ inserted: 0, skipped: 1 });
  const activate = () => t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "scale", stage: "prod", activatedAt: "now" });
  expect(await activate()).toMatchObject({ pending: true });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await activate()).toMatchObject({ pending: false });
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ uploadedPageCount: 2, manifestVerified: true, sealed: true });
  await t.mutation(internal.ingest.createRelease, { ...declaration, datasetReleaseId: "excess", packageBatches: [] });
  for (const name of ["a", "b"]) await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "excess", pages: [input(name)] });
  await expect(t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "excess", stage: "prod", activatedAt: "now" })).rejects.toThrow("RELEASE_MANIFEST_EXCEEDED");
  expect(await t.query(api.queries.getInfo, { distro: "debian" })).toMatchObject({ datasetReleaseId: "scale" });
});
