/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import { DISTROS } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

it("paginates enriched sitemap rows within a byte budget without missing or duplicating URLs", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { bytesRead: 5 * 1024 * 1024 } });
  const datasetReleaseId = `debian:${"release".repeat(10)}`;
  const releaseId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("datasetReleases", {
      datasetReleaseId, distro: "debian", locale: "en", imageRef: "fixture", imageDigest: "fixture",
      ingestedAt: "2026-10-12", pageCount: 5_000,
    });
    await ctx.db.insert("activeReleases", {
      stage: "prod", locale: "en", distro: "debian", releaseId: id, datasetReleaseId, activatedAt: "2026-10-12",
    });
    return id;
  });
  // Seed separately bounded write transactions; the read budget applies to
  // queries as well as fixtures, and no test bypasses it to traverse the map.
  for (let batch = 0; batch < 50; batch++) await t.run(async (ctx) => {
    for (let item = 0; item < 100; item++) {
      const name = `page${String(batch * 100 + item).padStart(5, "0")}`;
      const variants = DISTROS.map((distro) => ({
        distro, datasetReleaseId: `${distro}:${"release".repeat(10)}`, name, section: "1", contentSha256: "a".repeat(64),
      }));
      await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId, externalId: name, name, section: "1", locale: "en", distro: "debian",
        sitemapPage: 1, title: name, description: name, sourcePath: name, contentSha256: "a".repeat(64),
        hasParseWarnings: false, variants, variantsVersion: 1, stagingVariants: variants, stagingVariantsVersion: 1,
      });
    }
  });
  const names: string[] = [];
  let cursor: string | null = null;
  let done = false;
  let chunks = 0;
  while (!done && chunks < 20) {
    const result: { items: Array<{ name: string; section: string }>; page: number; isDone: boolean; continueCursor: string } | null = await t.query(api.queries.listSitemapPageChunk, {
      distro: "debian", page: 1,
      // A public caller cannot lift the server-owned byte/row caps.
      paginationOpts: { numItems: 5_000, cursor, maximumBytesRead: 100 * 1024 * 1024, maximumRowsRead: 100_000 },
    });
    expect(result).not.toBeNull();
    names.push(...result!.items.map((item) => item.name));
    done = result!.isDone;
    cursor = result!.continueCursor;
    chunks++;
  }
  expect(done).toBe(true);
  expect(chunks).toBeGreaterThan(1);
  expect(names).toEqual(Array.from({ length: 5_000 }, (_, index) => `page${String(index).padStart(5, "0")}`));
});
