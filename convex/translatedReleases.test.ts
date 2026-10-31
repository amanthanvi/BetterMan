/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { DatasetStage, Distro } from "./lib";
import schema from "./schema";
import { INGEST_CONTRACT } from "./ingestContract";
import debianManifest from "../ingestion/data/debian-trixie.json";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;

const releaseInput = (datasetReleaseId: string, locale: string, distro: Distro = "debian", pageCount = 0) => ({
  datasetReleaseId, distro, locale, imageRef: "test", imageDigest: "test",
  ingestedAt: "2026-10-30T00:00:00Z", packageManifest: null,
  pageCount, aliasCount: 0, licenseCount: 0,
  sectionTotals: pageCount ? [{ section: "1", total: pageCount }] : [], licensePackages: [],
});

async function readyRelease(t: Harness, datasetReleaseId: string, locale: string, stage: DatasetStage | null, manifest: unknown = null) {
  const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...releaseInput(datasetReleaseId, locale), packageManifest: manifest, ...(manifest ? { indexablePageCount: 0 } : {}) });
  await t.run((ctx) => ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 }));
  if (stage) await point(t, releaseId, stage);
  return releaseId;
}

async function point(t: Harness, releaseId: Id<"datasetReleases">, stage: DatasetStage) {
  await t.run(async (ctx) => {
    const release = await ctx.db.get(releaseId);
    if (!release) throw new Error("fixture release missing");
    await ctx.db.insert("activeReleases", {
      releaseId, datasetReleaseId: release.datasetReleaseId,
      stage, locale: release.locale, distro: release.distro, activatedAt: "2026-10-30T00:00:00Z",
    });
  });
}

