/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import { DISTROS } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
it("preserves deep section offsets without scanning thousands of distribution caches", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { bytesRead: 8 * 1024 * 1024 } });
  const datasetReleaseId = `debian:${"release".repeat(10)}`;
  const releaseId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("datasetReleases", {
      datasetReleaseId, distro: "debian", locale: "en", imageRef: "fixture", imageDigest: "fixture",
      ingestedAt: "2026-10-12", pageCount: 5_600,
    });
    await ctx.db.insert("activeReleases", {
      stage: "prod", locale: "en", distro: "debian", releaseId: id, datasetReleaseId, activatedAt: "2026-10-12",
    });
    await ctx.db.insert("releaseSectionStats", { releaseId: id, datasetReleaseId, section: "1", label: "Commands", total: 5_600 });
    return id;
  });
  for (let batch = 0; batch < 56; batch++) await t.run(async (ctx) => {
    for (let item = 0; item < 100; item++) {
      const name = `page${String(batch * 100 + item).padStart(5, "0")}`;
      const variants = DISTROS.map((distro) => ({
        distro, datasetReleaseId: `${distro}:${"release".repeat(10)}`, name, section: "1", contentSha256: "a".repeat(64),
      }));
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId, externalId: name, name, section: "1", locale: "en", distro: "debian",
        sitemapPage: 1, title: `${name}(1)`, description: name, sourcePath: name, contentSha256: "a".repeat(64),
        hasParseWarnings: false, variants, variantsVersion: 1, stagingVariants: variants, stagingVariantsVersion: 1,
      });
      const searchDocumentId = await ctx.db.insert("manPageSearchDocuments", {
        pageId, releaseId, name, nameNorm: name, section: "1", descNorm: name,
      });
      await ctx.db.insert("manPageSearchDetails", {
        searchDocumentId, releaseId, title: `${name}(1)`, description: name, snippetText: name,
      });
    }
  });
  const result = await t.query(api.queries.listSection, { distro: "debian", section: "1", offset: 5_000, limit: 500 });
  expect(result).toMatchObject({ offset: 5_000, limit: 500, total: 5_600, hasMore: true, nextCursor: "page05499", prevCursor: "page05000" });
  expect(result!.results).toEqual(Array.from({ length: 500 }, (_, index) => {
    const name = `page${String(index + 5_000).padStart(5, "0")}`;
    return { name, section: "1", title: `${name}(1)`, description: name };
  }));
});
