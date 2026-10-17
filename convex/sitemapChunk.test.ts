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
    imageRef: "test", imageDigest: "test", ingestedAt: "2026-09-07T00:00:00Z", pageCount: 1, sealed: true,
  });
  await ctx.db.insert("activeReleases", {
    stage, locale: "en", distro: "debian", releaseId,
    datasetReleaseId: stage, activatedAt: "2026-09-07T00:00:00Z",
  });
  await ctx.db.insert("manPages", {
    releaseId, datasetReleaseId: stage, externalId: name, locale: "en", distro: "debian",
    name, section: "1", sitemapPage: 1, title: name, description: name,
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
