/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { compareReleases, documentedRelease, translationDrift, upstreamRelease } from "./_translationDrift";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
type Page = { name: string; version?: string; documented?: string; flags?: string[] };

afterEach(() => vi.useRealTimers());

describe("drift rules (#395)", () => {
  it("reads the translation's release and the English package's upstream release", () => {
    expect(documentedRelease("GNU tar 1.34")).toBe("1.34");
    expect(documentedRelease("Linux man-pages 6.9.1")).toBe("6.9.1");
    expect(documentedRelease("GNU")).toBeNull();
    expect(upstreamRelease("1.35+dfsg-3.1")).toBe("1.35");
    expect(upstreamRelease("2:9.1.0016-1")).toBe("9.1.0016");
    expect(upstreamRelease("257.9-1")).toBe("257.9");
    expect(upstreamRelease("257-1")).toBeNull();
    expect(compareReleases("1.34", "1.35")).toBe(-1);
    expect(compareReleases("6.14", "6.9.1")).toBe(1);
    expect(compareReleases("9.7", "9.7.0")).toBe(0);
  });

  it("claims only what both sides support", () => {
    const base = { documentedVersion: "GNU tar 1.34", englishPackageVersion: "1.35+dfsg-3.1", translatedFlags: ["-x"], englishFlags: ["-x", "-c", "--zstd", "-c"] };
    expect(translationDrift(base)).toEqual({ documented: "1.34", english: "1.35", older: true, missingFlags: ["-c", "--zstd"], missingCount: 2 });
    // No options table parsed in the translation: no claim about missing options.
    expect(translationDrift({ ...base, translatedFlags: [] })).toEqual({ documented: "1.34", english: "1.35", older: true, missingFlags: [], missingCount: 0 });
    // A newer or equal translation with every flag has no drift; unknown versions claim nothing.
    expect(translationDrift({ ...base, documentedVersion: "GNU tar 1.35", translatedFlags: ["-x", "-c", "--zstd"] })).toBeNull();
    expect(translationDrift({ ...base, documentedVersion: undefined, translatedFlags: ["-x", "-c", "--zstd"] })).toBeNull();
    const many = translationDrift({ ...base, translatedFlags: ["-x"], englishFlags: Array.from({ length: 30 }, (_, i) => `--f${i}`) });
    expect(many?.missingFlags).toHaveLength(24);
    expect(many?.missingCount).toBe(30);
  });
});

async function release(t: Harness, datasetReleaseId: string, locale: string, pages: Page[]) {
  await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId, distro: "debian", locale, imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-10-30T00:00:00Z", packageManifest: null, pageCount: pages.length, aliasCount: 0, licenseCount: 0,
    sectionTotals: [{ section: "1", total: pages.length }], licensePackages: [],
  });
  const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["{\"docJson\":\"{}\"}"], { type: "application/json" })));
  await t.mutation(internal.ingest.insertStoredPages, {
    datasetReleaseId,
    pages: pages.map((page) => ({
      externalId: `${datasetReleaseId}-${page.name}`, name: page.name, section: "1", sitemapPage: 1, title: `${page.name}(1)`,
      description: page.name, sourcePath: `${page.name}.1`, sourcePackage: "pkg", sourcePackageVersion: page.version ?? "1.0-1",
      contentSha256: `${datasetReleaseId}-${page.name}`, hasParseWarnings: false, contentStorageId,
      ...(page.documented ? { documentedVersion: page.documented } : {}),
      searchText: page.name, snippetText: page.name, links: [],
      optionFlags: (page.flags ?? []).map((flag) => ({ flag, anchorId: flag, flags: flag })),
    })),
  });
}

async function activate(t: Harness, datasetReleaseId: string, stage: "staging" | "prod", allowTranslations = false) {
  const args = { datasetReleaseId, stage, activatedAt: "2026-10-30T01:00:00Z", ...(allowTranslations ? { allowTranslations } : {}) };
  for (let i = 0; i < 5; i++) {
    if (!(await t.mutation(internal.ingest.activateRelease, args)).pending) break;
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  }
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
}

const germanTar = (t: Harness) => t.action(api.content.getManByNameAndSection, { distro: "debian", name: "tar", section: "1", locale: "de", reportRelease: true }) as Promise<{ data: { translationDrift?: unknown; translationDriftPending?: boolean } }>;

describe("drift builds", () => {
  it("compares a translation with English after activation and serves it only against the active English release", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await release(t, "en-1", "en", [
      { name: "tar", version: "1.35+dfsg-3.1", flags: ["-x", "-c", "--zstd"] },
      { name: "ls", version: "9.7-3", flags: ["-a"] },
    ]);
    await activate(t, "en-1", "prod");
    await release(t, "de-1", "de", [
      { name: "tar", documented: "GNU tar 1.34", flags: ["-x"] },
      { name: "ls", documented: "GNU coreutils 9.7", flags: ["-a"] },
      { name: "only-de", documented: "x 0.1" },
    ]);
    await activate(t, "de-1", "staging");
    await activate(t, "de-1", "prod", true);
    const rows = await t.run((ctx) => ctx.db.query("manPageTranslationDrift").take(10));
    expect(rows).toHaveLength(1);
    // Sorted by flag (the option-flag index), not the manual's order.
    expect(rows[0]).toMatchObject({ documented: "1.34", english: "1.35", older: true, missingFlags: ["--zstd", "-c"], missingCount: 2 });
    expect(await t.run((ctx) => ctx.db.query("translationDriftBuilds").take(5))).toMatchObject([{ done: true, scanned: 3, drifted: 1 }]);
    const served = (await germanTar(t)).data;
    expect(served.translationDrift).toEqual({ documented: "1.34", english: "1.35", older: true, missingFlags: ["--zstd", "-c"], missingCount: 2, englishReleaseId: "en-1" });
    expect(served.translationDriftPending).toBeUndefined();
    const english = await t.action(api.content.getManByNameAndSection, { distro: "debian", name: "tar", section: "1", reportRelease: true }) as { data: object };
    expect(english.data).not.toHaveProperty("translationDrift");

    // A new English release hides the old comparison until the rebuild, which it schedules.
    await release(t, "en-2", "en", [{ name: "tar", version: "1.34+dfsg-1", flags: ["-x"] }, { name: "ls", version: "9.7-3", flags: ["-a"] }]);
    const english2 = { datasetReleaseId: "en-2", stage: "prod" as const, activatedAt: "now" };
    while ((await t.mutation(internal.ingest.activateRelease, english2)).pending) await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    // The pointer moved; the rebuild is scheduled but has not run: the old row is ignored and the page says it is pending.
    expect(await t.run((ctx) => ctx.db.query("manPageTranslationDrift").take(10))).toHaveLength(1);
    const pending = (await germanTar(t)).data;
    expect(pending.translationDrift).toBeUndefined();
    expect(pending.translationDriftPending).toBe(true);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.run((ctx) => ctx.db.query("manPageTranslationDrift").take(10))).toEqual([]);
    const rebuilt = (await germanTar(t)).data;
    expect(rebuilt.translationDrift).toBeUndefined();
    expect(rebuilt.translationDriftPending).toBeUndefined();
  });

  it("English activation without translations schedules nothing", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await release(t, "en-only", "en", [{ name: "tar" }]);
    await activate(t, "en-only", "prod");
    expect(await t.run((ctx) => ctx.db.query("translationDriftBuilds").take(1))).toEqual([]);
  });
});
