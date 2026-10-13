/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { getDocumentSize } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { compactManPageSearchText } from "./lib";
import { migrateSearchDocument } from "./searchMigration";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Test = TestConvex<typeof schema>;
type SearchArgs = FunctionArgs<typeof api.queries.search>;
const searchArgs = (q: string, overrides: Partial<SearchArgs> = {}): SearchArgs => ({
  distro: "debian", q, section: null, limit: 10, offset: 0, ...overrides,
});

async function seedRelease(t: Test, label: string, options: {
  distro?: Doc<"datasetReleases">["distro"];
  locale?: string;
  stages?: Array<"prod" | "staging">;
  count?: number;
  pruning?: boolean;
} = {}) {
  return await t.run(async (ctx) => {
    const distro = options.distro ?? "debian";
    const locale = options.locale ?? "en";
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: label, distro, locale, imageRef: "test", imageDigest: "test",
      ingestedAt: "2026-10-12", pageCount: options.count ?? 0,
      ...(options.pruning ? { pruning: true } : {}),
    });
    for (const stage of options.stages ?? ["prod"]) {
      await ctx.db.insert("activeReleases", {
        stage, distro, locale, releaseId, datasetReleaseId: label, activatedAt: "2026-10-12",
      });
    }
    return releaseId;
  });
}

async function seedRows(t: Test, releaseId: Id<"datasetReleases">, rows: Array<{
  name: string; section?: string; description?: string; snippetText?: string;
}>) {
  return await t.run(async (ctx) => {
    const release = (await ctx.db.get(releaseId))!;
    const ids: Array<Id<"manPageSearchDocuments">> = [];
    for (const [index, row] of rows.entries()) {
      const section = row.section ?? "1";
      const description = row.description ?? "copyfiles metadata";
      const title = `${row.name}(${section}) — title ${index} 漢字`;
      const snippetText = row.snippetText ?? `${description}. ${"unchanged body café 漢字\n".repeat(100)} trailing marker`;
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId: release.datasetReleaseId, externalId: `${row.name}:${section}:${index}`,
        distro: release.distro, locale: release.locale, name: row.name, section, sitemapPage: 0,
        title, description, sourcePath: `man${section}/${row.name}.${section}`,
        contentSha256: `hash-${index}`, hasParseWarnings: false,
      });
      ids.push(await ctx.db.insert("manPageSearchDocuments", {
        releaseId, datasetReleaseId: release.datasetReleaseId, pageId, name: row.name,
        nameNorm: row.name.toLowerCase(), section, title, description, descNorm: description.toLowerCase(),
        searchText: compactManPageSearchText({ name: row.name, section, title, description, snippetText }),
        snippetText,
      }));
    }
    return ids;
  });
}

async function migrateRows(t: Test, ids: Array<Id<"manPageSearchDocuments">>) {
  await t.run(async (ctx) => {
    for (const id of ids) await migrateSearchDocument(ctx, (await ctx.db.get(id))!);
  });
}

async function rowsForRelease(t: Test, releaseId: Id<"datasetReleases">) {
  return await t.run((ctx) => ctx.db.query("manPageSearchDocuments")
    .withIndex("by_releaseId_and_nameNorm", (q) => q.eq("releaseId", releaseId)).take(500));
}

async function detailsForRelease(t: Test, releaseId: Id<"datasetReleases">) {
  return await t.run((ctx) => ctx.db.query("manPageSearchDetails")
    .withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).take(500));
}

afterEach(() => vi.useRealTimers());

