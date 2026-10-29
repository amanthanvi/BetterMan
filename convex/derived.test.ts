/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { Distro } from "./lib";
import { decodeSummary } from "./_derivedEncoding";
import { persistOptionSignature } from "./_derivedInputs";
import schema from "./schema";
import {insertSymbols} from "./_symbols";
import {optionFlagRows} from "./_optionFlags";
const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
const option = (flags: string, anchorId: string, argument: string | null = null) => ({ flags, anchorId, argument, description: "A real option." });
const gnu = [option("-c, --create", "c"), option("-x, --extract, --get", "x"), option("-L, --tape-length", "L", "N"), option("-n, --seek", "n"), option("--new", "new")];
const bsd = [option("-c", "c"), option("-x", "x"), option("-L, --dereference", "L"), option("-n", "n")];
async function release(ctx: MutationCtx, distro: Distro, version: string, active = true, previousProdReleaseId?: Id<"datasetReleases">) {
  const datasetReleaseId = `${distro}-${version}`;
  const id = await ctx.db.insert("datasetReleases", { datasetReleaseId, distro, locale: "en", imageRef: "test", imageDigest: "test", ingestedAt: `2026-${version}-01T00:00:00Z`, pageCount: 0, sealed: true, manifestVerified: true, ...(previousProdReleaseId ? { previousProdReleaseId } : {}) });
  if (active) await ctx.db.insert("activeReleases", { stage: "prod", distro, locale: "en", releaseId: id, datasetReleaseId, activatedAt: "now" });
  return id;
}
async function page(ctx: MutationCtx, releaseId: Id<"datasetReleases">, name: string, options = gnu, hash = `hash-${name}`, version: number | null = 1, packageVersion = "1.2") {
  const r = (await ctx.db.get(releaseId))!;
  const id = await ctx.db.insert("manPages", { releaseId, datasetReleaseId: r.datasetReleaseId, externalId: `${name}.1`, locale: "en", distro: r.distro, name, section: "1", sitemapPage: 0, title: name, description: "test", sourcePath: name, contentSha256: hash, sourcePackage: name.startsWith("git") ? "git" : "tar", sourcePackageVersion: packageVersion, hasParseWarnings: false });
  await ctx.db.insert("manPageContents", { pageId: id, docJson: "{}", optionsJson: JSON.stringify(options) });
  await persistOptionSignature(ctx, id, options, version);
  return id;
}
async function summary(t: Harness, distro: Distro, name = "tar") {
  return t.run(async (ctx) => {
    const row = await ctx.db.query("manPageDerived").withIndex("by_locale_and_distro_and_name_and_section", (q) => q.eq("locale", "en").eq("distro", distro).eq("name", name).eq("section", "1")).unique();
    return row ? { row, value: decodeSummary(row.summaryJson) } : null;
  });
}
async function finish(t: Harness) { await t.finishAllScheduledFunctions(() => vi.runAllTimers()); }
afterEach(() => vi.useRealTimers());

