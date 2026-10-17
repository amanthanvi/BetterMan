/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { api, internal } from "./_generated/api";
import { MAX_OPTION_FLAG_ROWS_PER_PAGE, optionFlagRows, parseOptionQuery } from "./_optionFlags";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
type Option = { flags: string; anchorId: string; argument?: string | null; description?: string };

const tarGolden = JSON.parse(readFileSync(resolve("ingestion/tests/fixtures/golden/tar.1.json"), "utf8")) as {
  options: Option[];
};

beforeEach(() => vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

function keys(options: Option[]): string[] {
  return optionFlagRows(options).map((row) => row.flag);
}

describe("option flag derivation", () => {
  it("indexes every tar(1) option by each of its flags, keeping anchors with ~ and =", () => {
    const rows = optionFlagRows(tarGolden.options);
    expect(rows).toHaveLength(124);
    expect(new Set(rows.map((row) => row.anchorId)).size).toBe(tarGolden.options.length);
    const byFlag = new Map(rows.map((row) => [row.flag, row]));
    expect(byFlag.get("-g")).toMatchObject({ anchorId: "g", flags: "-g, --listed-incremental" });
    expect(byFlag.get("--listed-incremental")).toMatchObject({ anchorId: "g" });
    expect(byFlag.get("--sort")?.anchorId).toBe("sort=");
    expect(byFlag.get("--no-seek")?.anchorId).toBe("no~2");
    expect(byFlag.get("--pax-option")?.anchorId).toBe("pax~2");
    expect(byFlag.get("--info-script")?.anchorId).toBe(byFlag.get("--new-volume-script")?.anchorId);
    expect(byFlag.has("listed-incremental")).toBe(false);
  });

  it("keeps only real flags and splits attached placeholders", () => {
    expect(keys([{ flags: "--color[=WHEN], --colour", anchorId: "color" }])).toEqual(["--color", "--colour"]);
    expect(keys([{ flags: "--[no-]color, -[no]x", anchorId: "color" }])).toEqual(["--color", "--no-color", "-x", "-nox"]);
    expect(keys([{ flags: "-ePATTERNS, --regexp", anchorId: "e" }])).toEqual(["-e", "--regexp"]);
    expect(keys([{ flags: "-CNUM, -NUM, --context", anchorId: "C" }])).toEqual(["-C", "-NUM", "--context"]);
    expect(keys([{ flags: "-fPIC, -Idir", anchorId: "f" }])).toEqual(["-fPIC", "-Idir"]);
    expect(keys([{ flags: "--ipv4, -4 or --ipv6, -6", anchorId: "ipv4" }])).toEqual(["--ipv4", "-4", "--ipv6", "-6"]);
    expect(keys([{ flags: "--foo/--no-foo, -e/--regexp", anchorId: "foo" }])).toEqual(["--foo", "--no-foo", "-e", "--regexp"]);
    expect(keys([{ flags: "--all; -c. --create:", anchorId: "all" }])).toEqual(["--all", "-c", "--create"]);
    expect(keys([{ flags: "-V, --version", anchorId: "V" }])).toEqual(["-V", "--version"]);
    expect(keys([{ flags: "ForwardAgent", anchorId: "ForwardAgent" }, { flags: "FILE", anchorId: "file" }])).toEqual([]);
    expect(keys([{ flags: "-<num>", anchorId: "num" }])).toEqual([]);
    expect(keys([{ flags: "--", anchorId: "def" }, { flags: "[-+]O [shopt_option]", anchorId: "o" }])).toEqual([]);
    expect(keys([{ flags: "-c", anchorId: "c" }, { flags: "-C", anchorId: "C" }])).toEqual(["-c", "-C"]);
    expect(optionFlagRows([{ flags: "--address", anchorId: "first" }, { flags: "--address", anchorId: "second" }]))
      .toEqual([{ flag: "--address", anchorId: "first", flags: "--address" }]);
    expect(optionFlagRows(null)).toEqual([]);
    const many = Array.from({ length: 500 }, (_, i) => ({ flags: `--flag-${i}`, anchorId: `flag-${i}` }));
    expect(optionFlagRows(many)).toHaveLength(MAX_OPTION_FLAG_ROWS_PER_PAGE);
  });

  it("splits a query into flag keys and words", () => {
    expect(parseOptionQuery("tar --create")).toEqual({ flags: ["--create"], words: ["tar"] });
    expect(parseOptionQuery("--sort=name -c -c")).toEqual({ flags: ["--sort", "-c"], words: [] });
    expect(parseOptionQuery("--create, tar")).toEqual({ flags: ["--create"], words: ["tar"] });
    expect(parseOptionQuery("copy files - --")).toEqual({ flags: [], words: ["copy", "files", "-", "--"] });
  });
});

function page(name: string, options: Option[] | null, overrides: Partial<{ section: string; description: string }> = {}) {
  const section = overrides.section ?? "1";
  const description = overrides.description ?? `${name} description`;
  return {
    externalId: `${name}:${section}`, name, section, sitemapPage: 1, title: `${name}(${section})`, description,
    sourcePath: `${name}.${section}`, sourcePackage: null, sourcePackageVersion: null,
    contentSha256: `${name}-${section}`, hasParseWarnings: false,
    doc: { toc: [], blocks: [] }, synopsis: null, options, seeAlso: null,
    searchText: description, snippetText: description, links: [],
  };
}

const tarOptions: Option[] = [
  { flags: "-c, --create", anchorId: "opt-create", description: "Create a new archive." },
  { flags: "-C, --directory=DIR", anchorId: "opt-directory", description: "Change to DIR." },
  { flags: "--version", anchorId: "opt-version", description: "Print version." },
];

async function seeded(pages: Array<ReturnType<typeof page>>, documentsRead?: number) {
  const t = convexTest({ schema, modules, transactionLimits: documentsRead === undefined ? false : { documentsRead } });
  const sections = new Map<string, number>();
  for (const item of pages) sections.set(item.section, (sections.get(item.section) ?? 0) + 1);
  const release = await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId: "options", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-10-17T00:00:00Z", packageManifest: { packages: [] },
    pageCount: pages.length, aliasCount: 0, licenseCount: 0,
    sectionTotals: [...sections].map(([section, total]) => ({ section, total })), licensePackages: [],
  });
  const response = await t.fetch("/ingest/pages/storage", {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ datasetReleaseId: "options", pages }),
  });
  expect(response.status).toBe(200);
  await t.run((ctx) => ctx.db.insert("activeReleases", {
    stage: "prod", locale: "en", distro: "debian", releaseId: release.releaseId,
    datasetReleaseId: "options", activatedAt: "2026-10-17T00:00:00Z",
  }));
  return t;
}