describe("slim search display migration", () => {
  it("returns byte-identical search and suggestions before, during, and after migration", async () => {
    // Equal creation times exercise index ties without replacing their identity.
    vi.useFakeTimers();
    const t = convexTest({ schema, modules, transactionLimits: true });
    const releaseId = await seedRelease(t, "search-contract");
    const ids = await seedRows(t, releaseId, [
      { name: "cp", description: "cp copy files", snippetText: "Copy files exactly — café 漢字" },
      { name: "cp", section: "2", description: "cp copy files library" },
      { name: "cpio", description: "copy archives" },
      { name: "copy", description: "copy directory contents" },
      { name: "copycat", description: "copy named entries" },
      { name: "dup", description: "dup descriptor" },
      { name: "dup", description: "dup descriptor" },
      { name: "dup", section: "2", description: "dup descriptor" },
      ...Array.from({ length: 30 }, (_, index) => ({ name: `mirror${index}`, description: "copy files" })),
      ...Array.from({ length: 270 }, (_, index) => ({ name: `bulk${String(index).padStart(3, "0")}` })),
    ]);
    const cases = [
      searchArgs("cp"), searchArgs("c"), searchArgs("copyy"), searchArgs("copy files", { limit: 50 }),
      searchArgs("cp", { section: " 2 " }), searchArgs("dup"), searchArgs("  CP  "),
      searchArgs(""), searchArgs("no-such-command"), searchArgs("bulk", { offset: 200, limit: 3 }),
      searchArgs("bulk", { offset: 999, limit: 3 }), searchArgs("bulk", { offset: -3, limit: 0 }),
      searchArgs("bulk", { offset: 199, limit: 999 }), searchArgs("bulk", { offset: 1.9, limit: 2.9 }),
    ];
    const capture = async () => ({
      searches: await Promise.all(cases.map((args) => t.query(api.queries.search, args))),
      suggestions: await Promise.all(["cp", "dup", "bulk", " CP "].map((name) =>
        t.query(api.queries.suggest, { distro: "debian", name }))),
    });
    const before = await capture();
    expect(before.searches[0].results.map((row) => `${row.name}:${row.section}`)).toEqual(["cp:1", "cp:2", "cpio:1"]);
    expect(before.searches[2].results.map((row) => row.name)).toEqual(["copy", "copycat"]);
    expect(before.searches[3].results).toHaveLength(24);
    expect(before.searches[4].results.map((row) => `${row.name}:${row.section}`)).toEqual(["cp:2"]);
    expect(before.searches[5].results).toHaveLength(3);
    expect(before.searches[5].results[0].title).not.toEqual(before.searches[5].results[1].title);
    expect(before.searches[9]).toMatchObject({ hasMore: false, nextOffset: null });
    expect(before.searches[9].results.map((row) => row.name)).toEqual(["bulk200", "bulk201", "bulk202"]);
    expect(before.searches[10]).toEqual(before.searches[9]);
    expect(before.searches[11].results).toHaveLength(1);
    expect(before.searches[12].results).toHaveLength(50);
    expect(before.searches[12].nextOffset).toBe(200);
    expect(before.suggestions[2].suggestions).toHaveLength(10);
    await migrateRows(t, ids.filter((_, index) => index % 2 === 0));
    expect(JSON.stringify(await capture())).toBe(JSON.stringify(before));
    await migrateRows(t, ids);
    expect(JSON.stringify(await capture())).toBe(JSON.stringify(before));
    expect(await detailsForRelease(t, releaseId)).toHaveLength(ids.length);
  });

  it("preserves IDs, creation times, index fields, and the exact untruncated display strings on restart", async () => {
    const t = convexTest(schema, modules);
    const releaseId = await seedRelease(t, "identity");
    const ids = await seedRows(t, releaseId, [{ name: "cp", snippetText: "café 漢字\n".repeat(4_000) + "END" }]);
    const before = (await rowsForRelease(t, releaseId))[0];
    const existingId = await t.run((ctx) => ctx.db.insert("manPageSearchDetails", {
      releaseId, searchDocumentId: ids[0], title: "stale", description: "stale", snippetText: "stale",
    }));
    await migrateRows(t, ids);
    const { title, description, snippetText, searchText, datasetReleaseId, ...slim } = before;
    expect(await rowsForRelease(t, releaseId)).toEqual([slim]);
    const details = await detailsForRelease(t, releaseId);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ _id: existingId, releaseId, searchDocumentId: ids[0], title, description, snippetText });
    await migrateRows(t, ids);
    expect(await detailsForRelease(t, releaseId)).toEqual(details);
    expect(await rowsForRelease(t, releaseId)).toEqual([slim]);
  });

  it("rolls back an incomplete legacy row without creating a partial details record", async () => {
    const t = convexTest(schema, modules);
    const releaseId = await seedRelease(t, "incomplete");
    const ids = await seedRows(t, releaseId, [{ name: "broken" }]);
    await t.run((ctx) => ctx.db.patch(ids[0], { description: undefined }));
    const before = await rowsForRelease(t, releaseId);
    await expect(migrateRows(t, ids)).rejects.toThrow("SEARCH_LEGACY_DETAILS_INCOMPLETE");
    expect(await rowsForRelease(t, releaseId)).toEqual(before);
    expect(await detailsForRelease(t, releaseId)).toEqual([]);
  });

  it("deduplicates active stages, migrates in batches of 50, and safely restarts completed work", async () => {
    vi.useFakeTimers();
    const t = convexTest({ schema, modules, transactionLimits: true });
    const prod = await seedRelease(t, "prod", { stages: ["prod", "staging"] });
    const staging = await seedRelease(t, "staging", { distro: "ubuntu", stages: ["staging"] });
    const inactive = await seedRelease(t, "inactive", { distro: "fedora", stages: [] });
    const french = await seedRelease(t, "french", { distro: "arch", locale: "fr" });
    await seedRows(t, prod, Array.from({ length: 121 }, (_, index) => ({ name: `page${String(index).padStart(3, "0")}` })));
    for (const releaseId of [staging, inactive, french]) await seedRows(t, releaseId, [{ name: "page" }]);
    expect(await t.mutation(internal.searchMigration.backfillActiveReleases, {})).toEqual({ scheduled: 2 });
    const first = await t.mutation(internal.searchMigration.migrateReleaseBatch, { releaseId: prod, cursor: null });
    expect(first).toMatchObject({ scanned: 50, migrated: 50, isDone: false });
    expect(await detailsForRelease(t, prod)).toHaveLength(50);
    // Simulate an operator retry while the original chain is also queued.
    await t.mutation(internal.searchMigration.migrateReleaseBatch, { releaseId: prod, cursor: null });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await detailsForRelease(t, prod)).toHaveLength(121);
    expect(await detailsForRelease(t, staging)).toHaveLength(1);
    expect(await detailsForRelease(t, inactive)).toEqual([]);
    expect(await detailsForRelease(t, french)).toEqual([]);
    const before = await detailsForRelease(t, prod);
    await t.mutation(internal.searchMigration.backfillActiveReleases, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await detailsForRelease(t, prod)).toEqual(before);
    expect((await rowsForRelease(t, prod)).every((row) => row.title === undefined)).toBe(true);
  });

  it("stops a queued continuation after pointer removal and resumes after the pointer returns", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const releaseId = await seedRelease(t, "pointer-guard");
    await seedRows(t, releaseId, Array.from({ length: 75 }, (_, index) => ({ name: `page${index}` })));
    await t.mutation(internal.searchMigration.migrateReleaseBatch, { releaseId, cursor: null });
    const pointer = await t.run(async (ctx) => {
      const pointer = (await ctx.db.query("activeReleases").take(1))[0];
      await ctx.db.delete(pointer._id);
      return pointer;
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await detailsForRelease(t, releaseId)).toHaveLength(50);
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = pointer;
      await ctx.db.insert("activeReleases", fields);
    });
    await t.mutation(internal.searchMigration.backfillActiveReleases, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await detailsForRelease(t, releaseId)).toHaveLength(75);
  });

  it("does not migrate a pruning, inactive, non-English, or deleted release", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const pruning = await seedRelease(t, "pruning", { pruning: true });
    const inactive = await seedRelease(t, "inactive", { distro: "ubuntu", stages: [] });
    const french = await seedRelease(t, "french", { distro: "arch", locale: "fr" });
    const deleted = await seedRelease(t, "deleted", { distro: "fedora", stages: [] });
    for (const releaseId of [pruning, inactive, french, deleted]) await seedRows(t, releaseId, [{ name: "page" }]);
    await t.run((ctx) => ctx.db.delete(deleted));
    for (const releaseId of [pruning, inactive, french, deleted]) {
      expect(await t.mutation(internal.searchMigration.migrateReleaseBatch, { releaseId, cursor: null })).toBeNull();
      expect(await detailsForRelease(t, releaseId)).toEqual([]);
    }
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });

  it("keeps oversized historical rows below the transaction byte budget", async () => {
    vi.useFakeTimers();
    const t = convexTest({ schema, modules, transactionLimits: true });
    const releaseId = await seedRelease(t, "oversized");
    const ids = await seedRows(t, releaseId, Array.from({ length: 25 }, (_, index) => ({ name: `large${index}` })));
    // Seed in separate transactions: the legacy corpus exceeds 16 MiB in total.
    for (const id of ids) await t.run((ctx) => ctx.db.patch(id, { searchText: "x".repeat(750_000) }));
    const before = await t.run((ctx) => ctx.db.get(ids[0]));
    const first = await t.mutation(internal.searchMigration.migrateReleaseBatch, { releaseId, cursor: null });
    expect(first!.scanned).toBeGreaterThan(0);
    expect(first!.scanned).toBeLessThan(25);
    expect(first!.isDone).toBe(false);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const slim = await rowsForRelease(t, releaseId);
    expect(slim).toHaveLength(25);
    expect(slim.every((row) => row.searchText === undefined && row.title === undefined)).toBe(true);
    const details = await detailsForRelease(t, releaseId);
    expect(details).toHaveLength(25);
    expect(details.find((row) => row.searchDocumentId === ids[0])).toMatchObject({
      title: before!.title, description: before!.description, snippetText: before!.snippetText,
    });
  });
});

