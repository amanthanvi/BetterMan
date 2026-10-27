/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { Distro } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function activeRelease(ctx: MutationCtx, distro: Distro, stage: "prod" | "staging" = "prod") {
  const datasetReleaseId = `${distro}-${stage}`;
  const releaseId = await ctx.db.insert("datasetReleases", {
    datasetReleaseId, locale: "en", distro,
    imageRef: "test", imageDigest: "test", ingestedAt: "2026-10-26T00:00:00Z", pageCount: 0,
  });
  await ctx.db.insert("activeReleases", {
    stage, locale: "en", distro, releaseId, datasetReleaseId, activatedAt: "2026-10-26T00:00:00Z",
  });
  return releaseId;
}

async function page(ctx: MutationCtx, releaseId: Id<"datasetReleases">, distro: Distro, name: string, section = "1") {
  return await ctx.db.insert("manPages", {
    releaseId, datasetReleaseId: `${distro}-prod`, externalId: `${distro}:${name}.${section}`,
    locale: "en", distro, name, section, sitemapPage: 0,
    title: `${name}(${section})`, description: `${name} description`,
    sourcePath: `/man/${name}.${section}`, contentSha256: name, hasParseWarnings: false,
  });
}

describe("getRelated", () => {
  it("leaves out pages SEE ALSO already lists", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const releaseId = await activeRelease(ctx, "debian");
      const tar = await page(ctx, releaseId, "debian", "tar");
      for (const name of ["gzip", "cpio", "bash"]) await page(ctx, releaseId, "debian", name);
      const link = (toName: string, linkType: "see_also" | "xref") =>
        ctx.db.insert("manPageLinks", {
          releaseId, fromPageId: tar, fromExternalId: "debian:tar.1", toName, toSection: "1", linkType,
        });
      await link("gzip", "see_also");
      await link("cpio", "see_also");
      // The body's own SEE ALSO paragraph links the same pages again as xrefs.
      await link("gzip", "xref");
      await link("bash", "xref");
      await link("cpio", "xref");
    });
    const related = await t.query(api.queries.getRelated, { distro: "debian", name: "tar", section: "1" });
    expect(related?.items.map((item) => item.name)).toEqual(["bash"]);
  });
});

describe("listManDistros", () => {
  it("lists the prod distros that have the page or an alias for it, in picker order", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const macos = await activeRelease(ctx, "macos");
      await page(ctx, macos, "macos", "systemctl", "8");
      const debian = await activeRelease(ctx, "debian");
      await page(ctx, debian, "debian", "systemctl");
      await activeRelease(ctx, "freebsd");
      const ubuntu = await activeRelease(ctx, "ubuntu");
      await ctx.db.insert("manPageAliases", {
        releaseId: ubuntu, datasetReleaseId: "ubuntu-prod", name: "systemctl", section: "1",
        targetName: "systemd", targetSection: "1",
      });
      await page(ctx, await activeRelease(ctx, "fedora", "staging"), "fedora", "systemctl");
    });
    expect(await t.query(api.queries.listManDistros, { name: " SystemCTL ", section: "1" })).toEqual({
      distros: ["debian", "ubuntu"],
    });
    expect(await t.query(api.queries.listManDistros, { name: "missing", section: "1" })).toEqual({ distros: [] });
  });

  it("does not accept a caller-chosen stage", async () => {
    const t = convexTest(schema, modules);
    const withStage = { name: "systemctl", section: "1", stage: "staging" };
    await expect(t.query(api.queries.listManDistros, withStage)).rejects.toThrow();
  });
});