describe("incremental derived snapshots", () => {
  it("builds multi-page signature inputs without content downloads and preserves tar aliases", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const old = await release(ctx, "debian", "08", false); await page(ctx, old, "tar", gnu.slice(0, -1), "gnu-old", 1, "1.1");
      for (const distro of ["debian", "ubuntu", "fedora", "freebsd", "macos"] as const) {
        const r = await release(ctx, distro, "09", true, distro === "debian" ? old : undefined);
        const isBsd = distro === "freebsd" || distro === "macos";
        await page(ctx, r, "tar", isBsd ? bsd : gnu, isBsd ? "bsd" : "gnu");
        for (let n = 0; n < 40; n++) await page(ctx, r, `page${n}`, [], `same-${n}`);
      }
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const result = (await summary(t, "debian"))!;
    expect(result.value.portability.rows).toContainEqual(["c", "aaa"]);
    expect(result.value.portability.rows).toContainEqual(["x", "aaa"]);
    expect(result.value.portability.rows).toContainEqual(["L", "add"]);
    expect(result.value.portability.rows).toContainEqual(["n", "ann"]);
    expect(result.value.variantGroups).toEqual([{ contentSha256: "gnu", distros: ["debian", "ubuntu", "fedora"] }, { contentSha256: "bsd", distros: ["freebsd", "macos"] }]);
    expect(result.value.newIn.map((o) => o.anchorId)).toEqual(["new"]);
    const state = await t.query(internal.derived.status, {});
    expect(state).toMatchObject({ state: "complete", healthy: true, scanned: 205, recomputed: 205 });
    expect(state.batches).toBeLessThan(20);
    expect(await t.mutation(internal.derived.rebuildActive, {})).toBe(false);
  });

  it("distinguishes absent pages from absent flags and chooses a GNU representative with the page", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await page(ctx, await release(ctx, "debian", "09"), "other", []);
      await page(ctx, await release(ctx, "ubuntu", "09"), "tar");
      await page(ctx, await release(ctx, "macos", "09"), "other", []);
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const result = (await summary(t, "ubuntu"))!.value;
    expect(result.portability.systems[0]).toEqual({ system: "gnu-linux", distro: "ubuntu" });
    expect(result.portability.rows).toContainEqual(["c", "aup"]);
    const record = (await summary(t, "ubuntu"))!;
    const chunks = await t.run((ctx) => ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", record.row._id)).take(1));
    expect(JSON.parse(chunks[0].json)[0][2]).toBe("pauuuup");
  });

  it("marks new options only for comparable predecessor pages with changed source or package", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const old = await release(ctx, "debian", "08", false);
      const current = await release(ctx, "debian", "09", true, old);
      const cases = [
        ["genuine", "old", "new", 1, 1, "1.1", "1.2"],
        ["unchanged", "same", "same", 1, 1, "1.2", "1.2"],
        ["parser-upgrade", "old", "new", 1, 2, "1.1", "1.2"],
        ["unknown-parser", "old", "new", null, 1, "1.1", "1.2"],
        ["package-only", "same", "same", 1, 1, "1.1", "1.2"],
      ] as const;
      for (const [name, oldHash, hash, oldVersion, version, oldPackage, pkg] of cases) {
        await page(ctx, old, name, name === "unknown-parser" ? [] : gnu.slice(0, -1), `${name}-${oldHash}`, oldVersion, oldPackage);
        await page(ctx, current, name, gnu, `${name}-${hash}`, version, pkg);
      }
      await page(ctx, current, "brand-new-page", gnu, "new-page");
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    for (const name of ["genuine", "package-only"]) expect((await summary(t, "debian", name))!.value.newIn.map((o) => o.anchorId)).toEqual(["new"]);
    for (const name of ["unchanged", "parser-upgrade", "unknown-parser", "brand-new-page"]) expect((await summary(t, "debian", name))!.value.newIn).toEqual([]);
  });

  it("rebuilds v2 snapshots and drops their historical version marks when the predecessor is unavailable", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const old = await t.run(async (ctx) => {
      const old = await release(ctx, "debian", "08", false);
      await page(ctx, old, "tar", gnu.slice(0, -1), "old", 1, "1.1");
      await page(ctx, await release(ctx, "debian", "09", true, old), "tar", gnu, "new", 1, "1.2");
      return old;
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    expect((await summary(t, "debian"))!.value.newIn.map((mark) => mark.anchorId)).toEqual(["new"]);
    await t.run(async (ctx) => {
      const build = (await ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", "en")).unique())!;
      const row = (await ctx.db.query("manPageDerived").withIndex("by_locale_and_distro_and_name_and_section", (q) => q.eq("locale", "en").eq("distro", "debian").eq("name", "tar").eq("section", "1")).unique())!;
      const [_, pointers] = JSON.parse(build.fingerprint) as [number, unknown];
      const fingerprint = JSON.stringify([2, pointers]);
      const key = JSON.stringify([2, fingerprint, build.revision]);
      await ctx.db.patch(build._id, { fingerprint, key });
      await ctx.db.patch(row._id, { key });
      // Represents a pre-fix snapshot whose history was already pruned.
      await ctx.db.delete(old);
    });
    expect(await t.mutation(internal.derived.rebuildActive, {})).toBe(true);
    await finish(t);
    expect((await summary(t, "debian"))!.value.newIn).toEqual([]);
    expect((await summary(t, "debian"))!.row.key.startsWith("[3,")).toBe(true);
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "complete", healthy: true });
  });

  it("flags a missing-content page, protects dependencies past lease expiry, and self-heals without force", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const old = await release(ctx, "debian", "08", false); await page(ctx, old, "good", gnu, "old");
      const r = await release(ctx, "debian", "09", true, old);
      const good = await page(ctx, r, "good"); const bad = await page(ctx, r, "bad");
      const content = await ctx.db.query("manPageContents").withIndex("by_pageId", (q) => q.eq("pageId", bad)).unique(); await ctx.db.delete(content!._id);
      return { old, r, good, bad };
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const failed = await t.query(internal.derived.status, {});
    expect(failed).toMatchObject({ state: "failed", healthy: false, failedPages: 1 });
    expect(await summary(t, "debian", "good")).not.toBeNull();
    const partial = await t.run((ctx) => ctx.db.get(ids.r));
    expect(partial?.derivedInitialized).toBe(true);
    expect(partial?.derivedCompletedKey).toBe(partial?.derivedExpectedKey);
    expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "good", section: "1" })).toMatchObject({ kind: "page", data: { derived: { stale: false } } });
    expect(await summary(t, "debian", "bad")).toBeNull();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    await expect(t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { datasetReleaseId: "debian-08", confirmDatasetReleaseId: "debian-08" })).rejects.toThrow("RELEASE_DERIVED_BUILD_IN_PROGRESS");
    // Simulate a legacy pre-pin failure whose predecessor was pruned before this fix.
    await t.run((ctx) => ctx.db.delete(ids.old));
    await t.run(async (ctx) => { await ctx.db.insert("manPageContents", { pageId: ids.bad, docJson: "{}", optionsJson: JSON.stringify(gnu) }); await persistOptionSignature(ctx, ids.bad, gnu, 1); });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const repaired = await t.query(internal.derived.status, {});
    expect(repaired).toMatchObject({ state: "complete", healthy: true, failedPages: 0 });
    expect(repaired.scanned! - failed.scanned!).toBe(1);
    expect(await summary(t, "debian", "bad")).not.toBeNull();
  });

  it("drops unservable failed rows across A→B→C, permits pruning A, and survives rollback to B", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const a = await release(ctx, "debian", "07");
      const b = await release(ctx, "debian", "08", false, a);
      const c = await release(ctx, "debian", "09", false, b);
      for (const [id, version] of [[a, "A"], [b, "B"], [c, "C"]] as const) {
        await page(ctx, id, "good", gnu, "unchanged-good");
        const bad = await page(ctx, id, "bad", gnu, `bad-${version}`);
        if (id !== a) {
          const content = await ctx.db.query("manPageContents").withIndex("by_pageId", (q) => q.eq("pageId", bad)).unique();
          await ctx.db.delete(content!._id);
        }
      }
      return { a, b, c };
    });
    const pin = (id: Id<"datasetReleases">) => t.run((ctx) => ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", id)).unique());
    const promote = async (id: Id<"datasetReleases">, datasetReleaseId: string) => {
      await t.run(async (ctx) => {
        const pointer = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", "debian")).unique();
        await ctx.db.patch(pointer!._id, { releaseId: id, datasetReleaseId });
      });
      await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    };
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    expect(await pin(ids.a)).toMatchObject({ readyRows: 2 });
    await promote(ids.b, "debian-08");
    expect(await summary(t, "debian", "bad")).toBeNull();
    expect(await pin(ids.a)).toMatchObject({ required: true, readyRows: 0, pendingRefs: 0 });
    await promote(ids.c, "debian-09");
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", failedPages: 1, pendingJobs: 0 });
    expect(await pin(ids.a)).toMatchObject({ required: false, readyRows: 0, pendingRefs: 0 });
    expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "good", section: "1" })).toMatchObject({ kind: "page", data: { derived: { stale: false } } });
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    for (let batches = 0; batches < 30; batches++) {
      const result = await t.mutation(internal.maintenance.deleteInactiveReleaseBatch, { datasetReleaseId: "debian-07", confirmDatasetReleaseId: "debian-07", maxDocs: 10 });
      if (result.deletedRelease) break;
    }
    expect(await t.run((ctx) => ctx.db.get(ids.a))).toBeNull();
    await promote(ids.b, "debian-08");
    expect(await summary(t, "debian", "bad")).toBeNull();
    expect((await summary(t, "debian", "good"))!.row.releaseId).toBe(ids.b);
    expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "good", section: "1" })).toMatchObject({ kind: "page", data: { derived: { stale: false } } });
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", failedPages: 1, pendingJobs: 0 });
    const oldPin = await pin(ids.a);
    expect(oldPin === null || !oldPin.required && oldPin.pendingRefs === 0 && oldPin.readyRows === 0).toBe(true);
  });

  it("isolates group-input and summary limits, removes their old rows, and completes healthy pages", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const r = await release(ctx, "debian", "09");
      const good = await page(ctx, r, "good");
      const inputLimit = await page(ctx, r, "input-limit");
      const summaryLimit = await page(ctx, r, "summary-limit");
      return { r, good, inputLimit, summaryLimit };
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    expect(await summary(t, "debian", "input-limit")).not.toBeNull();
    expect(await summary(t, "debian", "summary-limit")).not.toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.inputLimit, { optionSignatureBytes: 4_000_001 });
      await ctx.db.patch(ids.summaryLimit, { sourcePackage: "x".repeat(40_000) });
    });
    await t.mutation(internal.derived.rebuildActive, { force: true }); await finish(t);
    expect(await summary(t, "debian", "input-limit")).toBeNull();
    expect(await summary(t, "debian", "summary-limit")).toBeNull();
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed", healthy: false, failedPages: 2 });
    const pin = await t.run((ctx) => ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", ids.r)).unique());
    expect(pin?.readyRows).toBe(1);
    expect(await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "good", section: "1" })).toMatchObject({ kind: "page", data: { derived: { stale: false } } });
  });

  it("resumes after a crashed/canceled job and preserves pending progress when another distro promotes", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const next = await t.run(async (ctx) => {
      for (const distro of ["debian", "ubuntu"] as const) { const r = await release(ctx, distro, "09"); for (let n = 0; n < 70; n++) await page(ctx, r, `page${n}`, [], `same-${n}`); }
      const r = await release(ctx, "ubuntu", "10", false); for (let n = 0; n < 70; n++) await page(ctx, r, `page${n}`, [], `same-${n}`); return r;
    });
    await t.mutation(internal.derived.rebuildActive, {});
    const before = await t.run((ctx) => ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", "en")).unique());
    await t.run((ctx) => ctx.scheduler.cancel(before!.jobId!));
    await t.mutation(internal.derived.runBatch, { locale: "en", key: before!.key });
    const scans = await t.run((ctx) => ctx.db.query("derivedScanJobs").withIndex("by_locale", (q) => q.eq("locale", "en")).take(5));
    expect(scans.some((job) => job.cursor !== null)).toBe(true);
    await t.run(async (ctx) => { const p = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", "ubuntu")).unique(); await ctx.db.patch(p!._id, { releaseId: next, datasetReleaseId: "ubuntu-10" }); });
    await t.mutation(internal.derived.rebuildActive, {});
    expect(await t.mutation(internal.derived.runBatch, { locale: "en", key: before!.key })).toMatchObject({ stale: true, processed: 0 });
    const after = await t.run((ctx) => ctx.db.query("derivedScanJobs").withIndex("by_locale", (q) => q.eq("locale", "en")).take(5));
    expect(after.find((job) => job._id === scans[0]._id)?.cursor).toBe(scans[0].cursor);
    await finish(t);
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "complete", healthy: true });
  });

  it("caches unchanged multi-page releases and recomputes only changed dependencies", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const newRelease = await t.run(async (ctx) => {
      for (const distro of ["debian", "ubuntu"] as const) { const r = await release(ctx, distro, "09"); for (let n = 0; n < 40; n++) await page(ctx, r, `page${n}`, [option("-a", "a")], `same-${n}`); }
      const next = await release(ctx, "debian", "10", false); for (let n = 0; n < 40; n++) await page(ctx, next, `page${n}`, n === 3 ? [option("-a", "a"), option("--new", "new")] : [option("-a", "a")], n === 3 ? "changed" : `same-${n}`); return next;
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const before = await t.query(internal.derived.status, {});
    await t.run(async (ctx) => { const pointer = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", "debian")).unique(); await ctx.db.patch(pointer!._id, { releaseId: newRelease, datasetReleaseId: "debian-10" }); });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const after = await t.query(internal.derived.status, {});
    expect(after.recomputed! - before.recomputed!).toBe(2);
    expect(after.cacheHits! - before.cacheHits!).toBeGreaterThan(100);
  });

  it("caps reverse links and family members, excludes the current family page", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => { const r = await release(ctx, "debian", "09"); const root = await page(ctx, r, "git", []);
      for (let n = 0; n < 25; n++) { const p = await page(ctx, r, `git-${String(n).padStart(2,"0")}`, []); await ctx.db.insert("manPageLinks", { releaseId: r, fromPageId: p, fromExternalId: String(n), toName: "git", toSection: "1", linkType: "xref" }); }
      expect(root).toBeTruthy();
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const root = (await summary(t, "debian", "git"))!.value;
    expect(root.referencedBy.items).toHaveLength(20); expect(root.referencedBy.hasMore).toBe(true);
    const child = (await summary(t, "debian", "git-00"))!.value;
    expect(child.family?.items.some((p) => p.name === "git-00")).toBe(false); expect(child.family?.hasMore).toBe(true);
    expect(root.referencedBy.items[0]).not.toHaveProperty("title");
  });

  it("stores large-page detail in bounded chunks and updates B6 ranking locally", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => page(ctx, await release(ctx, "debian", "09"), "large", Array.from({ length: 3009 }, (_, i) => option(`--flag-${i}`, `f${i}`)), "large"));
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const record = (await summary(t, "debian", "large"))!;
    expect(record.value.portability.rows).toHaveLength(256); expect(record.value.portability.total).toBe(3009);
    const chunks = await t.run((ctx) => ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", record.row._id)).take(65));
    expect(chunks).toHaveLength(24); expect(chunks.reduce((n,c) => n + JSON.parse(c.json).length,0)).toBe(3009);
    expect(new TextEncoder().encode(record.row.summaryJson).length).toBeLessThan(32_000);
    await t.mutation(internal.derived.setVerifiedFlagUsage, { pageId: id, usage: [{ flag: "--flag-8", count: 10, source: "tldr" }] });
    expect((await summary(t, "debian", "large"))!.value.mostUsed.flags[0]).toMatchObject({ flag: "--flag-8", count: 10 });
  });
  it("resolves peer aliases without overwriting canonical summaries and detects alias additions/removals", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const d = await release(ctx, "debian", "09"); await page(ctx, d, "fetch", [option("-f", "f")], "fetch");
      const u = await release(ctx, "ubuntu", "09"); await page(ctx, u, "canonical", [option("-f", "f")], "canonical");
      await ctx.db.insert("manPageAliases", { releaseId: u, datasetReleaseId: "ubuntu-09", name: "fetch", section: "1", targetName: "canonical", targetSection: "1" });
      const next = await release(ctx, "ubuntu", "10", false); await page(ctx, next, "canonical", [option("-f", "f")], "canonical");
      return { u, next };
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const fullCells = async (distro: Distro, name: string) => {
      const row = (await summary(t, distro, name))!.row;
      return t.run(async (ctx) => {
        const chunk = await ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", row._id)).first();
        return JSON.parse(chunk!.json)[0][2] as string;
      });
    };
    expect((await fullCells("debian", "fetch"))[1]).toBe("a");
    expect((await fullCells("ubuntu", "canonical"))[0]).toBe("a");
    expect((await summary(t, "ubuntu", "canonical"))!.value.variants.map((v) => v.distro)).toEqual(["ubuntu"]);
    const pointer = await t.run((ctx) => ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", "ubuntu")).unique());
    await t.run((ctx) => ctx.db.patch(pointer!._id, { releaseId: ids.next, datasetReleaseId: "ubuntu-10" }));
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    expect((await fullCells("debian", "fetch"))[1]).toBe("p");
    await t.run(async (ctx) => {
      await ctx.db.patch(pointer!._id, { releaseId: ids.u, datasetReleaseId: "ubuntu-09" });
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    expect((await fullCells("debian", "fetch"))[1]).toBe("a");
  });

  it("does not infer flag absence from an unversioned predecessor parser's empty options", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await page(ctx, await release(ctx, "debian", "09"), "tar", [], "old-parser", null);
      await page(ctx, await release(ctx, "ubuntu", "09"), "tar", gnu, "new-parser", 1);
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    expect((await summary(t, "ubuntu"))!.value.portability.rows).toContainEqual(["c", "tuu"]);
  });

  it("refreshes alias consumers after a staggered canonical signature repair", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const d = await release(ctx, "debian", "09"); await page(ctx, d, "tar", [option("-c, --create", "c")], "gnu");
      const u = await release(ctx, "ubuntu", "09"); const canonical = await page(ctx, u, "bsdtar", [option("-c", "c")], "bsd");
      const input = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", u).eq("pageId", canonical)).unique();
      await ctx.db.delete(input!._id);
      const caches = await ctx.db.query("derivedSignatureCache").withIndex("by_contentSha256_and_extractorVersion", (q) => q.eq("contentSha256", "bsd").eq("extractorVersion", 1)).take(2);
      for (const cache of caches) await ctx.db.delete(cache._id);
      await ctx.db.insert("manPageAliases", { releaseId: u, datasetReleaseId: "ubuntu-09", name: "tar", section: "1", targetName: "bsdtar", targetSection: "1" });
      return { u, canonical };
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "failed" });
    await t.run((ctx) => persistOptionSignature(ctx, ids.canonical, [option("-c", "c")], 1));
    await t.mutation(internal.derived.signatureRefresh, { releaseId: ids.u }); await finish(t);
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "complete", healthy: true });
    const record = (await summary(t, "debian", "tar"))!.row;
    const cells = await t.run(async (ctx) => {
      const chunk = await ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", record._id)).first();
      return JSON.parse(chunk!.json)[0][2] as string;
    });
    expect(cells[1]).toBe("a");
  });

  it("compares canonical bsdtar through its tar alias without inventing a GNU bsdtar variant", async () => {
    vi.useFakeTimers(); const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await page(ctx, await release(ctx, "debian", "09"), "tar", gnu, "gnu");
      const r = await release(ctx, "freebsd", "09"); await page(ctx, r, "bsdtar", bsd, "bsd");
      await ctx.db.insert("manPageAliases", { releaseId: r, datasetReleaseId: "freebsd-09", name: "tar", section: "1", targetName: "bsdtar", targetSection: "1" });
    });
    await t.mutation(internal.derived.rebuildActive, {}); await finish(t);
    const record = (await summary(t, "freebsd", "bsdtar"))!;
    expect(record.value.portability.rows).toContainEqual(["c", "aau"]);
    expect(record.value.portability.rows).toContainEqual(["L", "dau"]);
    expect(record.value.portability.rows).toContainEqual(["n", "nau"]);
    expect(record.value.variants.map((v) => v.distro)).toEqual(["freebsd"]);
    expect(record.value.variantGroups).toEqual([{ contentSha256: "bsd", distros: ["freebsd"] }]);
  });

});


