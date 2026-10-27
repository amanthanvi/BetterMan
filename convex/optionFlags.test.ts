/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { api, internal } from "./_generated/api";
import { flagTakesArgument, MAX_OPTION_FLAG_ROWS_PER_PAGE, optionFlagRows, parseOptionQuery } from "./_optionFlags";
import { nameEditDistance } from "./_searchTypos";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
type Option = { flags: string; anchorId: string; argument?: string | null; description?: string };

const tarGolden = JSON.parse(readFileSync(resolve("ingestion/tests/fixtures/golden/tar.1.json"), "utf8")) as {
  options: Option[];
};
const curlGolden = JSON.parse(readFileSync(resolve("ingestion/tests/fixtures/golden/curl-options.1.json"), "utf8")) as {
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
    expect(rows).toHaveLength(215);
    expect(new Set(rows.map((row) => row.anchorId)).size).toBe(tarGolden.options.length);
    const byFlag = new Map(rows.map((row) => [row.flag, row]));
    expect(byFlag.get("-c")?.anchorId).toBe("c");
    expect(byFlag.get("--create")?.anchorId).toBe("c");
    for (const flag of ["-x", "--extract", "--get"]) {
      expect(byFlag.get(flag)?.anchorId).toBe("x");
    }
    expect(byFlag.get("-g")).toMatchObject({ anchorId: "g", flags: "-g, --listed-incremental" });
    expect(byFlag.get("--listed-incremental")).toMatchObject({ anchorId: "g" });
    expect(byFlag.get("--sort")?.anchorId).toBe("sort=");
    expect(byFlag.get("--no-seek")?.anchorId).toBe("no~2");
    expect(byFlag.get("--pax-option")?.anchorId).toBe("pax~2");
    expect(byFlag.get("--info-script")?.anchorId).toBe(byFlag.get("--new-volume-script")?.anchorId);
    expect(byFlag.has("listed-incremental")).toBe(false);
  });

  it("gives curl -1 to --tlsv1 instead of the nested --range example", () => {
    const rows = optionFlagRows(curlGolden.options);
    expect(rows.find((row) => row.flag === "-1")).toMatchObject({
      anchorId: "def-1-tlsv1", flags: "-1, --tlsv1",
    });
    expect(rows.some((row) => row.anchorId === "def-0-0-1")).toBe(false);
  });

  it("indexes corrected inline argument boundaries without inventing joined flag keys", () => {
    const fixture = JSON.parse(readFileSync(resolve("ingestion/tests/fixtures/golden/parser-text-fidelity.1.json"), "utf8")) as { options: Option[] };
    const rows = optionFlagRows(fixture.options);
    for (const flag of ["-f", "-t", "--format"]) {
      expect(rows.find((row) => row.flag === flag)).toMatchObject({ flag, takesArgument: true });
    }
    expect(rows.some((row) => ["-fARCHIVE", "-tformat"].includes(row.flag))).toBe(false);
    expect(rows.find((row) => row.flag === "-n10")).toMatchObject({ flag: "-n10" });
    expect(rows.find((row) => row.flag === "-n10")?.takesArgument).toBeUndefined();
    const strings = JSON.parse(readFileSync(resolve("ingestion/tests/fixtures/golden/strings-mixed-peers.1.json"), "utf8")) as { options: Option[] };
    expect(optionFlagRows(strings.options).find((row) => row.flag === "-t"))
      .toMatchObject({ flags: "-t", anchorId: "t", takesArgument: true });
    expect(optionFlagRows(tarGolden.options).find((row) => row.flag === "-f"))
      .toMatchObject({ anchorId: "f", takesArgument: true });
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
  { flags: "-x, --extract", anchorId: "opt-extract" },
  { flags: "-z, --gzip", anchorId: "opt-gzip" },
  { flags: "-f, --file", anchorId: "opt-file" },
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
  it("uses golden argument metadata and stops before attached argument letters", async () => {
    const t = await seeded([page("tar", tarGolden.options), page("mysql", [
      { flags: "-u, --user=USER", anchorId: "user" },
      ...["r", "o", "t"].map((letter) => ({ flags: `-${letter}`, anchorId: letter })),
    ])], 66);
    expect((await search(t, "tar -xzf")).results[0]).toMatchObject({
      anchorId: "x", highlights: ["-x, --extract, --get", "-z, --gzip, --gunzip, --ungzip", "-f, --file"],
    });
    expect((await search(t, "tar -Cfoo")).results[0]).toMatchObject({ anchorId: "C", highlights: ["-C, --directory"] });
    expect((await search(t, "tar -gf")).results[0]).toMatchObject({ anchorId: "g", highlights: ["-g, --listed-incremental"] });
    expect((await search(t, "mysql -uroot")).results[0]).toMatchObject({ anchorId: "user", highlights: ["-u, --user=USER"] });
    const rows = await t.run(async (ctx) => {
      const release = await ctx.db.query("datasetReleases").first();
      return await Promise.all(["-f", "-C", "-u"].map((flag) => ctx.db.query("manPageOptionFlags")
        .withIndex("by_releaseId_and_flag_and_nameNorm", (q) => q.eq("releaseId", release!._id).eq("flag", flag)).first()));
    });
    expect(rows[0]).toMatchObject({ takesArgument: true });
    expect(rows[1]).toMatchObject({ takesArgument: true });
    // Older rows have only flags text; argument syntax still stops the cluster.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("manPageOptionFlags").withIndex("by_releaseId_and_flag_and_nameNorm", (q) => q
        .eq("releaseId", rows[0]!.releaseId).eq("flag", "-u")).first();
      await ctx.db.patch(row!._id, { takesArgument: undefined });
    });
    expect((await search(t, "mysql -uroot")).results[0].highlights).toEqual(["-u, --user=USER"]);
    for (const flags of ["-u USER", "-n N", "-u <user>", "-u, --user=USER", "-ePATTERNS"]) expect(flagTakesArgument(flags)).toBe(true);
    expect(flagTakesArgument("-fPIC")).toBe(false);
  });

  it("groups section-8 clusters by page and preserves real flag command prefixes", async () => {
    const flags = (letters: string) => [...letters].map((letter) => ({ flags: `-${letter}`, anchorId: letter }));
    const t = await seeded([
      page("iptables", flags("nvL"), { section: "8" }),
      page("ss", flags("tlnp"), { section: "8" }),
      page("netstat", flags("tulpn"), { section: "8" }),
      page("ip", [{ flags: "-br, -brief", anchorId: "brief" }], { section: "8" }),
      page("find", [{ flags: "-name", anchorId: "name", argument: "PATTERN" }]),
      page("mixed", flags("n")), page("mixed", flags("v"), { section: "8" }),
    ], 66);
    for (const [name, cluster] of [["iptables", "nvL"], ["ss", "tlnp"], ["netstat", "tulpn"]]) {
      expect((await search(t, `${name} -${cluster}`)).results).toEqual([expect.objectContaining({
        name, section: "8", highlights: [...cluster].map((letter) => `-${letter}`),
      })]);
      expect((await search(t, `${name} -${cluster}`, "1")).results).toEqual([]);
    }
    expect((await search(t, "ip -br")).results[0]).toMatchObject({ name: "ip", section: "8", anchorId: "brief" });
    for (const q of ["find -name", "fin -name"]) expect((await search(t, q)).results[0], q).toMatchObject({ name: "find", anchorId: "name" });
    expect((await search(t, "mixed -nv")).results.every((hit) => hit.match !== "option")).toBe(true);
  });

  it("keeps the longest cluster miss and deepest name fallback within 303 reads", async () => {
    const flags = [..."abcdefg"].map((letter) => ({ flags: `-${letter}`, anchorId: letter }));
    const t = await seeded(["1", "5", "8"].map((section) => page("tool", flags, { section })), 303);
    await t.run(async (ctx) => {
      const source = await ctx.db.query("manPageSearchDocuments").first();
      const { _id, _creationTime, ...fields } = source!;
      void _id; void _creationTime;
      for (let i = 0; i < 300; i += 1) {
        const name = `tool${String(i).padStart(3, "0")}`;
        await ctx.db.insert("manPageSearchDocuments", { ...fields, name, nameNorm: name });
      }
    });
    const result = await t.query(api.queries.search, { distro: "debian", q: "tool -abcdefgh", section: null, limit: 50, offset: 200 });
    expect(result.results.every((hit) => hit.match !== "option")).toBe(true);
  });

  it("splits missing short clusters, keeps real multi-letter flags, and links the first option", async () => {
    const t = await seeded([
      page("tar", tarOptions),
      page("gcc", [
        { flags: "-fPIC", anchorId: "pic" },
        { flags: "-f", anchorId: "f" }, { flags: "-P", anchorId: "p" },
        { flags: "-I", anchorId: "i" }, { flags: "-C", anchorId: "c" },
      ]),
      page("cp", [{ flags: "-R, --recursive", anchorId: "recursive" }]),
      page("tarsnap", [{ flags: "-xzf", anchorId: "compound" }]),
    ], 66);
    expect((await search(t, "tar -xzf")).results).toEqual([expect.objectContaining({
      name: "tar", section: "1", match: "option", anchorId: "opt-extract",
      highlights: ["-x, --extract", "-z, --gzip", "-f, --file"],
    })]);
    expect((await search(t, "gcc -fPIC")).results).toEqual([expect.objectContaining({ anchorId: "pic", highlights: ["-fPIC"] })]);
    expect((await search(t, "cp -R")).results).toEqual([expect.objectContaining({ name: "cp", anchorId: "recursive" })]);
    expect((await search(t, "tar --gzip")).results).toEqual([expect.objectContaining({ name: "tar", anchorId: "opt-gzip" })]);
    expect((await search(t, "tar -xzQ")).results[0]).not.toHaveProperty("match");
    expect((await search(t, "tar -xzf", "5")).results).toEqual([]);
  });

  it("derives rows from the stored-payload upload without an ingestion change", async () => {
    const t = await seeded([page("tar", tarOptions), page("cp", null)]);
    const rows = await t.run((ctx) => ctx.db.query("manPageOptionFlags").take(20));
    expect(rows.map((row) => [row.nameNorm, row.flag, row.anchorId])).toEqual([
      ["tar", "-c", "opt-create"], ["tar", "--create", "opt-create"],
      ["tar", "-x", "opt-extract"], ["tar", "--extract", "opt-extract"],
      ["tar", "-z", "opt-gzip"], ["tar", "--gzip", "opt-gzip"],
      ["tar", "-f", "opt-file"], ["tar", "--file", "opt-file"],
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
    const rows = await t.run((ctx) => ctx.db.query("manPageOptionFlags").take(20));
    expect(rows.map((row) => row.flag)).toEqual(["-c", "--create", "-x", "--extract", "-z", "--gzip", "-f", "--file", "-C", "--directory", "--version"]);
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
    // Without option rows, a named lookup still finds the page without an anchor.
    expect((await search(t, "--create")).results).toEqual([]);
    expect((await search(t, "tar --create")).results.map((hit) => [hit.name, hit.match])).toEqual([["tar", undefined]]);
  });
});