function search(t: Harness, q: string, section: string | null = null) {
  return t.query(api.queries.search, { distro: "debian", q, section, limit: 20, offset: 0 });
}

describe("option search", () => {
  it("derives rows from the stored-payload upload without an ingestion change", async () => {
    const t = await seeded([page("tar", tarOptions), page("cp", null)]);
    const rows = await t.run((ctx) => ctx.db.query("manPageOptionFlags").take(10));
    expect(rows.map((row) => [row.nameNorm, row.flag, row.anchorId])).toEqual([
      ["tar", "-c", "opt-create"], ["tar", "--create", "opt-create"],
      ["tar", "-C", "opt-directory"], ["tar", "--directory", "opt-directory"],
      ["tar", "--version", "opt-version"],
    ]);
  });

  it("derives the same rows through the legacy inline page mutation", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ingest.createRelease, {
      datasetReleaseId: "legacy", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
      ingestedAt: "2026-10-17T00:00:00Z", packageManifest: { packages: [] },
      pageCount: 1, aliasCount: 0, licenseCount: 0, sectionTotals: [{ section: "1", total: 1 }], licensePackages: [],
    });
    await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "legacy", pages: [page("tar", tarOptions)] });
    const rows = await t.run((ctx) => ctx.db.query("manPageOptionFlags").take(10));
    expect(rows.map((row) => row.flag)).toEqual(["-c", "--create", "-C", "--directory", "--version"]);
  });

  it("finds pages by flag, by name plus flag in either order, and links the option anchor", async () => {
    const t = await seeded([page("tar", tarOptions), page("cp", null), page("tarsnap", [{ flags: "-c", anchorId: "c" }])]);
    const expected = {
      name: "tar", section: "1", description: "tar description", highlights: ["-c, --create"], match: "option", anchorId: "opt-create",
    };
    for (const q of ["--create", "tar --create", "--create tar"]) {
      const result = await search(t, q);
      expect(result.results, q).toEqual([expect.objectContaining(expected)]);
      expect(result.suggestions, q).toEqual([]);
      expect(result.hasMore).toBe(false);
    }
    // The name scopes by prefix, so tarsnap follows tar.
    for (const q of ["-c", "tar -c", "-c tar"]) {
      const result = await search(t, q);
      expect(result.results.map((hit) => [hit.name, hit.anchorId]), q).toEqual([["tar", "opt-create"], ["tarsnap", "c"]]);
    }
    // Several flags cannot be answered from one index range; they stay a text query.
    for (const q of ["-c -C", "tar -c -C"]) {
      expect((await search(t, q)).results.map((hit) => hit.match), q).not.toContain("option");
    }
  });

  it("keeps short flags case-sensitive, retries a long flag in lowercase, and never matches a bare spelling", async () => {
    const t = await seeded([page("tar", tarOptions), page("version", null, { description: "print a version" })]);
    expect((await search(t, "-C")).results).toEqual([expect.objectContaining({ anchorId: "opt-directory" })]);
    expect((await search(t, "--directory=/tmp")).results).toEqual([expect.objectContaining({ anchorId: "opt-directory" })]);
    expect((await search(t, "--Create")).results).toEqual([expect.objectContaining({ anchorId: "opt-create" })]);
    expect((await search(t, "tar --CREATE")).results).toEqual([expect.objectContaining({ anchorId: "opt-create" })]);
    const words = await search(t, "version");
    expect(words.results.map((hit) => [hit.name, hit.match])).toEqual([["version", undefined]]);
    expect((await search(t, "create")).results).toEqual([]);
  });

  it("falls back to the name when no page defines the flag, and respects the section filter", async () => {
    const t = await seeded([page("tar", tarOptions), page("tar", [{ flags: "-c", anchorId: "c5" }], { section: "5" })]);
    expect((await search(t, "tar --bogus")).results.map((hit) => [hit.name, hit.section, hit.match])).toEqual([
      ["tar", "1", undefined], ["tar", "5", undefined],
    ]);
    expect((await search(t, "--bogus")).results).toEqual([]);
    expect((await search(t, "-c", "5")).results).toEqual([expect.objectContaining({ section: "5", anchorId: "c5" })]);
    expect((await search(t, "--create", "5")).results).toEqual([]);
  });

  it("pages through every match reading only offset + limit + 1 rows and the visible pages", async () => {
    // 2 release rows + 21 option rows + 20 pages on the first page; 2 + 31 + 10 on the second.
    const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 43 } });
    await t.run(async (ctx) => {
      const releaseId = await ctx.db.insert("datasetReleases", {
        datasetReleaseId: "budget", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
        ingestedAt: "2026-10-17T00:00:00Z", pageCount: 30,
      });
      await ctx.db.insert("activeReleases", {
        stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "budget", activatedAt: "2026-10-17T00:00:00Z",
      });
      for (let i = 0; i < 30; i += 1) {
        const name = `tool${String(i).padStart(2, "0")}`;
        const pageId = await ctx.db.insert("manPages", {
          releaseId, datasetReleaseId: "budget", externalId: name, locale: "en", distro: "debian", name, section: "1",
          sitemapPage: 1, title: name, description: name, sourcePath: name, contentSha256: name, hasParseWarnings: false,
        });
        await ctx.db.insert("manPageOptionFlags", {
          releaseId, pageId, nameNorm: name, section: "1", flag: "--create", anchorId: "create", flags: "--create",
        });
      }
    });
    const first = await search(t, "--create");
    expect(first.results).toHaveLength(20);
    expect(first).toMatchObject({ hasMore: true, nextOffset: 20 });
    expect(first.results[0]).toMatchObject({ name: "tool00", anchorId: "create" });
    const second = await t.query(api.queries.search, { distro: "debian", q: "--create", section: null, limit: 20, offset: 20 });
    expect(second.results.map((hit) => hit.name)).toEqual(Array.from({ length: 10 }, (_, i) => `tool${20 + i}`));
    expect(second).toMatchObject({ hasMore: false, nextOffset: null });
  });

  it("keeps the text search for a release ingested before the index existed", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const releaseId = await ctx.db.insert("datasetReleases", {
        datasetReleaseId: "old", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
        ingestedAt: "2026-01-01T00:00:00Z", pageCount: 1,
      });
      await ctx.db.insert("activeReleases", {
        stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "old", activatedAt: "2026-01-01T00:00:00Z",
      });
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId: "old", externalId: "tar:1", locale: "en", distro: "debian", name: "tar", section: "1",
        sitemapPage: 1, title: "tar(1)", description: "the tar archiver", sourcePath: "tar.1", contentSha256: "tar", hasParseWarnings: false,
      });
      await ctx.db.insert("manPageSearchDocuments", {
        pageId, releaseId, datasetReleaseId: "old", name: "tar", nameNorm: "tar", section: "1", title: "tar(1)",
        description: "the tar archiver", descNorm: "the tar archiver", searchText: "tar", snippetText: "the tar archiver",
      });
    });
    // The whole query goes to the name and description search, as before this index.
    expect((await search(t, "--create")).results).toEqual([]);
    expect((await search(t, "tar --create")).results.map((hit) => [hit.name, hit.match])).toEqual([["tar", undefined]]);
  });
});
