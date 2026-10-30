/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { persistOptionSignature } from "./_derivedInputs";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());
it("reads only a bounded per-distro detail page, with separate missing-page codes", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const distro of ["debian", "macos"] as const) {
      const datasetReleaseId = `${distro}-test`;
      const releaseId = await ctx.db.insert("datasetReleases", { datasetReleaseId, distro, locale: "en", imageRef: "test", imageDigest: "test", ingestedAt: "2026-10-28T00:00:00Z", pageCount: 2, sealed: true, manifestVerified: true });
      await ctx.db.insert("activeReleases", { stage: "prod", distro, locale: "en", releaseId, datasetReleaseId, activatedAt: "now" });
      for (const name of distro === "debian" ? ["tar", "other"] : ["other", "another"]) {
        const options = Array.from({ length: name === "tar" ? 300 : 0 }, (_, i) => ({ anchorId: `f${i}`, flags: `--flag-${i}` }));
        const pageId = await ctx.db.insert("manPages", { releaseId, datasetReleaseId, externalId: name, distro, locale: "en", name, section: "1", sitemapPage: 0, title: name, description: name, sourcePath: name, contentSha256: name, hasParseWarnings: false });
        await ctx.db.insert("manPageContents", { pageId, docJson: "{}", optionsJson: JSON.stringify(options) });
        await persistOptionSignature(ctx, pageId, options, 1);
      }
    }
  });
  await t.mutation(internal.derived.rebuildActive, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const first = (await t.query(api.portability.getDetails, { distro: "debian", name: "tar", section: "1", offset: 0 }))!;
  expect(first.rows).toHaveLength(128);
  expect(first.nextOffset).toBe(128);
  expect(first.rows[0][2]).toBe("auuuuup");
  const last = (await t.query(api.portability.getDetails, { distro: "debian", name: "tar", section: "1", offset: 256 }))!;
  expect(last.rows).toHaveLength(44);
  expect(last.nextOffset).toBeNull();
  expect(last.total).toBe(300);
  await expect(t.query(api.portability.getDetails, { distro: "debian", name: "tar", section: "1", offset: -1 })).rejects.toThrow("INVALID_PORTABILITY_OFFSET");
  const arbitraryStage = { distro: "debian" as const, name: "tar", section: "1", stage: "staging" };
  await expect(t.query(api.portability.getDetails, arbitraryStage)).rejects.toThrow();
  expect(await t.query(api.portability.getDetails, { distro: "debian", name: "missing", section: "1" })).toBeNull();
});

it("returns three-system cells for requested anchors from the summary alone", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", { datasetReleaseId: "debian-test", distro: "debian", locale: "en", imageRef: "test", imageDigest: "test", ingestedAt: "2026-10-28T00:00:00Z", pageCount: 2, sealed: true, manifestVerified: true });
    await ctx.db.insert("activeReleases", { stage: "prod", distro: "debian", locale: "en", releaseId, datasetReleaseId: "debian-test", activatedAt: "now" });
    for (const [name, count] of [["tar", 300], ["cp", 2]] as const) {
      const options = Array.from({ length: count }, (_, i) => ({ anchorId: `f${i}`, flags: `--flag-${i}` }));
      const pageId = await ctx.db.insert("manPages", { releaseId, datasetReleaseId: "debian-test", externalId: name, distro: "debian", locale: "en", name, section: "1", sitemapPage: 0, title: name, description: name, sourcePath: name, contentSha256: name, hasParseWarnings: false });
      await ctx.db.insert("manPageContents", { pageId, docJson: "{}", optionsJson: JSON.stringify(options) });
      await persistOptionSignature(ctx, pageId, options, 1);
    }
  });
  await t.mutation(internal.derived.rebuildActive, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const tar = (await t.query(api.portability.getCells, { distro: "debian", name: "tar", section: "1", anchors: ["f0", "f0", "f299"] }))!;
  expect(tar.cells.f0).toMatch(/^a[a-z]{2}$/);
  // Beyond the summary's loaded rows: unknown, never the portable convention.
  expect(tar.cells.f299).toBe("lll");
  expect(tar.systems).toHaveLength(3);
  // A complete summary omits an anchor it does not hold rather than guessing.
  const cp = (await t.query(api.portability.getCells, { distro: "debian", name: "cp", section: "1", anchors: ["f1", "nope"] }))!;
  expect(Object.keys(cp.cells)).toEqual(["f1"]);
  expect(await t.query(api.portability.getCells, { distro: "debian", name: "missing", section: "1", anchors: ["f0"] })).toBeNull();
  await expect(t.query(api.portability.getCells, { distro: "debian", name: "tar", section: "1", anchors: Array.from({ length: 65 }, (_, i) => `a${i}`) })).rejects.toThrow("TOO_MANY_PORTABILITY_ANCHORS");
});