describe("search correctness", () => {
  it("retains realistic description recall for multi-word queries", async () => {
    const t = await seeded([
      page("du", null, { description: "estimate file space usage" }),
      page("df", null, { description: "report file system disk space usage" }),
      page("fdisk", null, { description: "manipulate disk partition table" }),
      page("git-log", null, { description: "Show commit logs" }),
      page("chmod", null, { description: "change file mode bits" }),
      page("rm", null, { description: "remove files or directories" }),
      page("ls", null, { description: "list directory contents" }),
      page("true", null, { description: "do nothing, successfully" }),
    ], 66);
    for (const [q, names] of [
      ["disk usage", ["du", "df", "fdisk"]], ["git log", ["git-log"]],
      ["change file permissions", ["chmod"]], ["remove a file", ["rm"]], ["list files", ["ls"]],
    ] as const) {
      const result = await search(t, q);
      expect(result.results.map((hit) => hit.name), q).toEqual(expect.arrayContaining([...names]));
      expect(result.results.map((hit) => hit.name), q).not.toContain("true");
      expect(result.suggestions).toEqual([]);
    }
  });

  it("falls back from citation sections to suffixed sections, preferring exact sections", async () => {
    const t = await seeded([
      page("openssl", null, { section: "1ssl" }), page("file::spec", null, { section: "3perl" }),
      page("printf", null, { section: "3" }), page("printf", null, { section: "3p" }),
      page("stdint.h", null, { section: "0p" }),
    ], 66);
    for (const [q, name, section] of [
      ["openssl(1)", "openssl", "1ssl"], ["File::Spec(3)", "file::spec", "3perl"],
      ["stdint.h(0p)", "stdint.h", "0p"], ["printf(3p)", "printf", "3p"], ["printf(3)", "printf", "3"],
    ]) expect((await search(t, q)).results[0], q).toMatchObject({ name, section });
    expect((await search(t, "printf(3)")).results.map((hit) => hit.section)).toEqual(["3"]);
    expect((await search(t, "openssl(2)")).results).toEqual([]);
  });

  it("finds citation aliases such as Linux man(7) without losing their URL", async () => {
    const t = await seeded([page("groff_man", null, { section: "7" })], 66);
    await t.run(async (ctx) => {
      const release = await ctx.db.query("datasetReleases").first();
      await ctx.db.insert("manPageAliases", {
        releaseId: release!._id, datasetReleaseId: "options", name: "man", section: "7",
        targetName: "groff_man", targetSection: "7",
      });
    });
    expect((await search(t, "man(7)")).results[0]).toMatchObject({ name: "man", section: "7", title: "man(7)" });
  });

  it("treats citations as a name and section, ahead of other prefix matches", async () => {
    const t = await seeded([
      page("open", null, { section: "1" }), page("open", null, { section: "2" }),
      page("openat", null, { section: "2" }),
      page("printf", null, { section: "1" }), page("printf", null, { section: "3" }),
      page("man", null, { section: "1" }), page("man", null, { section: "7" }),
    ], 66);
    for (const [q, name, section] of [["open(2)", "open", "2"], ["printf(3)", "printf", "3"], ["man(7)", "man", "7"]]) {
      const result = await search(t, q);
      expect(result.results[0], q).toMatchObject({ name, section });
      expect(result.results.every((hit) => hit.section === section)).toBe(true);
      expect(result.suggestions).toEqual([]);
    }
    expect((await search(t, "OPEN(2)", "1")).results[0]).toMatchObject({ name: "open", section: "2" });
  });

  it("corrects transpositions, insertions, deletions and substitutions only after zero ordinary hits", async () => {
    const t = await seeded([
      page("grep", null), page("chmod", null), page("tar", null), page("tarsnap", null),
      page("git", null), page("echo", null), page("cat", null),
      page("cp", null, { description: "copy files and directories" }),
    ], 66);
    for (const [q, expected] of [["grpe", "grep"], ["chmdo", "chmod"], ["greep", "grep"], ["grp", "grep"], ["grap", "grep"], ["tarr", "tar"], ["gti", "git"], ["ehco", "echo"], ["cta", "cat"], ["rgep", "grep"]]) {
      const result = await search(t, q);
      expect(result.suggestions, q).toContain(expected);
      expect(result.results[0], q).toMatchObject({ name: expected });
      expect(result.correctedQuery, q).toBe(expected);
    }
    expect((await search(t, "tar")).suggestions).toEqual([]);
    expect((await search(t, "copy files")).suggestions).toEqual([]);
    expect((await search(t, "copy files")).results[0]).toMatchObject({ name: "cp" });
    expect((await search(t, "grpe", "3")).suggestions).toEqual([]);
    expect((await search(t, "totallyunrelated")).results).toEqual([]);
    expect((await search(t, "--grpe")).suggestions).toEqual([]);
  });

  it("does not turn unsupported questions into true(1) or spelling suggestions", async () => {
    const t = await seeded([
      page("true", null, { description: "do nothing, successfully" }),
      page("tar", null, { description: "an archiving utility" }),
    ], 66);
    const result = await search(t, "how do I extract a tarball");
    expect(result.results).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it("caps typo candidates at 64 indexed rows even in a dense name bucket", async () => {
    const t = await seeded([page("grep", null)], 66);
    await t.run(async (ctx) => {
      const source = await ctx.db.query("manPageSearchDocuments").first();
      const { _id, _creationTime, ...fields } = source!;
      void _id; void _creationTime;
      for (let i = 0; i < 100; i += 1) {
        const name = `g${String(i).padStart(4, "0")}`;
        await ctx.db.insert("manPageSearchDocuments", { ...fields, name, nameNorm: name });
      }
    });
    // Zero ordinary hits + 2 release rows + at most 64 typo candidates.
    const result = await search(t, "g000o");
    expect(result.results[0]).toMatchObject({ name: "g0000" });
    expect(result.suggestions).toContain("g0000");
    expect(result.results.every((hit) => hit.name <= "g0063")).toBe(true);
    // Unrelated g* names cannot crowd grep out of its gr* bucket.
    expect((await search(t, "grpe")).results[0]).toMatchObject({ name: "grep" });
  });

  it("finds a crowded dotted-name typo in a focused bucket within 66 reads", async () => {
    const t = await seeded([page("systemd.service", null)], 66);
    await t.run(async (ctx) => {
      const source = await ctx.db.query("manPageSearchDocuments").first();
      const { _id, _creationTime, ...fields } = source!;
      void _id; void _creationTime;
      for (let i = 0; i < 150; i += 1) {
        const name = `systemd-${i}`;
        await ctx.db.insert("manPageSearchDocuments", { ...fields, name, nameNorm: name });
      }
    });
    const result = await search(t, "systemd.servcie");
    expect(result.results[0]).toMatchObject({ name: "systemd.service" });
    expect(result.correctedQuery).toBe("systemd.service");
  });

  it("counts adjacent transpositions as one edit and rejects distant names", () => {
    expect(nameEditDistance("grpe", "grep")).toBe(1);
    expect(nameEditDistance("chmdo", "chmod")).toBe(1);
    expect(nameEditDistance("grep", "grep")).toBe(0);
    expect(nameEditDistance("grep", "green")).toBe(2);
    expect(nameEditDistance("chca", "chabc")).toBe(2);
    expect(nameEditDistance("chabc", "chca")).toBe(2);
    expect(nameEditDistance("grep", "chmod")).toBeGreaterThan(2);
  });
});
