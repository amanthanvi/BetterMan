/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seededSection(names = ["awk", "bash", "cat", "diff", "echo"], limits?: { documentsRead?: number; bytesRead?: number }) {
  const t = convexTest({ schema, modules, transactionLimits: limits ?? false });
  await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "debian:test", locale: "en", distro: "debian",
      imageRef: "test", imageDigest: "test", ingestedAt: "2026-09-07", pageCount: names.length,
    });
    await ctx.db.insert("activeReleases", {
      stage: "prod", locale: "en", distro: "debian", releaseId,
      datasetReleaseId: "debian:test", activatedAt: "2026-09-07",
    });
    await ctx.db.insert("releaseSectionStats", {
      releaseId, datasetReleaseId: "debian:test", section: "1", label: "User Commands", total: names.length,
    });
    for (const name of names) {
      await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId: "debian:test", externalId: `${name}:1`,
        locale: "en", distro: "debian", name, section: "1", sitemapPage: 1,
        title: name, description: `${name} description`, sourcePath: `man1/${name}.1`,
        contentSha256: name, hasParseWarnings: false,
      });
    }
    await ctx.db.insert("manPages", {
      releaseId, datasetReleaseId: "debian:test", externalId: "close:2",
      locale: "en", distro: "debian", name: "close", section: "2", sitemapPage: 1,
      title: "close", description: "Other section", sourcePath: "man2/close.2",
      contentSha256: "close", hasParseWarnings: false,
    });
  });
  return t;
}

