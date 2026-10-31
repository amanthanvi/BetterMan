/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { readProviderPackages } from "./_providers";
import { requireMutableBlob } from "./_releaseIntegrity";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("preserves every provider, seals only complete uploads, and isolates canonical reads from alternates", async () => {
  vi.useFakeTimers(); vi.stubEnv("CONVEX_INGEST_SECRET", "local");
  const t = convexTest(schema, modules);
  await t.mutation(internal.ingest.createRelease, { datasetReleaseId: "providers", locale: "en", distro: "debian",
    imageRef: "snapshot", imageDigest: "pinned", ingestedAt: "now", packageManifest: null,
    pageCount: 1, providerCount: 4, aliasCount: 0, licenseCount: 0, packageBatches: [],
    sectionTotals: [{ section: "1", total: 1 }],
  });
  const page = (id: string, providerOnly = false) => ({
    externalId: id, name: "shared", section: "1", sourcePackage: providerOnly ? "alternate" : "popular",
    sourcePackageVersion: "1", sourcePath: `/usr/share/man/${id}.1.gz`, sitemapPage: 1,
    title: "shared(1)", description: id, contentSha256: id, hasParseWarnings: false,
    doc: { blocks: [{ type: "paragraph", inlines: [{ type: "text", text: id }] }], toc: [] },
    synopsis: null, options: null, seeAlso: null, searchText: "", snippetText: id, links: [],
    ...(providerOnly ? { providerOnly: true } : {}),
  });
  const upload = (pages: unknown[]) => t.fetch("/ingest/pages/storage", { method: "POST",
    headers: { authorization: "Bearer local", "content-type": "application/json" },
    body: JSON.stringify({ datasetReleaseId: "providers", pages }),
  });
  expect((await upload([page("case-A", true)])).status).toBe(200); // Alternate can arrive first.
  expect((await upload([page("canonical")])).status).toBe(200);
  expect(await (await upload([page("case-A", true)])).json()).toMatchObject({ inserted: 0, skipped: 1 });
  const changed = { ...page("case-A", true), doc: { blocks: [] } };
  expect((await upload([changed])).status).toBe(409);
  const activate = () => t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "providers", stage: "prod", activatedAt: "now" });
  await expect(activate()).rejects.toThrow("RELEASE_MANIFEST_INCOMPLETE");
  expect((await upload([page("case-b", true)])).status).toBe(200);
  expect((await upload([{ ...page("canonical", true), externalId: "same", sourcePackage: "identical" }])).status).toBe(200);
  await t.mutation(internal.ingest.insertAliases, { datasetReleaseId: "providers", aliases: [{
    name: "shared", section: "1", sourcePackage: "stub", sourcePath: "man1/shared.1",
    targetName: "shared", targetSection: "1", targetPackage: "popular", providerOnly: true,
  }] });
  expect(await activate()).toMatchObject({ pending: true });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await activate()).toMatchObject({ pending: false });
  expect(await t.query(api.queries.providersFor, { distro: "debian", name: "SHARED", section: "1" }))
    .toEqual({ packages: ["alternate", "identical", "popular", "stub"], datasetReleaseId: "providers" });
  expect(await t.query(api.queries.providersFor, { distro: "debian", name: "missing", section: "1" }))
    .toEqual({ packages: [], datasetReleaseId: "providers" });
  await expect(t.query(api.queries.providersFor, { distro: "debian", name: "shared", section: "1", ...{ stage: "staging" } }))
    .rejects.toThrow();
  expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1", pkg: "stub" }))
    .toMatchObject({ kind: "alias", name: "shared", section: "1", pkg: "popular" });
  await t.run(async ctx => {
    const canonical = (await ctx.db.query("manPages").take(1))[0];
    expect(canonical.providerPackages).toEqual(["alternate", "identical", "popular", "stub"]);
    const release = (await ctx.db.get(canonical.releaseId))!;
    const query = vi.spyOn(ctx.db, "query");
    expect(await readProviderPackages(ctx, release, "shared", "1", canonical)).toEqual(["alternate", "identical", "popular", "stub"]);
    expect(query).not.toHaveBeenCalled(); // Cached collisions add zero document reads.
    query.mockRestore();
    expect(await readProviderPackages(ctx, release, "shared", "1", { ...canonical, providerPackages: undefined })).toEqual(["alternate", "identical", "popular", "stub"]);
    const candidates = await ctx.db.query("manPageProviders").withIndex("by_releaseId_and_route_and_package_and_path", q =>
      q.eq("releaseId", release._id).eq("name", "shared").eq("section", "1")).take(100);
    const caseQueries = vi.spyOn(ctx.db, "query");
    await readProviderPackages(ctx, release, "shared", "1", null, candidates);
    expect(caseQueries.mock.calls.map(([table]) => table)).toEqual(["manPageAliasProviders"]);
    caseQueries.mockRestore();
  });
  expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1" }))
    .toMatchObject({ kind: "page", data: { page: { sourcePackage: "popular", description: "canonical" }, providers: { packages: ["alternate", "identical", "popular", "stub"], defaultPackage: "popular", policy: "curated" } } });
  await t.run(async ctx => {
    for (const [contentSha256, summary] of [["canonical", "Canonical brief"], ["case-A", "Alternate brief"]]) {
      await ctx.db.insert("manPageGenerated", { contentSha256, updatedAt: "now", generated: {
        provider: "fixture", model: "fixture", promptVersion: "fixture", generatedAt: "now", summary,
        examples: [], taskPhrases: [], rejected: 0,
      } });
    }
  });
  expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1", pkg: "alternate" }))
    .toMatchObject({ kind: "page", data: { brief: { summary: "Alternate brief" }, providers: { packages: ["alternate", "identical", "popular", "stub"], defaultPackage: "popular" } } });
  expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1" }))
    .toMatchObject({ kind: "page", data: { brief: { summary: "Canonical brief" } } });
  expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1", pkg: "alternate" }))
    .toMatchObject({ kind: "page", data: { page: { sourcePackage: "alternate", description: "case-A", indexable: false }, providers: { sameAsDefault: false } } });
  expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1", pkg: "identical" }))
    .toMatchObject({ kind: "page", data: { page: { indexable: false }, providers: { sameAsDefault: true } } });
  for (const indexed of [undefined, false, true]) {
    await t.run(async ctx => {
      const canonical = (await ctx.db.query("manPages").take(1))[0];
      await ctx.db.patch(canonical.releaseId, { indexablePageCount: indexed === undefined ? undefined : Number(indexed) });
      await ctx.db.patch(canonical._id, { indexable: indexed ?? false });
    });
    for (const pkg of ["popular", "alternate", "identical"]) {
      expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1", pkg }))
        .toMatchObject({ kind: "page", data: { page: { indexable: pkg === "popular" && indexed !== false } } });
    }
  }
  await t.run(async ctx => {
    const canonical = (await ctx.db.query("manPages").take(1))[0];
    await ctx.db.patch(canonical.releaseId, { indexablePageCount: undefined });
    await ctx.db.patch(canonical._id, { indexable: undefined });
  });
  expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1", pkg: "absent" })).toBeNull();
  expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "shared", section: "1", pkg: "absent", reportRelease: true }))
    .toEqual({ kind: "not_found", datasetReleaseId: expect.any(String) });
  expect((await t.query(api.queries.listSection, { distro: "debian", section: "1", limit: 20 }))?.results).toHaveLength(1);
  expect((await upload([page("late", true)])).status).toBe(409);
  const providers = await t.run(ctx => ctx.db.query("manPageProviders").take(3));
  expect(providers).toHaveLength(3); // Same package, distinct case/source paths survive too.
  await expect(t.run(ctx => requireMutableBlob(ctx, providers[0].blobId))).rejects.toThrow("RELEASE_SEALED");
  expect(await t.mutation(internal.maintenance.cleanupOrphanContentBlobsBatch, { cursor: null, dryRun: true }))
    .toMatchObject({ orphans: 0 });
  await expect(t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { datasetReleaseId: "providers", confirmDatasetReleaseId: "providers" }))
    .rejects.toThrow("REFUSING_TO_DELETE_ACTIVE_RELEASE");
  // Retire through a real replacement build so B7 releases durable pins/rows;
  // deleting a prod pointer alone is intentionally insufficient for pruning.
  await t.mutation(internal.ingest.createRelease, { datasetReleaseId: "providers-replacement", locale: "en", distro: "debian",
    imageRef: "fixture", imageDigest: "fixture", ingestedAt: "2026-10-29T00:00:00Z", packageManifest: null,
    pageCount: 1, aliasCount: 0, licenseCount: 0, sectionTotals: [{section: "1", total: 1}], packageBatches: [],
  });
  await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "providers-replacement", pages: [{
    externalId: "replacement", name: "replacement", section: "1", sitemapPage: 0, title: "replacement", description: "replacement",
    sourcePath: "replacement.1", sourcePackage: null, sourcePackageVersion: null, contentSha256: "replacement", hasParseWarnings: false,
    extractorVersion: 1, doc: {toc: [], blocks: []}, synopsis: null, options: [], seeAlso: null, searchText: "", snippetText: "", links: [],
  }] });
  const replace = () => t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "providers-replacement", stage: "prod", activatedAt: "now" });
  await replace();
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await replace();
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  let done = false;
  while (!done) done = (await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { datasetReleaseId: "providers", confirmDatasetReleaseId: "providers", maxDocs: 5 })).deletedRelease;
  expect(await t.run(ctx => ctx.db.query("manPageProviders").take(1))).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("releaseProviderUploadShards").take(1))).toEqual([]);
  expect(await t.mutation(internal.maintenance.cleanupOrphanContentBlobsBatch, { cursor: null, dryRun: true }))
    .toMatchObject({ orphans: 3 });
});
