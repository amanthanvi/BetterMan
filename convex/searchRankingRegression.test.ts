/// <reference types="vite/client" />
// Golden search and refresh regressions, including independent review counterexamples.
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { syncFlagCandidates } from "./_flagSearch";
import { readFileSync } from "node:fs";
import { withDocumentBudget } from "../scripts/perf-metrics.mjs";
import { optionKeys } from "./_optionFlags";

const modules = import.meta.glob("./**/*.ts");

// flags: [option text, takesArgument?]; one manPageOptionFlags row per spelling (as optionFlagRows does).
type P = { name: string; score?: number; options?: Array<[string, boolean?]>; task?: string; usage?: Record<string, number> };

async function world(pages: P[], opts: { scoredRelease?: boolean; ready?: boolean; sync?: boolean } = {}) {
  const { scoredRelease = true, ready = true, sync = true } = opts;
  const t = convexTest({ schema, modules, transactionLimits: true });
  const releaseId = await t.run(async ctx => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "r", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
      ingestedAt: "2026-10-30", pageCount: pages.length, ...(scoredRelease ? { indexablePageCount: pages.length } : {}), ...(ready ? { flagSearchReady: true } : {}),
    });
    await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId, datasetReleaseId: "r", activatedAt: "2026-10-30" });
    return releaseId;
  });
  for (const p of pages) await t.run(async ctx => {
    const pageId = await ctx.db.insert("manPages", {
      releaseId, datasetReleaseId: "r", externalId: p.name, locale: "en", distro: "debian", name: p.name,
      section: "1", sitemapPage: 1, title: p.name, description: `${p.name} utility`, sourcePath: p.name, contentSha256: p.name,
      hasParseWarnings: false, verifiedFlagUsage: Object.entries(p.usage ?? {}).map(([flag, count]) => ({ flag, count, source: "tldr" as const })),
      ...(p.score !== undefined ? { popularityScore: p.score } : {}),
    });
    for (const [text, arg] of p.options ?? []) for (const flag of optionKeys(text)) await ctx.db.insert("manPageOptionFlags", {
      releaseId, pageId, nameNorm: p.name, section: "1", flag, flags: text, anchorId: optionKeys(text)[0].replace(/^-+/, ""),
      ...(arg ? { takesArgument: true } : {}),
    });
    if (sync) await syncFlagCandidates(ctx, (await ctx.db.get(pageId))!);
    if (p.task) await ctx.db.insert("manPageTaskPhrases", {
      releaseId, pageId, contentSha256: p.name, name: p.name, section: "1", title: p.name, description: `${p.name} utility`,
      taskText: p.task, ...(p.score !== undefined ? { popularityScore: p.score } : {}),
    });
  });
  return { t, releaseId };
}
const q = (t: ReturnType<typeof convexTest>, query: string, brief = false) =>
  withDocumentBudget(() => t.query(api.queries.search, { distro: "debian", q: query, section: null, limit: 5, offset: 0, brief }), query.startsWith("-") ? 40 : 30);

const S = 5470;
// Real Debian tar(1) alias strings (ingestion/tests/fixtures/golden/tar.1.json).
const TAR_OPTIONS: Array<[string, boolean?]> = JSON.parse(readFileSync("ingestion/tests/fixtures/golden/tar.1.json", "utf8")).options
  .map((o: { flags: string; argument?: string | null }) => [o.flags, Boolean(o.argument)]);
// Counts derived from tldr common/tar.md + tar(1) EXAMPLES as B6 verify_command would count them.
const TAR_USAGE = { "-f": 11, "-c": 5, "-x": 4, "-v": 3, "-z": 2, "-C": 2, "-t": 2, "-a": 1, "--wildcards": 1 };
const realTar: P = { name: "tar", score: S, options: TAR_OPTIONS, usage: TAR_USAGE };