describe("section name cursors", () => {
  it("traverses every page forward and backward without duplicates or adjacent sections", async () => {
    const t = await seededSection();
    const first = await t.query(api.queries.listSection, { distro: "debian", section: "1", limit: 2 });
    expect(first).toMatchObject({ total: 5, offset: 0, nextCursor: "bash", prevCursor: null, hasMore: true });
    expect(first?.results.map((page) => page.name)).toEqual(["awk", "bash"]);
    const second = await t.query(api.queries.listSection, {
      distro: "debian", section: "1", limit: 2, cursor: first!.nextCursor!, offset: 2,
    });
    expect(second).toMatchObject({ nextCursor: "diff", prevCursor: "cat", hasMore: true });
    expect(second?.results.map((page) => page.name)).toEqual(["cat", "diff"]);
    const last = await t.query(api.queries.listSection, {
      distro: "debian", section: "1", limit: 2, cursor: second!.nextCursor!, offset: 4,
    });
    expect(last).toMatchObject({ nextCursor: null, prevCursor: "echo", hasMore: false });
    expect(last?.results.map((page) => page.name)).toEqual(["echo"]);
    const previous = await t.query(api.queries.listSection, {
      distro: "debian", section: "1", limit: 2, before: last!.prevCursor!, offset: 2,
    });
    expect(previous).toEqual(second);
    const start = await t.query(api.queries.listSection, {
      distro: "debian", section: "1", limit: 2, before: previous!.prevCursor!, offset: 0,
    });
    expect(start).toEqual(first);
  });

  it("seeks past 5,000 names without applying the offset as a second skip", async () => {
    const names = Array.from({ length: 5_505 }, (_, index) => `page${String(index).padStart(5, "0")}`);
    // Three release/stat reads, three page rows, and one opposite-boundary row.
    const t = await seededSection(names, { documentsRead: 7 });
    const result = await t.query(api.queries.listSection, {
      distro: "debian", section: "1", limit: 2, cursor: "page05500", offset: 5_501,
    });
    expect(result).toMatchObject({ offset: 5_501, nextCursor: "page05502", prevCursor: "page05501" });
    expect(result?.results.map((page) => page.name)).toEqual(["page05501", "page05502"]);
  });

  it("keeps legacy offset results and adds cursors for continued traversal", async () => {
    const t = await seededSection();
    const result = await t.query(api.queries.listSection, {
      distro: "debian", section: "1", limit: 2, offset: 2,
    });
    expect(result).toMatchObject({ offset: 2, limit: 2, total: 5, nextCursor: "diff", prevCursor: "cat" });
    expect(result?.results.map((page) => page.name)).toEqual(["cat", "diff"]);
  });

  it.each(["legacy", "slim-first", "legacy-first"] as const)(
    "keeps %s search generations within the offset and cursor read budgets",
    async (generation) => {
      const names = Array.from({ length: 32 }, (_, index) => `page${String(index).padStart(5, "0")}`);
      // Original metadata offset scan (33 rows), release/stat reads (3), and
      // at most one legacy generation probe. Never scan the 750 KB payloads.
      const t = await seededSection(names, { documentsRead: 37, bytesRead: 1024 * 1024 });
      for (const [index, name] of names.entries()) await t.run(async (ctx) => {
        const releaseId = (await ctx.db.query("activeReleases").first())!.releaseId;
        const page = (await ctx.db.query("manPages")
          .withIndex("by_releaseId_and_name_and_section", (q) => q
            .eq("releaseId", releaseId)
            .eq("name", name).eq("section", "1")).unique())!;
        const legacy = generation === "legacy" || (generation === "slim-first" ? index >= 4 : index < 28);
        const searchDocumentId = await ctx.db.insert("manPageSearchDocuments", {
          pageId: page._id, releaseId: page.releaseId, name, nameNorm: name, section: "1", descNorm: page.description,
          ...(legacy ? {
            datasetReleaseId: page.datasetReleaseId, title: index === 4 ? "" : page.title, description: page.description,
            searchText: "s".repeat(375_000), snippetText: "n".repeat(375_000),
          } : {}),
        });
        if (!legacy) await ctx.db.insert("manPageSearchDetails", {
          searchDocumentId, releaseId: page.releaseId, title: page.title,
          description: page.description, snippetText: page.description,
        });
      });
      for (const offset of [0, 1, 4, 20, 28, 30, 32, 5_000]) {
        const result = await t.query(api.queries.listSection, { distro: "debian", section: "1", offset, limit: 2 });
        const selected = names.slice(offset, offset + 2);
        expect(result).toMatchObject({
          offset, limit: 2, total: names.length,
          hasMore: offset + 2 < names.length,
          nextCursor: offset + 2 < names.length ? selected.at(-1) : null,
          prevCursor: offset > 0 && selected.length ? selected[0] : null,
          results: selected.map((name) => ({ name, section: "1", title: name, description: `${name} description` })),
        });
        if (result!.nextCursor) {
          const next = await t.query(api.queries.listSection, {
            distro: "debian", section: "1", limit: 2, cursor: result!.nextCursor, offset: offset + 2,
          });
          expect(next!.results.map((page) => page.name)).toEqual(names.slice(offset + 2, offset + 4));
          const previous = await t.query(api.queries.listSection, {
            distro: "debian", section: "1", limit: 2, before: next!.prevCursor!, offset,
          });
          expect(previous).toEqual(result);
        }
      }
    },
  );

  it("does not advertise another page at an exact limit boundary or past the end", async () => {
    const t = await seededSection(["awk", "bash"]);
    const exact = await t.query(api.queries.listSection, { distro: "debian", section: "1", limit: 2 });
    expect(exact).toMatchObject({ hasMore: false, nextCursor: null, prevCursor: null });
    const empty = await t.query(api.queries.listSection, { distro: "debian", section: "1", limit: 2, cursor: "z" });
    expect(empty).toMatchObject({ results: [], hasMore: false, nextCursor: null, prevCursor: null });
  });

  it("returns an empty section and missing sections without invented cursors", async () => {
    const t = await seededSection([]);
    expect(await t.query(api.queries.listSection, { distro: "debian", section: "1", limit: 2 }))
      .toMatchObject({ results: [], total: 0, hasMore: false, nextCursor: null, prevCursor: null });
    expect(await t.query(api.queries.listSection, { distro: "debian", section: "9", limit: 2 })).toBeNull();
  });

  it("rejects conflicting cursor directions", async () => {
    const t = await seededSection();
    await expect(t.query(api.queries.listSection, {
      distro: "debian", section: "1", limit: 2, cursor: "awk", before: "echo",
    })).rejects.toThrow("Use either cursor or before, not both");
  });
});
