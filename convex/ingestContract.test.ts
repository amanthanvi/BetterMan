/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { INGEST_CONTRACT } from "./ingestContract";
import { internal } from "./_generated/api";
import { canonicalJson } from "./ingest";
import { storedPayloadDigest } from "./_storedPayload";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
});

it("advertises the ingest contract only when the ingest secret matches", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);

  const anonymous = await t.fetch("/ingest/contract", { method: "GET" });
  expect(anonymous.status).toBe(401);

  const response = await t.fetch("/ingest/contract", {
    method: "GET",
    headers: { authorization: "Bearer test-secret" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    schemaVersion: INGEST_CONTRACT.schemaVersion,
    functions: [...INGEST_CONTRACT.functions],
    declarationCounts: [...INGEST_CONTRACT.declarationCounts],
    activatePending: INGEST_CONTRACT.activatePending,
  });
});

it("does not advertise the ingest contract when the secret is unset", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "");
  const t = convexTest(schema, modules);
  const response = await t.fetch("/ingest/contract", {
    method: "GET",
    headers: { authorization: "Bearer test-secret" },
  });
  expect(response.status).toBe(503);
});

it.each([undefined, "5", "7"])("rejects promotion from a workflow with contract header %s before touching pointers", async (version) => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  const response = await t.fetch("/ingest/promote", {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json", ...(version ? { "x-betterman-ingest-contract": version } : {}) },
    body: JSON.stringify({ fromStage: "staging", toStage: "prod", distros: ["debian"], activatedAt: "now" }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "INGEST_CONTRACT_MISMATCH" } });
  expect(await t.run(ctx => ctx.db.query("activeReleases").take(10))).toEqual([]);
  expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").take(10))).toEqual([]);
});

it("accepts the deployed promotion contract while keeping CAS optional for manual callers", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  const response = await t.fetch("/ingest/promote", {
    method: "POST", headers: { authorization: "Bearer test-secret", "content-type": "application/json", "x-betterman-ingest-contract": String(INGEST_CONTRACT.schemaVersion) },
    body: JSON.stringify({ fromStage: "staging", toStage: "prod", distros: [], activatedAt: "now" }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ promoted: [] });
});

it("combines package batches, symbols, signatures, optional arguments and providers in one v5 sealed release", async () => {
  vi.useFakeTimers();
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  try {
    const t = convexTest(schema, modules);
    const packages = [{ name: "tar", version: "1", hasLicenseText: false }];
    const { releaseId } = await t.mutation(internal.ingest.createRelease, {
      datasetReleaseId: "combined-contract", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
      ingestedAt: "2026-10-28T00:00:00Z", packageManifest: null, pageCount: 1, providerCount: 2, aliasCount: 1, licenseCount: 0,
      sectionTotals: [{ section: "1", total: 1 }],
      packageBatches: [{ digest: await storedPayloadDigest(canonicalJson(packages)), count: 1, licenseCount: 0 }],
    });
    expect(await t.mutation(internal.ingest.insertLicensePackages, {
      datasetReleaseId: "combined-contract", batchIndex: 0, packages,
    })).toEqual({ inserted: 1, skipped: 0 });
    const response = await t.fetch("/ingest/pages/storage", {
      method: "POST", headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ datasetReleaseId: "combined-contract", pages: [{
        externalId: "tar", name: "tar", section: "1", sitemapPage: 0, title: "tar", description: "archive",
        sourcePath: "tar.1", sourcePackage: "tar", sourcePackageVersion: "1", contentSha256: "tar-source",
        hasParseWarnings: false, extractorVersion: 123456, doc: { toc: [], blocks: [] }, synopsis: null,
        options: [{ flags: "-c, --create", anchorId: "create" }, { flags: "--color", argument: "[WHEN]", anchorId: "color" }], seeAlso: null,
        symbols: [{ term: "TAR_OPTIONS", anchorId: "environment", excerpt: "Default options", kind: "environment" }],
        searchText: "", snippetText: "archive", links: [],
      }] }),
    });
    expect(response.status).toBe(200);
    const alternate = await t.fetch("/ingest/pages/storage", {
      method: "POST", headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ datasetReleaseId: "combined-contract", pages: [{
        externalId: "tar-alternate", name: "tar", section: "1", sitemapPage: 0, title: "alternate tar", description: "alternate archive",
        sourcePath: "alternate/tar.1", sourcePackage: "alternate-tar", sourcePackageVersion: "2", contentSha256: "alternate-source",
        hasParseWarnings: false, providerOnly: true, extractorVersion: 123456, doc: { toc: [], blocks: [] }, synopsis: null,
        options: [{ flags: "--other", argument: "[VALUE]", anchorId: "other" }], seeAlso: null,
        symbols: [{ term: "OTHER_OPTIONS", anchorId: "environment", excerpt: "Other defaults", kind: "environment" }],
        searchText: "", snippetText: "alternate", links: [],
      }] }),
    });
    expect(alternate.status).toBe(200);
    await t.mutation(internal.ingest.insertAliases, { datasetReleaseId: "combined-contract", aliases: [{
      name: "tar-alias", section: "1", targetName: "tar", targetSection: "1", sourcePackage: "alternate-tar",
      sourcePath: "alternate/tar-alias.1", targetPackage: "alternate-tar", providerOnly: false,
    }] });
    const activate = () => t.mutation(internal.ingest.activateRelease, {
      stage: "staging", datasetReleaseId: "combined-contract", activatedAt: "now",
    });
    expect(await activate()).toMatchObject({ pending: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await activate()).toMatchObject({ pending: false });
    const state = await t.run(async (ctx) => ({
      release: await ctx.db.get(releaseId),
      input: await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", releaseId)).unique(),
      symbols: await ctx.db.query("manPageSymbols").withIndex("by_releaseId_and_termNorm", q => q.eq("releaseId", releaseId)).take(2),
      flags: await ctx.db.query("manPageOptionFlags").withIndex("by_releaseId_and_flag_and_nameNorm", q => q.eq("releaseId", releaseId)).take(4),
      providers: await ctx.db.query("manPageProviders").withIndex("by_releaseId_and_externalId", q => q.eq("releaseId", releaseId)).take(2),
      aliasProviders: await ctx.db.query("manPageAliasProviders").withIndex("by_releaseId_and_route_and_package_and_path", q => q.eq("releaseId", releaseId)).take(2),
      packages: await ctx.db.query("licensePackages").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId)).take(2),
    }));
    expect(state.release).toMatchObject({ sealed: true, uploadedPackageBatchCount: 1 });
    expect(state.input).toMatchObject({ status: "ready", extractorVersion: 123456 });
    expect(state.symbols).toMatchObject([{term: "TAR_OPTIONS", anchorId: "environment"}]);
    expect(state.flags.find(flag => flag.flag === "--color")).toMatchObject({argumentOptional: true});
    expect(await t.query(internal.maintenance.measureReleaseBatch, { datasetReleaseId: "combined-contract", table: "manPageSymbols", cursor: null }))
      .toMatchObject({ documents: 1, jsonBytes: new TextEncoder().encode(JSON.stringify(state.symbols[0])).length, isDone: true });
    expect(state.providers).toMatchObject([{sourcePackage: "alternate-tar"}]);
    expect(state.aliasProviders).toMatchObject([{targetPackage: "alternate-tar"}]);
    expect(state.packages.map((pkg) => pkg.packageName)).toEqual(["tar"]);
  } finally {
    vi.useRealTimers();
  }
});
