/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const releaseId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: "production", locale: "en", distro: "debian",
      imageRef: "test", imageDigest: "test", ingestedAt: "2026-09-07T00:00:00Z", pageCount: 0,
    });
    await ctx.db.insert("activeReleases", {
      stage: "prod", locale: "en", distro: "debian", releaseId: id,
      datasetReleaseId: "production", activatedAt: "2026-09-07T00:00:00Z",
    });
    return id;
  });
  return { t, releaseId };
}

async function page(ctx: MutationCtx, releaseId: Id<"datasetReleases">, name: string, section: string) {
  // Intentionally no content pointer/storage: route resolution only needs metadata.
  await ctx.db.insert("manPages", {
    releaseId, datasetReleaseId: "production", externalId: `${name}.${section}`,
    locale: "en", distro: "debian", name, section, sitemapPage: 0,
    title: `${name}(${section})`, description: `${name} ${section} description`,
    sourcePath: `/man/${name}.${section}`, contentSha256: "test", hasParseWarnings: false,
  });
}

async function alias(ctx: MutationCtx, releaseId: Id<"datasetReleases">, name: string, section: string) {
  await ctx.db.insert("manPageAliases", {
    releaseId, datasetReleaseId: "production",
    name, section, targetName: "target", targetSection: section,
  });
}

describe("metadata-only name resolution", () => {
  it("rejects a caller-supplied dataset stage", async () => {
    const { t } = await fixture();
    const args = { distro: "debian" as const, name: "anything", stage: "staging" };
    await expect(t.query(api.queries.resolveManByName, args)).rejects.toThrow();
  });

  it("resolves a normalized unique page before aliases without document content", async () => {
    const { t, releaseId } = await fixture();
    await t.run(async (ctx) => {
      await page(ctx, releaseId, "printf", "1");
      await alias(ctx, releaseId, "printf", "3");
    });
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "  PRINTF  " })).toEqual({
      kind: "page", name: "printf", section: "1",
    });
  });

  it("returns section-ordered ambiguity options matching the content name lookup", async () => {
    const { t, releaseId } = await fixture();
    await t.run(async (ctx) => {
      await page(ctx, releaseId, "printf", "3");
      await page(ctx, releaseId, "printf", "1");
    });
    const args = { distro: "debian" as const, name: "printf" };
    expect(await t.query(api.queries.resolveManByName, args)).toEqual({
      kind: "ambiguous",
      options: [
        { section: "1", title: "printf(1)", description: "printf 1 description" },
        { section: "3", title: "printf(3)", description: "printf 3 description" },
      ],
    });
    expect(await t.query(api.queries.resolveManByName, args)).toEqual(await t.action(api.content.getManByName, args));
  });

  it("returns one alias target and treats multiple alias sections as not found", async () => {
    const { t, releaseId } = await fixture();
    await t.run((ctx) => alias(ctx, releaseId, "alternate", "1"));
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "alternate" })).toEqual({
      kind: "alias", name: "target", section: "1",
    });
    await t.run((ctx) => alias(ctx, releaseId, "alternate", "3"));
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "alternate" })).toEqual({ kind: "not_found" });
  });

  it("returns not_found and ignores pages outside the production release", async () => {
    const { t } = await fixture();
    await t.run(async (ctx) => {
      const staging = await ctx.db.insert("datasetReleases", {
        datasetReleaseId: "staging", locale: "en", distro: "debian",
        imageRef: "test", imageDigest: "test", ingestedAt: "2026-09-07T00:00:00Z", pageCount: 1,
      });
      await ctx.db.insert("activeReleases", {
        stage: "staging", locale: "en", distro: "debian", releaseId: staging,
        datasetReleaseId: "staging", activatedAt: "2026-09-07T00:00:00Z",
      });
      await page(ctx, staging, "staging-only", "1");
    });
    expect(await t.query(api.queries.resolveManByName, { distro: "debian", name: "staging-only" })).toEqual({ kind: "not_found" });
  });
});
