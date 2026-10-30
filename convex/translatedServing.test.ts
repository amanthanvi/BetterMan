/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import { getManByNameAndSectionReadModel } from "./content";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;

type Page = { name: string; section?: string; description: string; options?: string[] };

async function release(t: Harness, locale: string, pages: Page[]) {
  const datasetReleaseId = `debian-${locale}`;
  const { releaseId } = await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId, distro: "debian", locale, imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-10-30T00:00:00Z", packageManifest: null, pageCount: pages.length, aliasCount: 0, licenseCount: 0,
    sectionTotals: [{ section: "1", total: pages.length }], licensePackages: [],
  });
  const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob([JSON.stringify({ docJson: "{\"toc\":[],\"blocks\":[]}" })], { type: "application/json" })));
  await t.mutation(internal.ingest.insertStoredPages, {
    datasetReleaseId,
    pages: pages.map((page) => ({
      externalId: `${locale}-${page.name}`, name: page.name, section: page.section ?? "1", sitemapPage: 1,
      title: `${page.name}(1)`, description: page.description, sourcePath: `${page.name}.1`, sourcePackage: "pkg",
      sourcePackageVersion: "1.0-1", contentSha256: `${locale}-${page.name}`, hasParseWarnings: false, contentStorageId,
      searchText: page.name, snippetText: page.description, links: [],
      optionFlags: (page.options ?? []).map((flag) => ({ flag, anchorId: flag, flags: flag })),
    })),
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 });
    await ctx.db.insert("activeReleases", { stage: "prod", locale, distro: "debian", releaseId, datasetReleaseId, activatedAt: "now" });
  });
  return datasetReleaseId;
}

async function corpus(t: Harness) {
  await release(t, "en", [
    { name: "tar", description: "an archiving utility" },
    { name: "tail", description: "output the last part of files" },
    { name: "tarcat", description: "concatenate tar archives" },
  ]);
  await release(t, "de", [{ name: "tar", description: "ein Archivierungsprogramm" }, { name: "nur-de", description: "nur auf Deutsch" }]);
  await release(t, "fr", [{ name: "tar", description: "utilitaire d'archivage" }, { name: "tail", description: "afficher la fin" }]);
}

/** Documents a read model touches, counted through a wrapped ctx.db. */
function countingCtx(ctx: QueryCtx) {
  let documents = 0;
  const count = (value: unknown) => {
    if (Array.isArray(value)) documents += value.length;
    else if (value && typeof value === "object" && "page" in value && Array.isArray((value as { page: unknown[] }).page)) documents += (value as { page: unknown[] }).page.length;
    else if (value) documents += 1;
    return value;
  };
  const wrapQuery = (query: object): object => new Proxy(query, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = value.apply(target, args);
        if (["unique", "first", "take", "collect", "paginate"].includes(String(prop))) return (result as Promise<unknown>).then(count);
        return result && typeof result === "object" && !(result instanceof Promise) ? wrapQuery(result) : result;
      };
    },
  });
  const db = new Proxy(ctx.db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "get") return (...args: unknown[]) => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args).then(count);
      if (prop === "query") return (...args: unknown[]) => wrapQuery((value as (...a: unknown[]) => object).apply(target, args));
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ctx: { ...ctx, db } as QueryCtx, documents: () => documents };
}