describe("re-review #465: realistic recall", () => {
  it("R1: real tar aliases + realistic usage: does -xzf find tar?", async () => {
    const { t } = await world([realTar, { name: "grep", score: S, options: [["-x, --line-regexp"], ["-z, --null-data"], ["-f FILE", true]] }]);
    const r = await q(t, "-xzf");
    const doc = await t.run(async ctx => (await ctx.db.query("flagSearchCandidates").take(256)).find(d => d.flag === "-x"));
    expect(r.results[0]?.name).toBe("tar");
    expect(doc?.candidates.find(c => c.name === "tar")?.usage.map(u => u.flag)).toEqual(expect.arrayContaining(["-z", "--gzip", "--gunzip", "--ungzip", "-x", "--extract", "--get"]));
  });

  it("R1b: same with six earlier-named partial -x pages (full-Debian name-order shape)", async () => {
    const others = ["a2ps", "ar", "bash", "bsdtar", "cpio", "dpkg-deb"].map(name => ({ name, score: S, options: [["-x"]] as Array<[string]>, usage: { "-x": 1 } }));
    const { t } = await world([realTar, ...others]);
    const r = await q(t, "-xzf");
    expect(r.results.some(h => h.name === "tar")).toBe(true);
  });

  it("R2: --extract with real tar aliases", async () => {
    const { t } = await world([realTar, { name: "dpkg", score: S, options: [["-x, --extract"]] }]);
    const r = await q(t, "--extract");
    expect(r.results[0]?.name).toBe("tar");
  });

  it("R3: serialized rebuild restores an evicted candidate after withdrawals", async () => {
    vi.useFakeTimers();
    try {
      const strong = Array.from({ length: 16 }, (_, i) => ({ name: `s${String(i).padStart(2, "0")}`, score: 1,
        options: [["--extract"]] as Array<[string]>, usage: { "--extract": 100 } }));
      const { t, releaseId } = await world([realTar, ...strong]);
      const strongPages = await t.run(ctx => ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", q => q.eq("releaseId", releaseId)).take(20));
      for (const page of strongPages.filter(p => p.name.startsWith("s"))) {
        await t.mutation(internal.derived.setVerifiedFlagUsage, { pageId: page._id, usage: [] });
      }
      // Source writes commit without touching hot candidate rows.
      const before = await t.run(ctx => ctx.db.query("flagSearchCandidates").withIndex("by_releaseId_and_generation_and_flag", q => q.eq("releaseId", releaseId).eq("generation", undefined).eq("flag", "--extract")).unique());
      expect(before?.candidates.some(c => c.name === "tar")).toBe(false);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const row = await t.run(async ctx => {
        const release = (await ctx.db.get(releaseId))!;
        return ctx.db.query("flagSearchCandidates").withIndex("by_releaseId_and_generation_and_flag", q => q.eq("releaseId", releaseId).eq("generation", release.flagSearchGeneration).eq("flag", "--extract")).unique();
      });
      expect(row?.candidates.map(c => c.name)).toEqual(["tar"]);
      expect((await q(t, "--extract")).results[0].name).toBe("tar");
      const status = await t.run(ctx => ctx.db.query("taskPhraseBackfills").withIndex("by_releaseId", q => q.eq("releaseId", releaseId)).unique());
      expect(status?.generation).toBe(1);
      expect(status?.completedVersion).toBe(5);
      // A failed/interrupted scan must retain requests received before it stopped.
      await t.run(ctx => ctx.db.patch(status!._id, { completedVersion: undefined, jobId: undefined, rescanFlags: true, candidateGeneration: (status!.candidateGeneration ?? 0) + 1 }));
      await t.mutation(internal.taskPhrases.backfillActiveReleases, {});
      expect(await t.run(async ctx => (await ctx.db.get(status!._id))?.rescanFlags)).toBe(true);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run(async ctx => (await ctx.db.get(status!._id))?.completedVersion)).toBe(5);
    } finally { vi.useRealTimers(); }
  });

  it.each(["-xzf", "-xzvf", "-czf", "-tf"])("golden tar options preserve every alias for %s", async query => {
    const { t } = await world([realTar, { name: "grep", score: S, options: [["-x"], ["-z"], ["-f FILE", true]] }]);
    expect((await q(t, query)).results[0]?.name).toBe("tar");
  });

  it("type-ahead expands the final tarball prefix while completed words stay exact", async () => {
    const { t } = await world([{ ...realTar, task: "extract files from an archive" }, { name: "aim", task: "find a target" }]);
    expect((await q(t, "extract a tarb")).results[0]?.name).toBe("tar");
    expect((await q(t, "find a targ")).results[0]?.name).toBe("aim");
    expect((await q(t, "inspect tar archive")).results.some(hit => hit.name === "aim")).toBe(false);
  });
});

it("a refresh after completion starts a new generation even before the old job exits", async () => {
  vi.useFakeTimers();
  try {
    const { t, releaseId } = await world([realTar]);
    const oldJob = await t.run(async ctx => {
      const jobId = await ctx.scheduler.runAfter(0, internal.taskPhrases.backfillRelease, { releaseId, generation: 1 });
      await ctx.db.insert("taskPhraseBackfills", { releaseId, version: 5, completedVersion: 5, generation: 1,
        jobId, cursor: null, scanned: 1, written: 0, attempts: 0, updatedAt: 0 });
      return jobId;
    });
    await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
    expect(await t.run(async ctx => (await ctx.db.system.get(oldJob))?.state.kind)).toBe("canceled");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const status = await t.run(ctx => ctx.db.query("taskPhraseBackfills").withIndex("by_releaseId", q => q.eq("releaseId", releaseId)).unique());
    expect(status).toMatchObject({ generation: 2, completedVersion: 5 });
    expect((await q(t, "-xzf")).results[0].name).toBe("tar");
  } finally { vi.useRealTimers(); }
});


