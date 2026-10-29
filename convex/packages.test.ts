/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { encodePackageCursor } from "./packages";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
async function insertRelease(ctx: MutationCtx, name: string, count: number, packageName = "libX11") {
  const releaseId = await ctx.db.insert("datasetReleases", {
    datasetReleaseId: name, locale: "en", distro: "freebsd", imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-10-28T00:00:00Z", pageCount: count,
  });
  for (let i = 0; i < count; i++) {
    const name = `X${String(i).padStart(3, "0")}`;
    await ctx.db.insert("manPages", {
      releaseId, datasetReleaseId: "fixture", externalId: name, locale: "en", distro: "freebsd", name,
      section: "3", sitemapPage: 0, title: `${name} manual`, description: "X API", sourcePath: name,
      sourcePackage: packageName, sourcePackageVersion: "1.8", contentSha256: name, hasParseWarnings: false,
    });
  }
  return releaseId;
}
async function fixture(count = 130) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const releaseId = await insertRelease(ctx, "old", count);
    const pointerId = await ctx.db.insert("activeReleases", {
      stage: "prod", locale: "en", distro: "freebsd", releaseId, datasetReleaseId: "old", activatedAt: "now",
    });
    return { releaseId, pointerId };
  });
  return { t, ...ids };
}
const read = (t: Harness, cursor: string | null = null, name = "libX11", numItems = 100) =>
  t.query(api.packages.getPackage, { distro: "freebsd", name, paginationOpts: { cursor, numItems } });

describe("package pagination", () => {
  it("preserves case, bounds pages and cursor-paginates without repeating results", async () => {
    const { t } = await fixture(230);
    const first = await read(t, null, " libX11 ", 500);
    expect(first).toMatchObject({ name: "libX11", version: "1.8", cursorReset: null, hasMore: true });
    expect(first.pages).toHaveLength(100);
    expect(first.pages[0]).toMatchObject({ section: "3", description: "X API" });
    expect(first.nextCursor).toMatch(/^p1\.[A-Za-z0-9_-]+$/);
    const second = await read(t, first.nextCursor);
    const third = await read(t, second.nextCursor);
    expect(second.pages).toHaveLength(100);
    expect(third.pages).toHaveLength(30);
    expect(third).toMatchObject({ hasMore: false, nextCursor: null, cursorReset: null });
    expect(new Set([...first.pages, ...second.pages, ...third.pages].map((p) => p.name)).size).toBe(230);
    expect((await read(t, null, "libx11")).pages).toEqual([]);
  });

  it.each(["", "garbage", "p1.bad", "p1._w", "p1.🔥", "x".repeat(8193)])("restarts malformed cursor without a 500: %s", async (cursor) => {
    const { t } = await fixture(3);
    const result = await read(t, cursor);
    expect(result.cursorReset).toBe("invalid");
    expect(result.pages.map((p) => p.name)).toEqual(["X000", "X001", "X002"]);
  });

  it("recovers a forged native cursor and rejects a cursor scoped to another package", async () => {
    const { t, releaseId } = await fixture(3);
    const forged = await read(t, encodePackageCursor({ releaseId, packageName: "libX11", cursor: "not-a-convex-cursor" }));
    expect(forged).toMatchObject({ cursorReset: "invalid", pages: [], nextCursor: null });
    const wrongPackage = await read(t, encodePackageCursor({ releaseId, packageName: "other", cursor: "native" }));
    expect(wrongPackage.cursorReset).toBe("invalid");
    expect(wrongPackage.pages).toHaveLength(3);
  });

  it("restarts at the active release after promotion instead of using an obsolete cursor", async () => {
    const { t, pointerId } = await fixture(130);
    const oldPage = await read(t);
    await t.run(async (ctx) => {
      const releaseId = await insertRelease(ctx, "new", 4);
      await ctx.db.patch(pointerId, { releaseId, datasetReleaseId: "new" });
    });
    const result = await read(t, oldPage.nextCursor);
    expect(result).toMatchObject({ datasetReleaseId: "new", cursorReset: "stale", hasMore: false, nextCursor: null });
    expect(result.pages).toHaveLength(4);
  });

  it("returns an empty package and rejects caller-chosen stages", async () => {
    const { t } = await fixture(3);
    expect(await read(t, null, "unknown")).toMatchObject({ name: "unknown", pages: [], version: null, hasMore: false, nextCursor: null });
    const args = { distro: "freebsd" as const, name: "libX11", paginationOpts: { cursor: null, numItems: 1 }, stage: "staging" };
    await expect(t.query(api.packages.getPackage, args)).rejects.toThrow();
  });
});
