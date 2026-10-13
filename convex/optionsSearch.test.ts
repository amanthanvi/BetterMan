/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { api, internal } from "./_generated/api";
import { deriveOptionsSearchText, matchingOptionAnchor, MAX_OPTIONS_SEARCH_BYTES, optionsIndexQuery, optionsQueryTokens, validateOptionsSearchText } from "./_optionsSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const lsSymbolicOptions = (JSON.parse(readFileSync(resolve("ingestion/tests/fixtures/golden/ls.1.mdoc.json"), "utf8")) as {
  options: Array<{ flags: string; anchorId: string; description: string }>;
}).options.filter((option) => ["-@", "-%"].includes(option.flags));
const options = [
  { flags: "-c, --create", anchorId: "opt-create", description: "Create" },
  { flags: "-C", anchorId: "opt-directory", description: "Directory" },
  { flags: "--foo-bar", anchorId: "opt-foo", description: "bar" },
  { flags: "ForwardAgent", anchorId: "forward-agent", description: "keyword" },
  { flags: "+F", anchorId: "plus-upper", description: "upper" },
  { flags: "+f", anchorId: "plus-lower", description: "lower" },
  ...lsSymbolicOptions,
  { flags: "-?", anchorId: "question", description: "Question flag" },
  { flags: "-#", anchorId: "hash", description: "Hash flag" },
];
afterEach(() => vi.unstubAllEnvs());

it("indexes flags and bare spellings without losing dashes, case, or token boundaries", () => {
  const text = deriveOptionsSearchText(options);
  expect(text).toContain("taf63de4c8601eff2"); // Known FNV-1a vector for "c".
  expect(optionsIndexQuery(["--exclude-vcs-ignores"]).length).toBe(17);
  for (const q of ["--create", "create", "-c", "--create -c"]) {
    expect(matchingOptionAnchor(text, optionsQueryTokens(q))).toBe("opt-create");
  }
  expect(matchingOptionAnchor(text, optionsQueryTokens("-C"))).toBe("opt-directory");
  expect(matchingOptionAnchor(text, optionsQueryTokens("ForwardAgent"))).toBe("forward-agent");
  expect(matchingOptionAnchor(text, optionsQueryTokens("forwardagent"))).toBe("forward-agent");
  expect(matchingOptionAnchor(text, optionsQueryTokens("+F"))).toBe("plus-upper");
  expect(matchingOptionAnchor(text, optionsQueryTokens("+f"))).toBe("plus-lower");
  for (const q of ["--creat", "--foo", "bar", "-c -C", "--foo bar"]) {
    expect(matchingOptionAnchor(text, optionsQueryTokens(q))).toBeUndefined();
  }
});

it("preserves actual ls symbolic flags and produces metadata accepted by the storage validator", () => {
  expect(lsSymbolicOptions.map((option) => [option.flags, option.anchorId])).toEqual([["-@", "@"], ["-%", "_"]]);
  const text = deriveOptionsSearchText(lsSymbolicOptions)!;
  expect(validateOptionsSearchText(text)).toBe(text);
  for (const option of lsSymbolicOptions) {
    expect(matchingOptionAnchor(text, optionsQueryTokens(option.flags))).toBe(option.anchorId);
  }
  expect(optionsQueryTokens("@")).toEqual([]);
  expect(optionsQueryTokens("%")).toEqual([]);
});

it("finds plain OPTIONS keywords and distinguishes plus-flag case through the exact index", async () => {
  const t = convexTest(schema, modules);
  await seed(t, [{ name: "tool", options }]);
  for (const [q, anchorId] of [["ForwardAgent", "forward-agent"], ["forwardagent", "forward-agent"], ["+F", "plus-upper"], ["+f", "plus-lower"], ["-@", "@"], ["-%", "_"], ["-?", "question"], ["-#", "hash"]]) {
    expect((await t.query(api.queries.search, { ...searchArgs, q })).results).toMatchObject([{ name: "tool", match: "option", anchorId }]);
  }
  for (const q of ["+f +F", "agent", "bar"]) {
    expect((await t.query(api.queries.search, { ...searchArgs, q })).results).toEqual([]);
  }
});

