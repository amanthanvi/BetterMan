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

// Exercise large declaration fanout separately from package insertion. convex-test
// implements indexed reads by scanning/sorting in-memory rows, so uploading 9k
// packages through per-package uniqueness checks measures quadratic mock work,
// not Convex's indexed backend. The opt-in `pnpm ingest:scale` runs the real
// 17,300-package upload against a local deployment.
function packageRows(count: number, start = 0) {
  return Array.from({ length: count }, (_, i) => ({
    name: `pkg${String(start + i).padStart(5, "0")}`, version: "1", hasLicenseText: false,
  }));
}
async function declareBatch(packages: ReturnType<typeof packageRows>) {
  return { digest: await storedPayloadDigest(canonicalJson(packages)), count: packages.length, licenseCount: 0 };
}

it("declares 17.3k packages above array/write limits using only bounded batch metadata", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { documentsWritten: 256 } });
  const count = 17_300; // Above both 8,192 array elements and 16,000 document writes.
  const packageBatches = await Promise.all(Array.from({ length: Math.ceil(count / 200) }, (_, i) =>
    declareBatch(packageRows(Math.min(200, count - i * 200), i * 200))));
  const input = { ...declaration, packageBatches };
  const { releaseId } = await t.mutation(internal.ingest.createRelease, input);
  expect(await t.mutation(internal.ingest.createRelease, input)).toEqual({ releaseId, existed: true });
  const declared = await t.run((ctx) => ctx.db.query("releasePackageBatches")
    .withIndex("by_releaseId_and_batchIndex", q => q.eq("releaseId", releaseId)).take(88));
  expect(declared).toHaveLength(87);
  expect(declared.reduce((sum, batch) => sum + batch.count, 0)).toBe(count);
  expect(declared.map(batch => batch.digest)).toEqual(packageBatches.map(batch => batch.digest));
  expect(declared.every(batch => !batch.uploaded)).toBe(true);
  expect(await t.run((ctx) => ctx.db.query("licensePackages").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ packageBatchCount: 87, uploadedPackageBatchCount: 0 });
});

it("uploads full and partial package batches within 202 writes, resumes replays, and rejects changed/incomplete declarations", async () => {
  vi.useFakeTimers();
  // 401 total rows exceed the per-transaction budget, while 200 rows + the
  // batch/release progress writes fit exactly. The last batch has one row.
  const t = convexTest({ schema, modules, transactionLimits: { documentsWritten: 202 } });
  const packages = packageRows(401);
  const batches = [packages.slice(0, 200), packages.slice(200, 400), packages.slice(400)];
  const packageBatches = await Promise.all(batches.map(declareBatch));
  const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...declaration, packageBatches });
  // Supply the complete page upload first: incomplete activation below must be
  // caused by the missing package batches, not by a missing page.
  await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "scale", pages: [{
    externalId: "one", name: "one", section: "1", sitemapPage: 1, title: "one", description: "one",
    sourcePath: "one.1", sourcePackage: null, sourcePackageVersion: null, contentSha256: "one",
    hasParseWarnings: false, doc: { blocks: [] }, synopsis: null, options: null, seeAlso: null,
    searchText: "one", snippetText: "one", links: [],
  }] });
  const activate = () => t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "scale", stage: "prod", activatedAt: "now" });
  for (const batchIndex of [2, 0, 1]) { // Resume out of order, including the short final batch.
    const batch = batches[batchIndex];
    const upload = (packages = batch) => t.mutation(internal.ingest.insertLicensePackages, { datasetReleaseId: "scale", batchIndex, packages });
    expect(await upload()).toEqual({ inserted: batch.length, skipped: 0 });
    expect(await upload()).toEqual({ inserted: 0, skipped: batch.length });
    await expect(upload([{ ...batch[0], version: "changed" }, ...batch.slice(1)])).rejects.toThrow("RELEASE_MANIFEST_CONFLICT");
    if (batchIndex !== 1) await expect(activate()).rejects.toThrow("RELEASE_MANIFEST_INCOMPLETE");
  }
  expect(await activate()).toMatchObject({ pending: true });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await activate()).toMatchObject({ pending: false });
  const listed = await t.query(api.queries.listLicenses, { distro: "debian" });
  expect(listed.packages.map(pkg => pkg.name)).toEqual(packages.map(pkg => pkg.name));
  expect(listed.nextCursor).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ uploadedPackageBatchCount: 3, sealed: true });
});

it("paginates across the 5,000-package boundary without duplicates or unbounded reads", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 5005, documentsWritten: 1000 } });
  const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...declaration, licensePackages: [] });
  const packages = packageRows(5001);
  // Query coverage uses direct, batched fixture writes instead of repeating
  // thousands of ingestion uniqueness lookups already covered above.
  for (let start = 0; start < packages.length; start += 1000) {
    await t.run(async ctx => {
      for (const pkg of packages.slice(start, start + 1000)) {
        await ctx.db.insert("licensePackages", { releaseId, datasetReleaseId: "scale",
          packageName: pkg.name, version: pkg.version, hasLicenseText: pkg.hasLicenseText });
      }
    });
  }
  await t.run(ctx => ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "scale", activatedAt: "now" }));
  const first = await t.query(api.queries.listLicenses, { distro: "debian" });
  expect(first.packages).toHaveLength(5000);
  expect(first.nextCursor).toBe(packages[4999].name);
  const last = await t.query(api.queries.listLicenses, { distro: "debian", cursor: first.nextCursor!, datasetReleaseId: first.datasetReleaseId });
  expect(last.packages).toHaveLength(1);
  expect(last.nextCursor).toBeNull();
  expect([...first.packages, ...last.packages].map(pkg => pkg.name)).toEqual(packages.map(pkg => pkg.name));
});

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
