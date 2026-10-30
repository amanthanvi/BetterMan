/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function activeRelease(ctx: MutationCtx, stage: "prod" | "staging") {
  const releaseId = await ctx.db.insert("datasetReleases", {
    datasetReleaseId: stage, locale: "en", distro: "debian",
    imageRef: "test", imageDigest: "test", ingestedAt: "2026-09-07T00:00:00Z", pageCount: 0,
  });
  await ctx.db.insert("activeReleases", {
    stage, locale: "en", distro: "debian", releaseId,
    datasetReleaseId: stage, activatedAt: "2026-09-07T00:00:00Z",
  });
  return releaseId;
}

// Pages have no content rows: resolution must not need them.
async function page(ctx: MutationCtx, releaseId: Id<"datasetReleases">, name: string, section: string) {
  await ctx.db.insert("manPages", {
    releaseId, datasetReleaseId: "prod", externalId: `${name}.${section}`,
    locale: "en", distro: "debian", name, section, sitemapPage: 0,
    title: `${name}(${section})`, description: `${name} ${section} description`,
    sourcePath: `/man/${name}.${section}`, contentSha256: "test", hasParseWarnings: false,
  });
}

async function alias(ctx: MutationCtx, releaseId: Id<"datasetReleases">, name: string, section: string) {
  await ctx.db.insert("manPageAliases", {
    releaseId, datasetReleaseId: "prod", name, section, targetName: "target", targetSection: section,
  });
}

describe("resolveManByName", () => {
  it("prefers a page over an alias and does not read content", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const releaseId = await activeRelease(ctx, "prod");
      await page(ctx, releaseId, "printf", "1");
      await alias(ctx, releaseId, "printf", "3");
    });
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: " PRINTF " })).toEqual({
      kind: "page", name: "printf", section: "1", title: "printf(1)", description: "printf 1 description", datasetReleaseId: expect.any(String),
    });
  });

  it("matches getManByName for ambiguous names and aliases", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const releaseId = await activeRelease(ctx, "prod");
      await page(ctx, releaseId, "printf", "3");
      await page(ctx, releaseId, "printf", "1");
      await alias(ctx, releaseId, "alternate", "1");
    });
    for (const name of ["printf", "alternate", "missing"]) {
      const args = { distro: "debian" as const, name };
      // The resolver also names the release it read; otherwise it answers as getManByName does.
      const { datasetReleaseId, ...resolved } = await t.query(api.queries.resolveManByName, args)
      expect(datasetReleaseId).toEqual(expect.any(String))
      expect(resolved).toEqual(await t.action(api.content.getManByName, args));
    }
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "printf" })).toMatchObject({
      kind: "ambiguous", options: [{ section: "1" }, { section: "3" }],
    });
  });

  it("reads only the prod release and rejects a caller-chosen stage", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await activeRelease(ctx, "prod");
      await page(ctx, await activeRelease(ctx, "staging"), "staging-only", "1");
    });
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "staging-only" })).toEqual({ kind: "not_found", datasetReleaseId: expect.any(String) });
    const withStage = { distro: "debian" as const, name: "staging-only", stage: "staging" };
    await expect(t.query(api.queries.resolveManByName, withStage)).rejects.toThrow();
  });
});
