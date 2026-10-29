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

describe("suggest", () => {
  async function seeded() {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const releaseId = await activeRelease(ctx, "debian");
      for (const [name, section] of [["grep", "1"], ["tar", "1"], ["tar", "5"], ["tarsnap", "1"]]) {
        const pageId = await page(ctx, releaseId, "debian", name, section);
        await ctx.db.insert("manPageSearchDocuments", {
          releaseId, pageId, datasetReleaseId: "debian-prod", name, nameNorm: name, section,
          title: `${name}(${section})`, description: `${name} description`, descNorm: `${name} description`,
          searchText: name, snippetText: name,
        });
      }
    });
    return t;
  }

  it("answers name prefixes, and spelling corrections only when asked", async () => {
    const t = await seeded();
    const names = async (name: string, typos?: boolean) =>
      (await t.query(api.queries.suggest, { distro: "debian", name, ...(typos === undefined ? {} : { typos }) }))
        .suggestions.map((s) => `${s.name}(${s.section})`);
    expect(await names("tar")).toEqual(["tar(1)", "tar(5)", "tarsnap(1)"]);
    expect(await names("grpe")).toEqual([]);
    expect(await names("grpe", true)).toEqual(["grep(1)"]);
    expect(await names("tarr", true)).toEqual(["tar(1)", "tar(5)"]);
    // A prefix match wins: corrections never displace real completions.
    expect(await names("tars", true)).toEqual(["tarsnap(1)"]);
    expect(await names("zzzz", true)).toEqual([]);
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
      distros: ["debian", "ubuntu"], datasetReleaseIds: expect.arrayContaining([expect.any(String)]),
    });
    expect(await t.query(api.queries.listManDistros, { name: "missing", section: "1" })).toMatchObject({ distros: [] });
    // A bare name counts any section of the page or its aliases.
    expect(await t.query(api.queries.listManDistros, { name: "systemctl" })).toMatchObject({
      distros: ["debian", "ubuntu", "macos"],
    });
    expect(await t.query(api.queries.listManDistros, { name: "missing" })).toMatchObject({ distros: [] });
  });

  it("does not accept a caller-chosen stage", async () => {
    const t = convexTest(schema, modules);
    const withStage = { name: "systemctl", section: "1", stage: "staging" };
    await expect(t.query(api.queries.listManDistros, withStage)).rejects.toThrow();
  });
});

it.each(["debian", "ubuntu", "fedora", "arch", "alpine", "freebsd", "macos"] as const)("keeps unscored %s metadata and page payloads indexable, filtering only after scoring", async distro => {
  const t = convexTest(schema, modules);
  const releaseId = await t.run(async ctx => {
    const releaseId = await activeRelease(ctx, distro);
    const pageId = await page(ctx, releaseId, distro, "tail", "3");
    await ctx.db.insert("manPageContents", { pageId, docJson: JSON.stringify({ toc: [], blocks: [] }) });
    return releaseId;
  });
  const args = { distro, name: "tail", section: "3" };
  expect(await t.query(api.queries.getManMetaByNameAndSection, args)).toMatchObject({ page: { indexable: true } });
  expect(await t.action(api.content.getManByNameAndSection, args)).toMatchObject({ kind: "page", data: { page: { indexable: true } } });
  await t.run(ctx => ctx.db.patch(releaseId, { indexablePageCount: 0 }));
  expect(await t.query(api.queries.getManMetaByNameAndSection, args)).toMatchObject({ page: { indexable: false } });
  expect(await t.action(api.content.getManByNameAndSection, args)).toMatchObject({ kind: "page", data: { page: { indexable: false } } });
});
