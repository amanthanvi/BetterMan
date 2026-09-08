/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("returns pending until hydration completes, then publishes through the authenticated HTTP route", async () => {
  vi.useFakeTimers();
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId: "http-test", locale: "en", distro: "debian", imageRef: "test",
    imageDigest: "test", ingestedAt: "2026-09-07T00:00:00Z", packageManifest: null,
    pageCount: 0, sectionTotals: [], licensePackages: [],
  });
  const request = { method: "POST", headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ datasetReleaseId: "http-test", stage: "prod", activatedAt: "2026-09-07T00:00:00Z" }) };
  const pending = await t.fetch("/ingest/activate", request);
  expect(pending.status).toBe(409);
  expect(await pending.json()).toMatchObject({ pending: true });
  expect(await t.run((ctx) => ctx.db.query("activeReleases").take(1))).toEqual([]);
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const ready = await t.fetch("/ingest/activate", request);
  expect(ready.status).toBe(200);
  expect(await ready.json()).toMatchObject({ pending: false, datasetReleaseId: "http-test" });
  expect(await t.query(internal.related.activeMetadataStatus, {})).toMatchObject({
    complete: true, releases: [{ sealed: true, complete: true }],
  });
});

it("rejects unauthenticated activation without changing release state", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  const response = await t.fetch("/ingest/activate", { method: "POST", body: "{}" });
  expect(response.status).toBe(401);
  expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
});

it("cleans up storage uploaded by a rejected late batch without altering the sealed release", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  const releaseId = await t.run((ctx) => ctx.db.insert("datasetReleases", {
    datasetReleaseId: "sealed", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-09-07T00:00:00Z", pageCount: 0, sealed: true, relatedMetadataCompletedVersion: 0,
  }));
  const existingStorage = await t.run((ctx) => ctx.storage.store(new Blob(["keep"])));
  const page = {
    externalId: "late", name: "late", section: "1", sitemapPage: 0, title: "late", description: "late",
    sourcePath: "late.1", sourcePackage: null, sourcePackageVersion: null, contentSha256: "late",
    hasParseWarnings: false, doc: {}, synopsis: null, options: null, seeAlso: null,
    searchText: "late", snippetText: "late", links: [],
  };
  await expect(t.fetch("/ingest/pages/storage", {
    method: "POST", headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ datasetReleaseId: "sealed", pages: [page] }),
  })).rejects.toThrow("RELEASE_SEALED");
  const remaining = await t.run((ctx) => ctx.db.system.query("_storage").take(10));
  expect(remaining.map((item) => item._id)).toEqual([existingStorage]);
  expect(await t.run((ctx) => ctx.db.query("manPages").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ sealed: true, relatedMetadataCompletedVersion: 0 });
});
