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

it("combines license-package batches and versioned stored-page signatures in one sealed release", async () => {
  vi.useFakeTimers();
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  try {
    const t = convexTest(schema, modules);
    const packages = [{ name: "tar", version: "1", hasLicenseText: false }];
    const { releaseId } = await t.mutation(internal.ingest.createRelease, {
      datasetReleaseId: "combined-contract", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
      ingestedAt: "2026-10-28T00:00:00Z", packageManifest: null, pageCount: 1, aliasCount: 0, licenseCount: 0,
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
        options: [{ flags: "-c, --create", anchorId: "create" }], seeAlso: null,
        searchText: "", snippetText: "archive", links: [],
      }] }),
    });
    expect(response.status).toBe(200);
    const activate = () => t.mutation(internal.ingest.activateRelease, {
      stage: "staging", datasetReleaseId: "combined-contract", activatedAt: "now",
    });
    expect(await activate()).toMatchObject({ pending: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await activate()).toMatchObject({ pending: false });
    const state = await t.run(async (ctx) => ({
      release: await ctx.db.get(releaseId),
      input: await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", releaseId)).unique(),
      packages: await ctx.db.query("licensePackages").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId)).take(2),
    }));
    expect(state.release).toMatchObject({ sealed: true, uploadedPackageBatchCount: 1 });
    expect(state.input).toMatchObject({ status: "ready", extractorVersion: 123456 });
    expect(state.packages.map((pkg) => pkg.packageName)).toEqual(["tar"]);
  } finally {
    vi.useRealTimers();
  }
});