describe("translated pages (#395)", () => {
  it("answers ?lang= in one read: the language's page, else English with the miss confirmed", async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    type Answer = { kind: string; datasetReleaseId?: string; data?: { page: { locale: string; description: string } }; translation?: unknown };
    const read = (name: string, locale?: string, extra: object = {}) => t.action(api.content.getManByNameAndSection, {
      distro: "debian", name, section: "1", reportRelease: true, ...(locale ? { locale } : {}), ...extra,
    }) as Promise<Answer>;
    const german = await read("tar", "de");
    expect(german.data?.page).toMatchObject({ locale: "de", description: "ein Archivierungsprogramm" });
    expect(german.translation).toEqual({
      state: "translated", locale: "de", englishReleaseId: "debian-en", englishHasRoute: true, englishIndexable: true, languages: ["en", "de", "fr"],
    });
    const germanOnly = await read("nur-de", "de");
    expect(germanOnly.translation).toMatchObject({ state: "translated", englishHasRoute: false, englishIndexable: false, languages: ["de"] });
    // The language lacks the route, or the distro has no release in it: English, with the miss confirmed.
    const fallback = await read("tail", "de");
    expect(fallback.data?.page).toMatchObject({ locale: "en", description: "output the last part of files" });
    expect(fallback.translation).toEqual({ state: "missing", locale: "de", translatedReleaseId: "debian-de" });
    expect((await read("tar", "es")).translation).toEqual({ state: "missing", locale: "es", translatedReleaseId: null });
    expect(await read("nowhere", "de")).toEqual({
      kind: "not_found", datasetReleaseId: "debian-en", translation: { state: "missing", locale: "de", translatedReleaseId: "debian-de" },
    });
    // English reads are unchanged, and a package choice is English's alone.
    const english = await read("tar");
    expect(english.data?.page).toMatchObject({ locale: "en", description: "an archiving utility" });
    expect(english).not.toHaveProperty("translation");
    expect(await read("tar", "de", { pkg: "pkg" })).not.toHaveProperty("translation");
    await expect(read("tar", "pt_BR")).rejects.toThrow("ACTIVE_RELEASE_NOT_FOUND");
  });

  it("reports English and the language's release in one getInfo, and related links as the page resolves", async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    expect(await t.query(api.queries.getInfo, { distro: "debian", locale: "de" }))
      .toMatchObject({ datasetReleaseId: "debian-en", locale: "en", translation: { locale: "de", datasetReleaseId: "debian-de" } });
    expect(await t.query(api.queries.getInfo, { distro: "debian", locale: "ja" })).toMatchObject({ datasetReleaseId: "debian-en", translation: { locale: "ja", datasetReleaseId: null } });
    expect(await t.query(api.queries.getInfo, { distro: "debian" })).not.toHaveProperty("translation");
    expect(await t.query(api.queries.getInfo, { distro: "debian", locale: "xx" })).not.toHaveProperty("translation");
    expect(await t.query(api.queries.getRelated, { distro: "debian", name: "tar", section: "1", locale: "de", reportRelease: true }))
      .toEqual({ items: [], datasetReleaseId: "debian-de" });
    expect(await t.query(api.queries.getRelated, { distro: "debian", name: "tail", section: "1", locale: "de", reportRelease: true }))
      .toEqual({ items: [], datasetReleaseId: "debian-en" });
  });

  it("searches the reader's language first and falls back to English for the rest", async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    const base = { distro: "debian" as const, q: "ta", section: null, limit: 20, offset: 0 };
    const english = await t.query(api.queries.search, base);
    const order = english.results.map((hit) => hit.name);
    expect([...order].sort()).toEqual(["tail", "tar", "tarcat"]);
    expect(english.results.every((hit) => hit.locale === undefined)).toBe(true);
    const german = await t.query(api.queries.search, { ...base, locale: "de" });
    expect(german.results.map((hit) => [hit.name, hit.locale ?? "en"]))
      .toEqual([["tar", "de"], ...order.filter((name) => name !== "tar").map((name) => [name, "en"])]);
    expect(german.results[0].description).toBe("ein Archivierungsprogramm");
    // A language without a release searches English unchanged; unknown codes too.
    expect(await t.query(api.queries.search, { ...base, locale: "ja" })).toEqual(english);
    expect(await t.query(api.queries.search, { ...base, locale: "xx" })).toEqual(english);
    // The first page keeps a slot for English, and later offsets page through English only.
    const first = await t.query(api.queries.search, { ...base, locale: "de", limit: 2 });
    const firstEnglish = order.find((name) => name !== "tar")!;
    expect(first.results.map((hit) => [hit.name, hit.locale ?? "en"])).toEqual([["tar", "de"], [firstEnglish, "en"]]);
    expect(first.hasMore).toBe(true);
    const consumed = order.indexOf(firstEnglish) + 1;
    expect(first.nextOffset).toBe(consumed);
    const rest = await t.query(api.queries.search, { ...base, locale: "de", limit: 20, offset: consumed });
    expect(rest.results.map((hit) => [hit.name, hit.locale ?? "en"]))
      .toEqual(order.slice(consumed).filter((name) => name !== "tar").map((name) => [name, "en"]));
    expect(rest.hasMore).toBe(false);
  });

  it("lists every language version of each translated route for the sitemap", async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    expect(await t.query(api.queries.listTranslationSeoReleases, {})).toEqual({
      items: [
        { distro: "debian", locale: "de", datasetReleaseId: "debian-de", ingestedAt: "2026-10-30T00:00:00Z", pageCount: 2, sitemapPages: 1 },
        { distro: "debian", locale: "fr", datasetReleaseId: "debian-fr", ingestedAt: "2026-10-30T00:00:00Z", pageCount: 2, sitemapPages: 1 },
      ],
    });
    const chunk = await t.query(api.queries.listTranslationSitemapChunk, { distro: "debian", locale: "fr", paginationOpts: { numItems: 50, cursor: null } });
    expect(chunk?.items).toEqual([
      { name: "tail", section: "1", locales: ["en", "fr"], englishIndexable: true },
      { name: "tar", section: "1", locales: ["en", "de", "fr"], englishIndexable: true },
    ]);
    const de = await t.query(api.queries.listTranslationSitemapChunk, { distro: "debian", locale: "de", paginationOpts: { numItems: 50, cursor: null } });
    expect(de?.items[0]).toEqual({ name: "nur-de", section: "1", locales: ["de"], englishIndexable: false });
    expect(chunk?.isDone).toBe(true);
    expect(await t.query(api.queries.listTranslationSitemapChunk, { distro: "debian", locale: "en", paginationOpts: { numItems: 50, cursor: null } })).toBeNull();
    expect(await t.query(api.queries.listTranslationSitemapChunk, { distro: "ubuntu", locale: "de", paginationOpts: { numItems: 50, cursor: null } })).toBeNull();
  });

  it("bounds the documents a translated page and an English fallback read", async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    const measure = (name: string, locale?: string) => t.run(async (ctx) => {
      const counted = countingCtx(ctx);
      const handler = (getManByNameAndSectionReadModel as unknown as { _handler: (ctx: QueryCtx, args: object) => Promise<{ kind: string }> })._handler;
      const result = await handler(counted.ctx, { stage: "prod", distro: "debian", name, section: "1", ...(locale ? { locale } : {}) });
      return { kind: result.kind, documents: counted.documents() };
    });
    const english = await measure("tar");
    const german = await measure("tar", "de");
    const fallback = await measure("tail", "de");
    expect([german.kind, fallback.kind]).toEqual(["page", "page"]);
    // The language set reads one pointer and one lookup per other language; the
    // fallback adds the language's pointer, release and miss to English's read.
    expect(german.documents).toBeLessThanOrEqual(english.documents + 2 * 7);
    expect(fallback.documents).toBeLessThanOrEqual(english.documents + 2);
});

  it("splits a translation of more than 2,000 pages into sitemap pages, one file each", async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    await t.run(async (ctx) => {
      const pointer = (await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "de").eq("distro", "debian")).unique())!;
      for (let i = 0; i < 2101; i++) {
        await ctx.db.insert("manPages", {
          releaseId: pointer.releaseId, datasetReleaseId: pointer.datasetReleaseId, externalId: `bulk-${i}`, locale: "de", distro: "debian",
          name: `bulk${String(i).padStart(5, "0")}`, section: "1", sitemapPage: Math.floor(i / 1000) + 1, title: "x", description: "x",
          sourcePath: "x", contentSha256: `bulk-${i}`, hasParseWarnings: false,
        });
      }
    });
    const releases = await t.query(api.queries.listTranslationSeoReleases, {});
    expect(releases.items.find((item) => item.locale === "de")).toMatchObject({ sitemapPages: 3 });
    const read = async (page: number) => {
      const items = [];
      let cursor: string | null = null;
      for (;;) {
        const chunk: { items: Array<{ name: string }>; isDone: boolean; continueCursor: string } | null = await t.query(api.queries.listTranslationSitemapChunk, { distro: "debian", locale: "de", page, paginationOpts: { numItems: 200, cursor } });
        items.push(...chunk!.items);
        if (chunk!.isDone) return items;
        cursor = chunk!.continueCursor;
      }
    };
    // The two corpus pages sit on page 1 too (sitemapPage 1).
    expect((await read(1)).length).toBe(1002);
    expect((await read(2)).length).toBe(1000);
    expect((await read(3)).map((item) => item.name)).toEqual(["bulk02000", "bulk02001", "bulk02002", "bulk02003", "bulk02004", "bulk02005", "bulk02006", "bulk02007", "bulk02008", "bulk02009", "bulk02010", "bulk02011", "bulk02012", "bulk02013", "bulk02014", "bulk02015", "bulk02016", "bulk02017", "bulk02018", "bulk02019", "bulk02020", "bulk02021", "bulk02022", "bulk02023", "bulk02024", "bulk02025", "bulk02026", "bulk02027", "bulk02028", "bulk02029", "bulk02030", "bulk02031", "bulk02032", "bulk02033", "bulk02034", "bulk02035", "bulk02036", "bulk02037", "bulk02038", "bulk02039", "bulk02040", "bulk02041", "bulk02042", "bulk02043", "bulk02044", "bulk02045", "bulk02046", "bulk02047", "bulk02048", "bulk02049", "bulk02050", "bulk02051", "bulk02052", "bulk02053", "bulk02054", "bulk02055", "bulk02056", "bulk02057", "bulk02058", "bulk02059", "bulk02060", "bulk02061", "bulk02062", "bulk02063", "bulk02064", "bulk02065", "bulk02066", "bulk02067", "bulk02068", "bulk02069", "bulk02070", "bulk02071", "bulk02072", "bulk02073", "bulk02074", "bulk02075", "bulk02076", "bulk02077", "bulk02078", "bulk02079", "bulk02080", "bulk02081", "bulk02082", "bulk02083", "bulk02084", "bulk02085", "bulk02086", "bulk02087", "bulk02088", "bulk02089", "bulk02090", "bulk02091", "bulk02092", "bulk02093", "bulk02094", "bulk02095", "bulk02096", "bulk02097", "bulk02098", "bulk02099", "bulk02100"]);
  });

  it("counts English only when it has the page itself, not an alias", async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    // English has only a `.so` alias named like the German-only page.
    await t.run(async (ctx) => {
      const english = (await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", "debian")).unique())!;
      await ctx.db.insert("manPageAliases", { releaseId: english.releaseId, datasetReleaseId: english.datasetReleaseId, name: "nur-de", section: "1", targetName: "tar", targetSection: "1" });
    });
    const answer = await t.query(internal.content.getManByNameAndSectionReadModel, { stage: "prod", distro: "debian", name: "nur-de", section: "1", locale: "de" });
    expect(answer).toMatchObject({ translation: { state: "translated", englishHasRoute: false, englishIndexable: false, languages: ["de"] } });
    const sitemap = await t.query(api.queries.listTranslationSitemapChunk, { distro: "debian", locale: "de", paginationOpts: { numItems: 50, cursor: null } });
    expect(sitemap?.items.find((item) => item.name === "nur-de")).toEqual({ name: "nur-de", section: "1", locales: ["de"], englishIndexable: false });
  });

  it("resolves a name-only URL in the language first, then English", async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "nur-de", locale: "de" })).toMatchObject({ kind: "page", section: "1", datasetReleaseId: "debian-de" });
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "tail", locale: "de" })).toMatchObject({ kind: "page", section: "1", datasetReleaseId: "debian-en" });
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "nur-de" })).toMatchObject({ kind: "not_found", datasetReleaseId: "debian-en" });
  });
});