it("verifies raw tokens even when an index fingerprint candidate is supplied", () => {
  const text = deriveOptionsSearchText([{ flags: "--exclude-vcs-ignores", anchorId: "opt-long" }]);
  expect(matchingOptionAnchor(text, optionsQueryTokens("--exclude-vcs-ignores"))).toBe("opt-long");
  expect(matchingOptionAnchor(text, optionsQueryTokens("--exclude-vcs"))).toBeUndefined();
  const collisionCandidate = JSON.stringify([["opt-other", ` ${optionsIndexQuery(["--create"])} `, "--other"]]);
  expect(matchingOptionAnchor(collisionCandidate, optionsQueryTokens("--create"))).toBeUndefined();
});

it("caps the complete UTF-8 index and anchor payload, skips oversized entries, and validates at the mutation boundary", () => {
  const text = deriveOptionsSearchText([
    { flags: `--${"x".repeat(2048)}`, anchorId: "too-large" },
    ...Array.from({ length: 300 }, (_, i) => ({ flags: `--flag-${i}`, anchorId: `option-${i}` })),
  ])!;
  expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_OPTIONS_SEARCH_BYTES);
  expect(matchingOptionAnchor(text, optionsQueryTokens("--flag-0"))).toBe("option-0");
  expect(validateOptionsSearchText(text)).toBe(text);
  expect(() => validateOptionsSearchText("x".repeat(2049))).toThrow("OPTIONS_SEARCH_TOO_LARGE");
  expect(() => validateOptionsSearchText('[[""," w6162 "]]')).toThrow("INVALID_OPTIONS_SEARCH");
  expect(deriveOptionsSearchText(null)).toBeUndefined();
});

it("retains actual tar punctuation and duplicate-suffix anchors", () => {
  const tarGolden = JSON.parse(readFileSync(resolve("ingestion/tests/fixtures/golden/tar.1.json"), "utf8")) as { options: typeof options };
  const selected = tarGolden.options.filter((option) => ["no~2", "sort=", "wildcards~2"].includes(option.anchorId));
  expect(selected).toHaveLength(3);
  const text = deriveOptionsSearchText(selected);
  for (const option of selected) {
    const firstFlag = option.flags.match(/-{1,2}[A-Za-z0-9][A-Za-z0-9_.+-]*/)?.[0];
    expect(firstFlag).toBeTruthy();
    expect(matchingOptionAnchor(text, optionsQueryTokens(firstFlag!))).toBe(option.anchorId);
  }
});

type Harness = TestConvex<typeof schema>;
async function seed(t: Harness, rows: Array<{ name: string; description?: string; options?: typeof options; section?: string }>, datasetReleaseId = "search", distro: "debian" | "ubuntu" = "debian") {
  await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId, locale: "en", distro, imageRef: "test", imageDigest: "test", ingestedAt: "2026-10-12", pageCount: rows.length,
    });
    await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro, releaseId, datasetReleaseId, activatedAt: "2026-10-12" });
    for (const row of rows) {
      const section = row.section ?? "1";
      const description = row.description ?? "Archive tool";
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId, externalId: row.name, locale: "en", distro, name: row.name, section, sitemapPage: 1,
        title: row.name, description, sourcePath: row.name, contentSha256: row.name, hasParseWarnings: false,
      });
      await ctx.db.insert("manPageSearchDocuments", {
        pageId, releaseId, datasetReleaseId, name: row.name, nameNorm: row.name, section, title: row.name, description,
        descNorm: description.toLowerCase(), searchText: "", snippetText: description, optionsText: deriveOptionsSearchText(row.options),
      });
    }
  });
}
const searchArgs = { distro: "debian" as const, q: "create", section: null, limit: 50, offset: 0 };

it("ranks options below every name and description hit and preserves legacy rows", async () => {
  const t = convexTest(schema, modules);
  await seed(t, [
    { name: "tar", options }, { name: "create-command", options },
    { name: "dd", description: "Create files", options }, { name: "legacy", description: "Create legacy files" },
  ]);
  const result = await t.query(api.queries.search, searchArgs);
  expect(result.results.map((row) => row.name)).toEqual(["create-command", "dd", "legacy", "tar"]);
  expect(result.results.slice(0, 3).every((row) => !("match" in row))).toBe(true);
  expect(result.results[3]).toMatchObject({ match: "option", anchorId: "opt-create" });
  expect((await t.query(api.queries.search, { ...searchArgs, q: "--create" })).results).toMatchObject([{ name: "tar", match: "option" }, { name: "create-command", match: "option" }, { name: "dd", match: "option" }]);
});

