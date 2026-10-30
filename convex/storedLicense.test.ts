/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { internal, api } from "./_generated/api";
import { LICENSE_CONTENT_TYPE, MANIFEST_ORPHAN_MIN_AGE_MS } from "./_manifestStorage";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

it("preserves large license bytes, replay counts, failed-upload cleanup and release-owned storage", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, {
      datasetReleaseId: "licenses", locale: "en", distro: "fedora", imageRef: "test", imageDigest: "test", ingestedAt: "now",
      pageCount: 0, aliasCount: 0, licenseCount: 1, sectionTotals: [],
      licensePackages: [{ name: "large", version: "1", hasLicenseText: true }],
    });
    const text = "copyright notice\n".repeat(280000);
    const upload = (packageName = "large") => t.fetch("/ingest/licenses", {
      method: "POST", headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ datasetReleaseId: "licenses", licenses: [{ packageName, licenseId: "pkg:large", licenseName: "large", licenseText: text, sourceUrl: null }] }),
    });
    const rejected = await upload("undeclared");
    expect(await rejected.json()).toMatchObject({ error: { code: "UNDECLARED_LICENSE_PACKAGE" } });
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toEqual([]);
    expect(await (await upload()).json()).toEqual({ inserted: 1, skipped: 0 });
    expect(await (await upload()).json()).toEqual({ inserted: 0, skipped: 1 });
    const license = await t.run(ctx => ctx.db.query("licenses").first());
    expect(license?.licenseText).toBe("");
    expect(await t.run(async ctx => (await ctx.storage.get(license!.storageId!))?.text())).toBe(JSON.stringify({ package: "large", licenseId: "pkg:large", licenseName: "large", text }));
    expect((await t.run(ctx => ctx.db.get(releaseId)))?.uploadedLicenseCount).toBe(1);
    expect((await t.run(ctx => ctx.db.system.query("_storage").collect())).length).toBe(1);
    const pointer = await t.run(ctx => ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "fedora", releaseId, datasetReleaseId: "licenses", activatedAt: "now" }));
    expect(await t.query(api.queries.getLicense, { distro: "fedora", packageName: "large" })).toMatchObject({ text: "", textUrl: expect.any(String) });
    const orphan = await t.run(ctx => ctx.storage.store(new Blob(["orphan"], { type: LICENSE_CONTENT_TYPE })));
    await t.run(async ctx => {
      for (const id of [orphan, license!.storageId!]) await Reflect.apply(Reflect.get(ctx.db, "patch"), ctx.db, [id, { contentType: LICENSE_CONTENT_TYPE }]);
    });
    vi.setSystemTime(Date.now() + MANIFEST_ORPHAN_MIN_AGE_MS + 1);
    expect(await t.mutation(internal.maintenance.cleanupOrphanManifestFilesBatch, { cursor: null })).toMatchObject({ orphans: 1, storageDeletes: 1 });
    expect(await t.run(async ctx => (await ctx.storage.get(license!.storageId!)) !== null)).toBe(true);
    await t.run(ctx => ctx.db.delete(pointer));
    await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { datasetReleaseId: "licenses", confirmDatasetReleaseId: "licenses", maxDocs: 100 });
    expect(await t.run(async ctx => (await ctx.storage.get(license!.storageId!)) !== null)).toBe(false);
  } finally { vi.useRealTimers(); vi.unstubAllEnvs(); }
});
