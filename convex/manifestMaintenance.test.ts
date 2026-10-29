/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import { MANIFEST_CONTENT_TYPE, MANIFEST_ORPHAN_MIN_AGE_MS } from "./_manifestStorage";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());

it("sweeps aged unlinked manifest files, preserving references, in-flight uploads and other content", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T00:00:00Z"));
  const t = convexTest(schema, modules);
  const files = await t.run(async (ctx) => ({
    orphan: await ctx.storage.store(new Blob(["orphan"], { type: MANIFEST_CONTENT_TYPE })),
    live: await ctx.storage.store(new Blob(["live"], { type: MANIFEST_CONTENT_TYPE })),
    page: await ctx.storage.store(new Blob(["page"], { type: "application/json" })),
  }));
  // convex-test 0.0.60 omits Blob.type from _storage metadata. Supply only
  // that missing metadata, as the real local backend does on storage.store().
  await t.run(async (ctx) => {
    for (const id of [files.orphan, files.live]) {
      await Reflect.apply(Reflect.get(ctx.db, "patch"), ctx.db, [id, { contentType: MANIFEST_CONTENT_TYPE }]);
    }
  });
  vi.setSystemTime(Date.now() + MANIFEST_ORPHAN_MIN_AGE_MS + 1);
  const young = await t.run((ctx) => ctx.storage.store(new Blob(["uploading"], { type: MANIFEST_CONTENT_TYPE })));
  await t.run(async (ctx) => {
    await Reflect.apply(Reflect.get(ctx.db, "patch"), ctx.db, [young, { contentType: MANIFEST_CONTENT_TYPE }]);
    const releaseId = await ctx.db.insert("datasetReleases", { datasetReleaseId: "live", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test", ingestedAt: "now", pageCount: 0 });
    await ctx.db.insert("releaseManifests", { releaseId, storageId: files.live });
  });
  expect(await t.mutation(internal.maintenance.cleanupOrphanManifestFilesBatch, { cursor: null, dryRun: true }))
    .toMatchObject({ scanned: 4, orphans: 1, storageDeletes: 0 });
  expect(await t.mutation(internal.maintenance.cleanupOrphanManifestFilesBatch, { cursor: null }))
    .toMatchObject({ orphans: 1, storageDeletes: 1 });
  expect(await t.run((ctx) => ctx.db.system.get(files.orphan))).toBeNull();
  for (const id of [files.live, files.page, young]) expect(await t.run((ctx) => ctx.db.system.get(id))).not.toBeNull();
});

it("previews, migrates and replays sealed active legacy manifests without changing declarations or pointers", async () => {
  const t = convexTest(schema, modules);
  const releaseId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("datasetReleases", { datasetReleaseId: "legacy", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test", ingestedAt: "now", pageCount: 1, sealed: true, packageManifestJson: '{"source":"original"}' });
    await ctx.db.insert("activeReleases", { releaseId: id, datasetReleaseId: "legacy", locale: "en", distro: "debian", stage: "prod", activatedAt: "then" });
    return id;
  });
  const before = await t.run((ctx) => ctx.db.get(releaseId));
  const pointers = await t.run((ctx) => ctx.db.query("activeReleases").take(2));
  expect(await t.mutation(internal.maintenance.detachLegacyManifests, { cursor: null, dryRun: true })).toMatchObject({ moved: 1 });
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toEqual(before);
  expect(await t.mutation(internal.maintenance.detachLegacyManifests, { cursor: null })).toMatchObject({ moved: 1 });
  const { packageManifestJson, ...rest } = before!;
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toEqual(rest);
  expect((await t.run((ctx) => ctx.db.query("releaseManifests").take(2)))[0].json).toBe(packageManifestJson);
  expect(await t.run((ctx) => ctx.db.query("activeReleases").take(2))).toEqual(pointers);
  expect(await t.mutation(internal.maintenance.detachLegacyManifests, { cursor: null })).toMatchObject({ moved: 0 });
});
