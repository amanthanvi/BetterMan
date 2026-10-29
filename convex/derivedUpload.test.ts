/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { decodeOptions } from "./_derivedEncoding";
import { hydrateCachedSignature, persistOptionSignature, persistPackedSignature } from "./_derivedInputs";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());
it("persists all upload-time signature options and extractor provenance independently of the search cap", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  await t.mutation(internal.ingest.createRelease, { datasetReleaseId: "upload-signature", distro: "debian", locale: "en", imageRef: "test", imageDigest: "test", ingestedAt: "2026-10-28T00:00:00Z", pageCount: 1, aliasCount: 0, licenseCount: 0, sectionTotals: [{ section: "1", total: 1 }], licensePackages: [], packageManifest: null });
  const response = await t.fetch("/ingest/pages/storage", { method: "POST", headers: { authorization: "Bearer test-secret", "Content-Type": "application/json" }, body: JSON.stringify({ datasetReleaseId: "upload-signature", pages: [{ externalId: "large", name: "large", section: "1", sitemapPage: 0, title: "large", description: "signature fixture", sourcePath: "large.1", sourcePackage: "large", sourcePackageVersion: "1", contentSha256: "source", hasParseWarnings: false, extractorVersion: 1, doc: { blocks: [], toc: [] }, synopsis: null, options: Array.from({ length: 450 }, (_, i) => ({ anchorId: `f${i}`, flags: `--flag-${i}`, description: "option" })), seeAlso: null, searchText: "", snippetText: "", links: [] }] }) });
  expect(response.status).toBe(200);
  await t.run(async (ctx) => {
    const pages = await ctx.db.query("manPages").take(1);
    expect(pages[0].optionExtractorVersion).toBe(1);
    expect(pages[0].optionSignatureHash).toBeTruthy();
    const input = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", pages[0].releaseId).eq("pageId", pages[0]._id)).unique();
    expect(input).toMatchObject({ extractorVersion: 1, status: "ready" });
    expect(decodeOptions(input!.optionsJson)).toHaveLength(450);
    const flags = await ctx.db.query("manPageOptionFlags").withIndex("by_releaseId_and_flag_and_nameNorm", (q) => q.eq("releaseId", pages[0].releaseId)).take(401);
    expect(flags).toHaveLength(400);
  });
});

it.each(["/ingest/pages", "/ingest/pages/storage"])("isolates invalid and oversized optional signatures in a multi-page %s upload", async (route) => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);
  const datasetReleaseId = "signature-failures";
  await t.mutation(internal.ingest.createRelease, { datasetReleaseId, distro: "debian", locale: "en", imageRef: "test", imageDigest: "test", ingestedAt: "2026-10-28T00:00:00Z", pageCount: 3, aliasCount: 0, licenseCount: 0, sectionTotals: [{ section: "1", total: 3 }], licensePackages: [], packageManifest: null });
  const page = (name: string, options: unknown) => ({ externalId: name, name, section: "1", sitemapPage: 0, title: name, description: "signature fixture", sourcePath: `${name}.1`, sourcePackage: "fixture", sourcePackageVersion: "1", contentSha256: name, hasParseWarnings: false, extractorVersion: 1, doc: { blocks: [], toc: [] }, synopsis: null, options, seeAlso: null, searchText: "", snippetText: "", links: [] });
  const response = await t.fetch(route, { method: "POST", headers: { authorization: "Bearer test-secret", "Content-Type": "application/json" }, body: JSON.stringify({ datasetReleaseId, pages: [
    page("good", [{ anchorId: "f", flags: "--flag", description: "valid option" }]),
    page("invalid", { not: "an option array" }),
    page("oversized", Array.from({ length: 1800 }, (_, i) => ({ anchorId: `f${i}${"x".repeat(400)}`, flags: `--flag-${i}`, description: "valid, unusually long anchor" }))),
  ] }) });
  expect(response.status).toBe(200);
  await t.run(async (ctx) => {
    const pages = await ctx.db.query("manPages").take(4);
    expect(pages).toHaveLength(3);
    const inputs = await ctx.db.query("derivedPageInputs").take(4);
    expect(inputs.find((input) => input.name === "good")).toMatchObject({ status: "ready" });
    expect(inputs.find((input) => input.name === "invalid")).toMatchObject({ status: "unavailable", error: "INVALID_OPTION_SIGNATURE" });
    expect(inputs.find((input) => input.name === "oversized")).toMatchObject({ status: "unavailable", error: "DERIVED_INPUT_LIMIT" });
    for (const failed of pages.filter((row) => row.name !== "good")) {
      expect(failed.optionSignatureHash).toBeUndefined();
      expect(await hydrateCachedSignature(ctx, failed)).toBeNull();
    }
  });
});

it("replaces a cached ready signature with unavailable provenance after invalid input", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", { datasetReleaseId: "old-cache", distro: "debian", locale: "en", imageRef: "test", imageDigest: "test", ingestedAt: "2026-10-28T00:00:00Z", pageCount: 1, aliasCount: 0, licenseCount: 0 });
    const pageId = await ctx.db.insert("manPages", { releaseId, datasetReleaseId: "old-cache", externalId: "one", locale: "en", distro: "debian", name: "one", section: "1", sitemapPage: 0, title: "one", description: "one", sourcePath: "one.1", contentSha256: "one", hasParseWarnings: false });
    expect(await persistOptionSignature(ctx, pageId, [{ flags: "--old", anchorId: "old" }], 1)).toMatchObject({ status: "ready" });
    expect(await persistPackedSignature(ctx, pageId, "[[\"bad\",[],\"none\",null]]", 1)).toMatchObject({ status: "unavailable", error: "INVALID_OPTION_SIGNATURE" });
    const page = (await ctx.db.get(pageId))!;
    expect(page.optionSignatureHash).toBeUndefined();
    expect(await hydrateCachedSignature(ctx, page)).toBeNull();
  });
});