describe("slim search read costs", () => {
  it("keeps both overlapping typo windows while enriching only the final visible rows", async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const releaseId = await seedRelease(t, "overlapping-typo");
    const ids = await seedRows(t, releaseId, Array.from({ length: 270 }, (_, index) => ({
      name: `cmdd${String(index).padStart(3, "0")}`,
      snippetText: `copyfiles body café 漢字 ${"preview text ".repeat(30)}`.slice(0, 240),
    })));
    const args = searchArgs("cmdd", { offset: 200, limit: 50 });
    const measure = async (limits?: { bytesRead?: number; documentsRead?: number }) =>
      await t.query(async (ctx) => {
        const result = await ctx.runQuery(api.queries.search, args, { transactionLimits: limits });
        return { result, metrics: await ctx.meta.getTransactionMetrics() };
      });
    const overhead = await t.run(async (ctx) => {
      const release = (await ctx.db.get(releaseId))!;
      const pointer = (await ctx.db.query("activeReleases")
        .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", "debian"))
        .unique())!;
      return getDocumentSize(release) + getDocumentSize(pointer);
    });
    const legacyRows = await rowsForRelease(t, releaseId);
    const legacy = await measure();
    expect(legacy.result.results.map((row) => row.name)).toEqual(
      Array.from({ length: 50 }, (_, index) => `cmdd${index + 200}`),
    );
    expect(legacy.result).toMatchObject({ hasMore: false, nextOffset: null });
    // Both "cmdd" and the collapsed "cmd" scan the same 250 rows. Preserve
    // these duplicate index reads: deduplication still happens during ranking.
    expect(legacy.metrics.documentsRead.used).toBe(502);
    expect(legacy.metrics.bytesRead.used).toBe(overhead
      + 2 * legacyRows.slice(0, 250).reduce((sum, row) => sum + getDocumentSize(row), 0));
    await migrateRows(t, ids);
    const slimRows = await rowsForRelease(t, releaseId);
    const details = await detailsForRelease(t, releaseId);
    const slim = await measure();
    expect(JSON.stringify(slim.result)).toBe(JSON.stringify(legacy.result));
    expect(slim.metrics.documentsRead.used).toBe(552);
    const visibleIds = new Set(slimRows.slice(200, 250).map((row) => row._id));
    const visibleDetails = details.filter((row) => visibleIds.has(row.searchDocumentId));
    expect(visibleDetails).toHaveLength(50);
    expect(slim.metrics.bytesRead.used).toBe(overhead
      + 2 * slimRows.slice(0, 250).reduce((sum, row) => sum + getDocumentSize(row), 0)
      + visibleDetails.reduce((sum, row) => sum + getDocumentSize(row), 0));
    expect(slim.metrics.bytesRead.used).toBeLessThan(legacy.metrics.bytesRead.used);
    const limits = { documentsRead: 552, bytesRead: slim.metrics.bytesRead.used };
    expect((await measure(limits)).result).toEqual(slim.result);
    await expect(measure({ documentsRead: 551 })).rejects.toThrow("Scanned too many documents");
    await expect(measure({ bytesRead: limits.bytesRead - 1 })).rejects.toThrow("Read too much data");
    console.info("Search overlapping typo fixture", JSON.stringify({
      query: args.q, offset: args.offset, limit: args.limit,
      indexedCandidateReads: { legacy: 500, slim: 500 },
      richPayloadReads: { legacy: 500, slim: visibleDetails.length },
      legacyBytes: legacy.metrics.bytesRead.used, slimBytes: slim.metrics.bytesRead.used,
      legacyDocuments: legacy.metrics.documentsRead.used, slimDocuments: slim.metrics.documentsRead.used,
    }));
  });

  it.each([
    { label: "current 240-character preview", limit: 10, snippetText: `copyfiles body café 漢字 ${"preview text ".repeat(30)}`.slice(0, 240) },
    { label: "historical large preview", limit: 3, snippetText: `copyfiles body café 漢字 ${"large body preview\n".repeat(300)} END` },
  ])("reads details only for visible rows with $label", async ({ label, limit, snippetText }) => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const releaseId = await seedRelease(t, "read-cost");
    const ids = await seedRows(t, releaseId, Array.from({ length: 270 }, (_, index) => ({
      name: `bulk${String(index).padStart(3, "0")}`,
      snippetText,
    })));
    const cases = [searchArgs("bulk", { limit }), searchArgs("bulk", { limit, offset: 200 }),
      searchArgs("copyfiles", { limit })];
    const measureSearch = async (args: SearchArgs, limits?: { bytesRead?: number; documentsRead?: number }) =>
      await t.query(async (ctx) => {
        const result = await ctx.runQuery(api.queries.search, args, { transactionLimits: limits });
        return { result, metrics: await ctx.meta.getTransactionMetrics() };
      });
    const measureSuggest = async (limits?: { bytesRead?: number; documentsRead?: number }) =>
      await t.query(async (ctx) => {
        const result = await ctx.runQuery(api.queries.suggest, { distro: "debian", name: "bulk" }, { transactionLimits: limits });
        return { result, metrics: await ctx.meta.getTransactionMetrics() };
      });
    const legacyRows = await rowsForRelease(t, releaseId);
    const legacy = await Promise.all(cases.map((args) => measureSearch(args)));
    const legacySuggest = await measureSuggest();
    await migrateRows(t, ids);
    const slimRows = await rowsForRelease(t, releaseId);
    const details = await detailsForRelease(t, releaseId);
    const slim = await Promise.all(cases.map((args) => measureSearch(args)));
    const slimSuggest = await measureSuggest();
    expect(getDocumentSize(slimRows[0])).toBeLessThan(getDocumentSize(legacyRows[0]));
    const overhead = legacy[0].metrics.bytesRead.used - legacyRows.slice(0, limit + 5).reduce((sum, row) => sum + getDocumentSize(row), 0);
    const detailsByName = new Map(slimRows.map((row) => [row.name,
      details.find((detail) => detail.searchDocumentId === row._id)!]));
    for (const [index, args] of cases.entries()) {
      expect(JSON.stringify(slim[index].result)).toBe(JSON.stringify(legacy[index].result));
      const visibleCount = slim[index].result.results.length;
      const candidates = index === 0 ? slimRows.slice(0, limit + 5) : index === 1 ? slimRows.slice(0, 200 + limit + 5) : slimRows.slice(0, 24);
      const expectedBytes = overhead + candidates.reduce((sum, row) => sum + getDocumentSize(row), 0)
        + slim[index].result.results.reduce((sum, row) => sum + getDocumentSize(detailsByName.get(row.name)!), 0);
      expect(slim[index].metrics.bytesRead.used).toBe(expectedBytes);
      expect(slim[index].metrics.documentsRead.used).toBe(legacy[index].metrics.documentsRead.used + visibleCount);
      expect(slim[index].metrics.bytesRead.used).toBeLessThan(legacy[index].metrics.bytesRead.used);
      const limits = { bytesRead: slim[index].metrics.bytesRead.used, documentsRead: slim[index].metrics.documentsRead.used };
      expect((await measureSearch(args, limits)).result).toEqual(slim[index].result);
      await expect(measureSearch(args, { documentsRead: limits.documentsRead - 1 })).rejects.toThrow("Scanned too many documents");
      await expect(measureSearch(args, { bytesRead: limits.bytesRead - 1 })).rejects.toThrow("Read too much data");
    }
    expect(JSON.stringify(slimSuggest.result)).toBe(JSON.stringify(legacySuggest.result));
    expect(slimSuggest.metrics.documentsRead.used).toBe(legacySuggest.metrics.documentsRead.used + 10);
    const suggestBytes = overhead + slimRows.slice(0, 10).reduce((sum, row) => sum + getDocumentSize(row), 0)
      + slimSuggest.result.suggestions.reduce((sum, row) => sum + getDocumentSize(detailsByName.get(row.name)!), 0);
    expect(slimSuggest.metrics.bytesRead.used).toBe(suggestBytes);
    // Suggest displays every candidate. Its byte savings come from dropping
    // the redundant compact searchText, while each visible row adds a read.
    expect(slimSuggest.metrics.bytesRead.used).toBeLessThan(legacySuggest.metrics.bytesRead.used);
    const suggestLimits = { bytesRead: slimSuggest.metrics.bytesRead.used, documentsRead: slimSuggest.metrics.documentsRead.used };
    expect((await measureSuggest(suggestLimits)).result).toEqual(slimSuggest.result);
    await expect(measureSuggest({ documentsRead: suggestLimits.documentsRead - 1 })).rejects.toThrow("Scanned too many documents");
    // Restore the exact legacy fixture to prove the slim byte budgets reject it.
    await t.run(async (ctx) => {
      for (const row of legacyRows) {
        const { _id, _creationTime, ...fields } = row;
        await ctx.db.replace(_id, fields);
      }
    });
    for (const [index, args] of cases.entries()) {
      await expect(measureSearch(args, { bytesRead: slim[index].metrics.bytesRead.used })).rejects.toThrow("Read too much data");
    }
    await expect(measureSuggest({ bytesRead: slimSuggest.metrics.bytesRead.used })).rejects.toThrow("Read too much data");
    console.info("Search read-cost fixture", JSON.stringify({
      label,
      candidateBytes: { legacy: getDocumentSize(legacyRows[0]), slim: getDocumentSize(slimRows[0]) },
      search: cases.map((args, index) => ({ q: args.q, offset: args.offset,
        legacyBytes: legacy[index].metrics.bytesRead.used, slimBytes: slim[index].metrics.bytesRead.used,
        legacyDocuments: legacy[index].metrics.documentsRead.used, slimDocuments: slim[index].metrics.documentsRead.used })),
      suggest: { legacyBytes: legacySuggest.metrics.bytesRead.used, slimBytes: slimSuggest.metrics.bytesRead.used,
        legacyDocuments: legacySuggest.metrics.documentsRead.used, slimDocuments: slimSuggest.metrics.documentsRead.used },
    }));
  });
});
