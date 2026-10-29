/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function activeRelease(ctx: MutationCtx, stage: "prod" | "staging", name: string) {
  const releaseId = await ctx.db.insert("datasetReleases", {
    datasetReleaseId: stage, locale: "en", distro: "debian",
    imageRef: "test", imageDigest: "test", ingestedAt: "2026-09-07T00:00:00Z", pageCount: 1, indexablePageCount: 1, sealed: true,
  });
  await ctx.db.insert("activeReleases", {
    stage, locale: "en", distro: "debian", releaseId,
    datasetReleaseId: stage, activatedAt: "2026-09-07T00:00:00Z",
  });
  await ctx.db.insert("manPages", {
    releaseId, datasetReleaseId: stage, externalId: name, locale: "en", distro: "debian",
    name, section: "1", sitemapPage: 1, indexable: true, popularityScore: 5000, title: name, description: name,
    sourcePath: `/man/${name}.1`, contentSha256: name, hasParseWarnings: false,
  });
}

it("reads only the prod release and reports which release it read", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await activeRelease(ctx, "prod", "ls");
    await activeRelease(ctx, "staging", "unreleased");
  });
  const args = { distro: "debian" as const, page: 1, paginationOpts: { numItems: 10, cursor: null } };
  expect(await t.query(api.queries.listSitemapPageChunk, args)).toMatchObject({
    datasetReleaseId: "prod",
    items: [{ name: "ls", section: "1" }],
  });
  const namedRelease = { ...args, datasetReleaseId: "staging" };
  await expect(t.query(api.queries.listSitemapPageChunk, namedRelease)).rejects.toThrow();
  await expect(t.query(api.queries.listSitemapPageChunk, { ...args, stage: "staging" as const })).resolves.toMatchObject({
    datasetReleaseId: "prod",
  });
});

it("filters unscored legacy and long-tail rows without losing pagination cursors", async () => {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    await activeRelease(ctx, "prod", "z-indexed");
    const release = (await ctx.db.query("datasetReleases").take(1))[0];
    for (const [name, indexable] of [["a-tail", false], ["b-legacy", undefined]] as const) {
      await ctx.db.insert("manPages", {
        releaseId: release._id, datasetReleaseId: "prod", externalId: name, locale: "en", distro: "debian",
        name, section: "3", sitemapPage: 1, indexable, title: name, description: name,
        sourcePath: name, contentSha256: name, hasParseWarnings: false,
      });
    }
  });
  const args = { distro: "debian" as const, page: 1, paginationOpts: { numItems: 2, cursor: null } };
  const first = await t.query(api.queries.listSitemapPageChunk, args);
  expect(first).toMatchObject({ items: [], isDone: false });
  const second = await t.query(api.queries.listSitemapPageChunk, {
    ...args, paginationOpts: { numItems: 2, cursor: first!.continueCursor },
  });
  expect(second).toMatchObject({ items: [{ name: "z-indexed", section: "1" }], isDone: true });
  expect(await t.query(api.queries.listSitemapPageChunk, { ...args, page: 0 })).toBeNull();
});

it("advertises the indexed count rather than the full release count", async () => {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    await activeRelease(ctx, "prod", "ls");
    const release = (await ctx.db.query("datasetReleases").take(1))[0];
    await ctx.db.patch(release._id, { pageCount: 115_000, indexablePageCount: 20_001 });
  });
  expect(await t.query(api.queries.listSeoReleases, {})).toMatchObject({
    urlsPerFile: 10_000, items: [{ pageCount: 20_001 }],
  });
});


it("preserves the complete sitemap and count for a legacy release without a tier declaration", async () => {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    await activeRelease(ctx, "prod", "ls");
    const release = (await ctx.db.query("datasetReleases").take(1))[0];
    await ctx.db.patch(release._id, { indexablePageCount: undefined, pageCount: 10_001 });
    const existing = (await ctx.db.query("manPages").take(1))[0];
    await ctx.db.patch(existing._id, { indexable: undefined, popularityScore: undefined });
    const { _id, _creationTime, ...metadata } = existing;
    void _id; void _creationTime;
    await ctx.db.insert("manPages", {
      ...metadata,
      externalId: "tail", name: "tail", section: "3", sitemapPage: 2, indexable: false,
    });
  });
  expect(await t.query(api.queries.listSeoReleases, {})).toMatchObject({ items: [{ pageCount: 10_001 }] });
  const args = { distro: "debian" as const, page: 1, paginationOpts: { numItems: 5000, cursor: null } };
  expect(await t.query(api.queries.listSitemapPageChunk, args)).toMatchObject({ items: [{ name: "ls", section: "1" }] });
  expect(await t.query(api.queries.listSitemapPageChunk, { ...args, page: 2 })).toMatchObject({ items: [{ name: "tail", section: "3" }] });
});