const pointer = (t: Harness, stage: DatasetStage, locale: string) => t.run((ctx) => ctx.db.query("activeReleases")
  .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", stage).eq("locale", locale).eq("distro", "debian")).unique());

const promotion = { fromStage: "staging" as const, toStage: "prod" as const, distros: ["debian" as const], activatedAt: "2026-10-30T01:00:00Z" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("translated releases (#395)", () => {
  it.each(["xx", "pt_BR", "DE", "", "en-US"])("rejects the unsupported release locale %j", async (locale) => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.ingest.createRelease, releaseInput("bad", locale))).rejects.toThrow("INVALID_RELEASE_LOCALE");
    expect(await t.run((ctx) => ctx.db.query("datasetReleases").take(1))).toEqual([]);
  });

  it.each(["en", "de", "fr", "es", "pt-BR", "ja", "ru"])("accepts the content locale %s", async (locale) => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput(`r-${locale}`, locale));
    expect(await t.run((ctx) => ctx.db.get(releaseId))).toMatchObject({ locale });
  });

  it("holds direct prod activation of a translation, allows staging and explicit authorization, and leaves English alone", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const english = await readyRelease(t, "english", "en", "prod");
    await t.mutation(internal.ingest.createRelease, releaseInput("german", "de", "debian", 1));
    await t.mutation(internal.ingest.insertPages, {
      datasetReleaseId: "german",
      pages: [{
        externalId: "tar", name: "tar", section: "1", sitemapPage: 0, title: "tar(1)", description: "tar",
        sourcePath: "usr/share/man/de/man1/tar.1.gz", sourcePackage: null, sourcePackageVersion: null,
        contentSha256: "tar", hasParseWarnings: false, searchText: "tar", snippetText: "tar", links: [],
        doc: {}, synopsis: null, options: null, seeAlso: null,
      }],
    });
    const activation = { datasetReleaseId: "german", stage: "prod" as const, activatedAt: "2026-10-30T01:00:00Z" };
    for (const allowTranslations of [undefined, false]) {
      await expect(t.mutation(internal.ingest.activateRelease, { ...activation, ...(allowTranslations === undefined ? {} : { allowTranslations }) }))
        .rejects.toThrow("TRANSLATED_PROMOTION_HELD");
    }
    expect(await pointer(t, "prod", "de")).toBeNull();
    expect((await t.run((ctx) => ctx.db.query("datasetReleases").withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", "german")).unique()))?.sealed).not.toBe(true);
    await t.mutation(internal.ingest.activateRelease, { ...activation, stage: "staging" });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.ingest.activateRelease, { ...activation, stage: "staging" })).toMatchObject({ pending: false });
    expect(await pointer(t, "staging", "de")).toMatchObject({ datasetReleaseId: "german" });
    expect(await t.mutation(internal.ingest.activateRelease, { ...activation, allowTranslations: true })).toMatchObject({ pending: false });
    expect(await pointer(t, "prod", "de")).toMatchObject({ datasetReleaseId: "german" });
    expect(await pointer(t, "prod", "en")).toMatchObject({ releaseId: english });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    // Derived corpus data and task phrases stay English-only.
    expect(await t.run((ctx) => ctx.db.query("derivedBuilds").take(5))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("taskPhraseBackfills").take(5))).toEqual([]);
  });

  it("promotes one locale per request behind the translated hold, without moving English", async () => {
    const t = convexTest(schema, modules);
    const englishStaging = await readyRelease(t, "en-staging", "en", "staging");
    await readyRelease(t, "de-staging", "de", "staging");
    expect(await t.query(internal.ingest.getPromotionSource, { distro: "debian", locale: "de" })).toEqual({ distro: "debian", datasetReleaseId: "de-staging" });
    await expect(t.query(internal.ingest.getPromotionSource, { distro: "debian", locale: "xx" })).rejects.toThrow("INVALID_RELEASE_LOCALE");
    await expect(t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, locale: "pt_BR" })).rejects.toThrow("INVALID_RELEASE_LOCALE");

    const held = { promoted: [], skipped: [{ distro: "debian", datasetReleaseId: "de-staging", reason: "TRANSLATED_PROMOTION_HELD" }] };
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, locale: "de" })).toEqual(held);
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, locale: "de", allowTranslations: false })).toEqual(held);
    expect(await pointer(t, "prod", "de")).toBeNull();
    expect(await pointer(t, "prod", "en")).toBeNull();

    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, locale: "de", allowTranslations: true, expectedDatasetReleaseId: { debian: "de-staging" } }))
      .toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "de-staging" }] });
    expect(await pointer(t, "prod", "de")).toMatchObject({ datasetReleaseId: "de-staging" });
    expect(await pointer(t, "prod", "en")).toBeNull();

    // The default locale is English and never reads a translated pointer.
    expect(await t.mutation(internal.ingest.promoteActiveReleases, promotion)).toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "en-staging" }] });
    expect(await pointer(t, "prod", "en")).toMatchObject({ releaseId: englishStaging });
    expect(await pointer(t, "prod", "de")).toMatchObject({ datasetReleaseId: "de-staging" });
    expect(await t.run((ctx) => ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", "de")).take(1))).toEqual([]);
  });

  it("requires both authorizations for an archive-extracted translation", async () => {
    const t = convexTest(schema, modules);
    await readyRelease(t, "de-archive", "de", "staging", debianManifest);
    const reason = (value: string) => ({ promoted: [], skipped: [{ distro: "debian", datasetReleaseId: "de-archive", reason: value }] });
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, locale: "de", allowTranslations: true })).toEqual(reason("FULL_DEBIAN_PROMOTION_HELD"));
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, locale: "de", allowFullDebian: true })).toEqual(reason("TRANSLATED_PROMOTION_HELD"));
    expect(await pointer(t, "prod", "de")).toBeNull();
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...promotion, locale: "de", allowFullDebian: true, allowTranslations: true }))
      .toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "de-archive" }] });
  });

  it("never lets the HTTP activate route authorize a translated prod pointer", async () => {
    vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
    const t = convexTest(schema, modules);
    await readyRelease(t, "de-http", "de", null);
    const response = await t.fetch("/ingest/activate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-secret", "x-betterman-ingest-contract": String(INGEST_CONTRACT.schemaVersion) },
      body: JSON.stringify({ datasetReleaseId: "de-http", stage: "prod", activatedAt: "now", allowTranslations: true }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "TRANSLATED_PROMOTION_HELD" } });
    expect(await pointer(t, "prod", "de")).toBeNull();
  });

  it("stores a translated page's documented version and ignores it on English pages", async () => {
    const t = convexTest(schema, modules);
    for (const locale of ["de", "en"]) {
      await t.mutation(internal.ingest.createRelease, releaseInput(`pages-${locale}`, locale, "debian", 1));
      const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["{}"], { type: "application/json" })));
      await t.mutation(internal.ingest.insertStoredPages, {
        datasetReleaseId: `pages-${locale}`,
        pages: [{
          externalId: "tar", name: "tar", section: "1", sitemapPage: 0, title: "tar(1)", description: "Archivierungsprogramm",
          sourcePath: "usr/share/man/de/man1/tar.1.gz", sourcePackage: "manpages-de", sourcePackageVersion: "4.27.0-1",
          contentSha256: `sha-${locale}`, hasParseWarnings: false, contentStorageId, documentedVersion: "  1.34 ",
          searchText: "tar", snippetText: "tar", links: [],
        }],
      });
    }
    const page = (datasetReleaseId: string) => t.run((ctx) => ctx.db.query("manPages").filter((q) => q.eq(q.field("datasetReleaseId"), datasetReleaseId)).unique());
    expect(await page("pages-de")).toMatchObject({ locale: "de", documentedVersion: "1.34" });
    expect((await page("pages-en"))?.documentedVersion).toBeUndefined();
  });
});
