/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { syncFlagCandidates } from "./_flagSearch";

const modules = import.meta.glob("./**/*.ts");

type P = { name: string; score?: number; flags?: Array<[string, string, boolean?]>; task?: string; usage?: string[] };

async function world(pages: P[], scoredRelease = true, ready = true) {
  const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 30 } });
  const releaseId = await t.run(async ctx => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "r", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
      ingestedAt: "2026-10-30", pageCount: pages.length, ...(scoredRelease ? { indexablePageCount: pages.length } : {}), ...(ready ? { flagSearchReady: true } : {}),
    });
    await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "r", activatedAt: "2026-10-30" });
    return releaseId;
  });
  // One transaction per page, in the given order: creation order is the tie-breaker.
  for (const p of pages) await t.run(async ctx => {
    const pageId = await ctx.db.insert("manPages", {
      releaseId, datasetReleaseId: "r", externalId: p.name, locale: "en", distro: "debian", name: p.name,
      section: "1", sitemapPage: 1, title: p.name, description: `${p.name} utility`, sourcePath: p.name, contentSha256: p.name,
      hasParseWarnings: false, verifiedFlagUsage: (p.usage ?? []).map(flag => ({ flag, count: 1, source: "tldr" as const })), ...(p.score !== undefined ? { popularityScore: p.score } : {}),
    });
    for (const [flag, text, arg] of p.flags ?? []) await ctx.db.insert("manPageOptionFlags", {
      releaseId, pageId, nameNorm: p.name, section: "1", flag, flags: text, anchorId: flag.replace(/^-+/, ""),
      ...(arg ? { takesArgument: true } : {}),
    });
    await syncFlagCandidates(ctx, (await ctx.db.get(pageId))!);
    if (p.task) await ctx.db.insert("manPageTaskPhrases", {
      releaseId, pageId, contentSha256: p.name, name: p.name, section: "1", title: p.name, description: `${p.name} utility`,
      taskText: p.task, ...(p.score !== undefined ? { popularityScore: p.score } : {}),
    });
  });
  return t;
}
const q = (t: Awaited<ReturnType<typeof world>>, query: string) =>
  t.query(api.queries.search, { distro: "debian", q: query, section: null, limit: 5, offset: 0 });

// Real B4 scores from ingestion/data/popcon-by-inst.tsv.gz: round(1000*log10(1+inst)).
const S = 5470; // tar, dpkg, grep, coreutils, findutils, util-linux, cpio, gzip all round to 5470.
const tar: P = { name: "tar", score: S, usage: ["-x", "-z", "-f"], flags: [["-x", "-x, --extract"], ["-z", "-z, --gzip"], ["-f", "-f, --file", true], ["--extract", "-x, --extract"]] };

describe("review #465 regressions", () => {
  it("A: verified cluster coverage beats a later grep with tied popularity", async () => {
    const t = await world([tar, { name: "grep", score: S, flags: [["-x", "-x, --line-regexp"], ["-z", "-z, --null-data"], ["-f", "-f FILE", true]] }]);
    const r = await q(t, "-xzf");
    expect(r.results[0].name).toBe("tar");
  });

  it("B: tied partial clusters cannot exhaust verified candidate recall", async () => {
    const others = ["ls", "dir", "vdir", "du", "df", "xargs"].map(name => ({ name, score: S, flags: [["-x", "-x"] as [string, string]] }));
    const t = await world([tar, ...others]);
    const r = await q(t, "-xzf");
    expect(r.results[0].name).toBe("tar");
  });

  it("C: verified alias usage beats a later dpkg with tied popularity", async () => {
    const t = await world([tar, { name: "dpkg", score: S, flags: [["--extract", "-x, --extract"]] }]);
    const r = await q(t, "--extract");
    expect(r.results[0].name).toBe("tar");
  });

  it("D: scored releases without completed flag backfill keep deterministic name order", async () => {
    const t = await world([
      { name: "bsdtar", score: 4000, flags: [["--extract", "-x"]] },
      { name: "cpio", score: S, flags: [["--extract", "-i, --extract"]] },
      tar,
      { name: "zzunpack", score: 10, flags: [["--extract", "-x"]] },
    ], true, false);
    const r = await q(t, "--extract");
    expect(r.results[0].name).toBe("bsdtar");
  });

  it("E: lexical task evidence precedes popularity", async () => {
    const t = await world([
      { name: "convert", score: 4900, task: "convert an image to png" },
      { name: "dd", score: S, task: "convert and copy a file" },
    ]);
    const r = await q(t, "convert an image to png");
    expect(r.results[0].name).toBe("convert");
  });

  it("F: unscored production shapes may legitimately miss seed ranking expectations", async () => {
    const t = await world([
      { name: "dpkg", flags: [["--extract", "-x, --extract"], ["-x", "-x, --extract"]] },
      { name: "instmodsh", task: "create tarball from installed module" },
      { name: "ptar", task: "extract a tar archive" },
      ...["bash", "df", "dir", "du", "grep", "ls"].map(name => ({ name, flags: [["-x", "-x"] as [string, string]] })),
      { ...tar, score: undefined, usage: [], task: "create a tar archive\nextract files from an archive" },
    ], false);
    const out: Record<string, string | undefined> = {};
    for (const query of ["how do I extract a tarball", "extract a tar archive", "extract tarball", "--extract", "-xzf"]) out[query] = (await q(t, query)).results[0]?.name;
    expect(Object.values(out).filter(n => n !== "tar").length).toBeGreaterThan(0);
  });
});

it("keeps original tarball vocabulary and rejects unrelated target prefixes", async () => {
  const t = await world([{ name: "unpack", task: "inspect a tarball" }, { name: "aim", task: "find a target" }]);
  expect((await q(t, "how to inspect a tarball")).results[0]).toMatchObject({ name: "unpack", taskPhrase: "inspect a tarball" });
  expect((await q(t, "how to tar")).results).toEqual([]);
});

it("updates and removes verified aliases atomically when B7 usage changes", async () => {
  const t = await world([tar, { name: "dpkg", score: S, flags: [["--extract", "-x, --extract"]] }]);
  expect((await q(t, "--extract")).results[0].name).toBe("tar");
  await t.run(async ctx => {
    const page = (await ctx.db.query("manPages").take(3)).find(p => p.name === "tar")!;
    const next = { ...page, verifiedFlagUsage: [] };
    await ctx.db.patch(page._id, { verifiedFlagUsage: [] });
    await syncFlagCandidates(ctx, next, page);
  });
  expect((await q(t, "--extract")).results[0].name).toBe("dpkg");
});
