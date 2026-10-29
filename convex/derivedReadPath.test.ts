/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { persistOptionSignature, persistPackedSignature } from "./_derivedInputs";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());
async function release(ctx: MutationCtx, distro: "debian" | "ubuntu", version: string, names: string[]) {
  const datasetReleaseId = `${distro}-${version}`;
  const id = await ctx.db.insert("datasetReleases", { datasetReleaseId, distro, locale: "en", imageRef: "test", imageDigest: "test", ingestedAt: version, pageCount: names.length, sealed: true, manifestVerified: true });
  const pages = {} as Record<string, Id<"manPages">>;
  for (const name of names) {
    const options = [{ flags: "--one", anchorId: "one" }];
    const pageId = await ctx.db.insert("manPages", { releaseId: id, datasetReleaseId, distro, locale: "en", externalId: name, name, section: "1", sitemapPage: 0, title: name, description: name, sourcePath: name, contentSha256: name, hasParseWarnings: false });
    await ctx.db.insert("manPageContents", { pageId, docJson: '{"toc":[],"blocks":[]}', optionsJson: JSON.stringify(options) });
    await persistOptionSignature(ctx, pageId, options, 1);
    pages[name] = pageId;
  }
  return { id, datasetReleaseId, pages };
}

it("uses live variants and content hashes while a previously ready summary rebuilds", async () => {
  vi.useFakeTimers(); const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const debian = await release(ctx, "debian", "A", ["tar", "other"]);
    const ubuntu = await release(ctx, "ubuntu", "A", ["tar", "other"]);
    for (const r of [debian, ubuntu]) await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: r === debian ? "debian" : "ubuntu", releaseId: r.id, datasetReleaseId: r.datasetReleaseId, activatedAt: "now" });
    return { debian, ubuntu };
  });
  await t.mutation(internal.derived.rebuildActive, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const read = async () => {
    const result = await t.query(internal.content.getManByNameAndSectionReadModel, { stage: "prod", distro: "debian", name: "tar", section: "1" });
    return result?.kind === "page" ? result.data : null;
  };
  expect((await read())?.variants.map((v) => v.distro)).toEqual(["debian", "ubuntu"]);
  await t.run(async (ctx) => {
    const next = await release(ctx, "ubuntu", "B", ["other", "another"]);
    const pointer = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", "prod").eq("locale", "en").eq("distro", "ubuntu")).unique();
    await ctx.db.patch(pointer!._id, { releaseId: next.id, datasetReleaseId: next.datasetReleaseId });
    await ctx.db.patch(ids.debian.id, { derivedExpectedKey: "rebuilding" });
  });
  const result = await read();
  expect(result?.variants.map((v) => v.distro)).toEqual(["debian"]);
  expect(result?.derived?.variantGroups.flatMap((g) => g.distros)).toEqual(["debian"]);
  expect(result?.derived?.stale).toBe(true);
});

it("hides a matching-content summary's old link graph after rollback until assessed for that release", async () => {
  vi.useFakeTimers(); const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const old = await release(ctx, "debian", "A", ["git-add", "old-ref"]);
    const next = await release(ctx, "debian", "B", ["git-add", "git-new", "new-ref"]);
    await ctx.db.insert("manPageLinks", { releaseId: next.id, fromPageId: next.pages["new-ref"], fromExternalId: "new-ref", toName: "git-add", toSection: "1", linkType: "xref" });
    const pointer = await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId: next.id, datasetReleaseId: next.datasetReleaseId, activatedAt: "now" });
    return { old, next, pointer };
  });
  await t.mutation(internal.derived.rebuildActive, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const read = async () => {
    const result = await t.query(internal.content.getManByNameAndSectionReadModel, { stage: "prod", distro: "debian", name: "git-add", section: "1" });
    return result?.kind === "page" ? result.data : null;
  };
  expect((await read())?.derived?.referencedBy.items).toEqual([{ name: "new-ref", section: "1" }]);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.pointer, { releaseId: ids.old.id, datasetReleaseId: ids.old.datasetReleaseId });
    await ctx.db.patch(ids.old.id, { derivedInitialized: true, derivedExpectedKey: "rollback" });
  });
  const result = (await read())!;
  expect(result.derived?.referencedBy.items).toEqual([]);
  expect(result.derived?.family).toBeNull();
  expect(result.derived?.stale).toBe(true);
  await t.mutation(internal.derived.rebuildActive, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await read())?.derived?.stale).toBe(false);
  expect((await read())?.derived?.referencedBy.items).toEqual([]);
});

it("stops serving old enrichment immediately when signature validation fails", async () => {
  vi.useFakeTimers(); const t = convexTest(schema, modules);
  const pageId = await t.run(async (ctx) => {
    const r = await release(ctx, "debian", "A", ["tar", "other"]);
    await ctx.db.insert("activeReleases", { stage: "prod", locale: "en", distro: "debian", releaseId: r.id, datasetReleaseId: r.datasetReleaseId, activatedAt: "now" });
    return r.pages.tar;
  });
  await t.mutation(internal.derived.rebuildActive, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.run((ctx) => persistPackedSignature(ctx, pageId, "invalid JSON", 1));
  const result = await t.query(internal.content.getManByNameAndSectionReadModel, { stage: "prod", distro: "debian", name: "tar", section: "1" });
  expect(result?.kind === "page" && result.data.derived).toBeNull();
  expect(await t.query(api.portability.getDetails, { distro: "debian", name: "tar", section: "1" })).toBeNull();
});
