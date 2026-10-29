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