it("reads at most 24 option candidate rows plus the two release rows, with no contents reads", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 26 } });
  await seed(t, Array.from({ length: 60 }, (_, i) => ({ name: `tar${i}`, options })));
  const result = await t.query(api.queries.search, { ...searchArgs, q: "--create" });
  expect(result.results).toHaveLength(24);
  expect(result.results.every((row) => row.match === "option" && row.anchorId === "opt-create")).toBe(true);
});

it("filters option candidates by section and requires exact query tokens", async () => {
  const t = convexTest(schema, modules);
  await seed(t, [{ name: "tar", options }, { name: "other", options, section: "5" }]);
  expect((await t.query(api.queries.search, { ...searchArgs, q: "--create", section: "5" })).results.map((row) => row.name)).toEqual(["other"]);
  expect((await t.query(api.queries.search, { ...searchArgs, q: "--creat" })).results).toEqual([]);
  expect((await t.query(api.queries.search, { ...searchArgs, q: "--foo bar" })).results).toEqual([]);
});

it("uses only option documents from the selected active distro release", async () => {
  const t = convexTest(schema, modules);
  await seed(t, [{ name: "debian-tar", options }]);
  await seed(t, [{ name: "ubuntu-tar", options }], "ubuntu-search", "ubuntu");
  expect((await t.query(api.queries.search, { ...searchArgs, q: "--create" })).results.map((row) => row.name)).toEqual(["debian-tar"]);
  expect((await t.query(api.queries.search, { ...searchArgs, distro: "ubuntu", q: "--create" })).results.map((row) => row.name)).toEqual(["ubuntu-tar"]);
});

it.each(["inline", "storage"])("derives metadata from trusted parsed options on %s ingest, overriding caller text", async (mode) => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test");
  const t = convexTest(schema, modules);
  const release = await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId: mode, locale: "en", distro: "debian", imageRef: "test", imageDigest: "test", ingestedAt: "2026-10-12",
    packageManifest: { packages: [] }, pageCount: 1, aliasCount: 0, licenseCount: 0,
    sectionTotals: [{ section: "1", total: 1 }], licensePackages: [],
  });
  const page = {
    externalId: "tar", name: "tar", section: "1", sitemapPage: 1, title: "tar", description: "Archive tool",
    sourcePath: "tar.1", sourcePackage: null, sourcePackageVersion: null, contentSha256: "tar", hasParseWarnings: false,
    doc: { toc: [], blocks: [] }, synopsis: null, options, seeAlso: null, searchText: "", snippetText: "", links: [],
    optionsText: '[["spoof-anchor"," f2d2d637265617465 "]]',
  };
  if (mode === "inline") await t.mutation(internal.ingest.insertPages, { datasetReleaseId: mode, pages: [page] });
  else {
    const response = await t.fetch("/ingest/pages/storage", {
      method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify({ datasetReleaseId: mode, pages: [page] }),
    });
    expect(response.status).toBe(200);
  }
  const rows = await t.run((ctx) => ctx.db.query("manPageSearchDocuments").take(1));
  expect(rows[0].optionsText).toBe(deriveOptionsSearchText(options));
  expect(rows[0].optionsText).not.toContain("spoof-anchor");
  await t.run((ctx) => ctx.db.insert("activeReleases", {
    stage: "prod", locale: "en", distro: "debian", releaseId: release.releaseId, datasetReleaseId: mode, activatedAt: "2026-10-12",
  }));
  for (const [q, anchorId] of [["ForwardAgent", "forward-agent"], ["+F", "plus-upper"], ["+f", "plus-lower"], ["-@", "@"], ["-%", "_"], ["-?", "question"], ["-#", "hash"]]) {
    expect((await t.query(api.queries.search, { ...searchArgs, q })).results).toMatchObject([{ name: "tar", match: "option", anchorId }]);
  }
});