it("serves derived-aware man responses alongside symbol search and explain from the same release", async () => {
  vi.useFakeTimers();
  const t=convexTest(schema,modules);
  await t.run(async ctx=>{
    for(const distro of ["debian","ubuntu"] as const) {
      const releaseId=await release(ctx,distro,"09");
      const pageId=await page(ctx,releaseId,"tar",gnu);
      const source=(await ctx.db.get(pageId))!;
      for(const row of optionFlagRows(gnu)) await ctx.db.insert("manPageOptionFlags",{...row,releaseId,pageId,nameNorm:"tar",section:"1"});
      await insertSymbols(ctx,(await ctx.db.get(releaseId))!,pageId,source,[{term:"TAR_OPTIONS",anchorId:"environment",excerpt:"Default archive options",kind:"environment"}]);
    }
  });
  await t.mutation(internal.derived.rebuildActive,{});await finish(t);
  const result=await t.action(api.content.getManByNameAndSection,{distro:"debian",name:"tar",section:"1"});
  expect(result).toMatchObject({kind:"page",data:{derived:{version:2,stale:false},content:{options:gnu},page:{name:"tar"}}});
  const search=await t.query(api.queries.search,{distro:"debian",q:"TAR_OPTIONS",section:null,limit:20,offset:0});
  expect(search.results[0]).toMatchObject({name:"tar",symbolKind:"environment",anchorId:"environment"});
  const explanation=await t.query(api.explain.explain,{distro:"debian",cmd:"tar -c"});
  expect(explanation.diagnostics).toEqual([]);
  expect(explanation.stages[0].tokens[1]).toMatchObject({kind:"option",anchor:"c",page:{name:"tar",distro:"debian"}});
});