describe("completed candidate generations", () => {
  const earlier: P[] = ["a2ps", "ar", "bash", "bsdtar", "cpio", "dpkg-deb", "lz4", "pax"].map(name => ({
    name, score: S, options: [["-x, --extract"], ["-z, --gzip"], ["-f FILE", true]],
  }));

  it("keeps tar ranked throughout debouncing, mid-pass updates, publication and cleanup", async () => {
    vi.useFakeTimers();
    try {
      const { t, releaseId } = await world([realTar, ...earlier, { name: "zzz", options: [["-q"]], usage: { "-q": 1 } }]);
      const page = await t.run(ctx => ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", q => q.eq("releaseId", releaseId).eq("externalId", "zzz")).unique());
      await t.mutation(internal.derived.setVerifiedFlagUsage, { pageId: page!._id, usage: [{ flag: "-q", count: 2, source: "tldr" }] });
      await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
      const initial = await t.run(ctx => ctx.db.query("taskPhraseBackfills").withIndex("by_releaseId", q => q.eq("releaseId", releaseId)).unique());
      for (let i = 0; i < 8; i++) await t.mutation(internal.taskPhrases.requestFlagRefresh, { releaseId });
      expect(await t.run(async ctx => (await ctx.db.get(initial!._id))?.jobId)).toBe(initial!.jobId);
      expect(initial?.scanned).toBe(0);
      for (let step = 0; step < 14; step++) {
        expect((await t.run(ctx => ctx.db.get(releaseId)))?.flagSearchReady).toBe(true);
        expect((await q(t, "-xzf", true)).results[0].name).toBe("tar");
        expect((await q(t, "--extract")).results[0].name).toBe("tar");
        vi.runOnlyPendingTimers();
        await t.finishInProgressScheduledFunctions();
        if (step === 1) await t.mutation(internal.derived.setVerifiedFlagUsage, { pageId: page!._id, usage: [{ flag: "-q", count: 3, source: "tldr" }] });
      }
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const release = (await t.run(ctx => ctx.db.get(releaseId)))!;
      expect(release.flagSearchGeneration).toBeGreaterThan(1);
      const rows = await t.run(ctx => ctx.db.query("flagSearchCandidates").withIndex("by_releaseId_and_flag", q => q.eq("releaseId", releaseId)).take(256));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(row => row.generation === release.flagSearchGeneration)).toBe(true);
      const current = await t.run(ctx => ctx.db.query("taskPhraseBackfills").withIndex("by_releaseId", q => q.eq("releaseId", releaseId)).unique());
      expect(await t.mutation(internal.taskPhrases.backfillRelease, { releaseId, generation: current!.generation! - 1 })).toEqual({ done: false });
      expect((await q(t, "-xzf")).results[0].name).toBe("tar");
    } finally { vi.useRealTimers(); }
  });

  it("merges every letter's candidates when tar is evicted from the first-letter ranges", async () => {
    const crowded: P[] = ["c", "x"].flatMap(letter => Array.from({ length: 16 }, (_, i) => ({
      name: `${letter}${i}`, options: [[`-${letter}`]] as Array<[string]>, usage: { [`-${letter}`]: 100 },
    })));
    const { t } = await world([realTar, ...earlier, ...crowded]);
    for (const query of ["-czf", "-xzf", "-cf", "-xf"]) expect((await q(t, query, true)).results[0].name).toBe("tar");
  });

  it("rejects short prefixes and ranks exact words above final-word prefixes", async () => {
    const { t } = await world([{ name: "aim", score: 9000, task: "find a target" }, { name: "exact", score: 1, task: "find targ" }, { ...realTar, task: "extract files from an archive" }]);
    expect((await q(t, "how to ta")).results).toEqual([]);
    expect((await q(t, "how to tar")).results.some(hit => hit.name === "aim")).toBe(false);
    expect((await q(t, "extract a ta")).results.some(hit => hit.name === "aim")).toBe(false);
    expect((await q(t, "find a targ")).results[0].name).toBe("exact");
    expect((await q(t, "extract a tarb")).results[0].name).toBe("tar");
  });

  it("keeps every cluster length including two-letter clusters within 40 reads with the full brief", async () => {
    const flags = [..."xzabcdvf"].map(letter => `-${letter}`);
    const extras = Array.from({ length: 4 }, (_, i) => `--extra${i}`);
    const pages: P[] = Array.from({ length: 16 }, (_, i) => ({ name: `cover${i}`, score: S,
      options: [...flags.map(flag => [flag, flag === "-f"] as [string, boolean]), ...extras.map(flag => [flag] as [string])],
      usage: Object.fromEntries([...flags, ...extras].map(flag => [flag, flag.length === 2 ? 5 : 1])),
    }));
    const { t } = await world(pages);
    for (let length = 2; length <= 8; length++) {
      const query = "-" + "xzabcdv".slice(0, length - 1) + "f";
      expect((await q(t, query, true)).results.length).toBeGreaterThan(0);
    }
  });
});
