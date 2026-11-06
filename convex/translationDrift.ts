import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { CONTENT_LOCALES, DEFAULT_LOCALE } from "./_locales";
import { MAX_OPTION_FLAG_ROWS_PER_PAGE } from "./_optionFlags";
import { pageByNameAndSection } from "./_releaseLookups";
import { translationDrift } from "./_translationDrift";
import { DATASET_STAGES, PUBLIC_DATASET_STAGE } from "./lib";

// Each page reads its English page and up to 400 option rows on both sides,
// so eight pages stay far inside one mutation's read limit.
const DRIFT_BATCH_PAGES = 8;

async function pointer(ctx: QueryCtx, stage: (typeof DATASET_STAGES)[number], locale: string, distro: Doc<"datasetReleases">["distro"]) {
  return await ctx.db.query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", stage).eq("locale", locale).eq("distro", distro))
    .unique();
}

/**
 * The English release a translation is compared with: English at the public
 * stage when the translation is served there, else English at the stage that
 * points at the translation (staging inspection before promotion).
 */
async function englishFor(ctx: QueryCtx, release: Doc<"datasetReleases">): Promise<Id<"datasetReleases"> | null> {
  for (const stage of [PUBLIC_DATASET_STAGE, ...DATASET_STAGES.filter((s) => s !== PUBLIC_DATASET_STAGE)]) {
    const own = await pointer(ctx, stage, release.locale, release.distro);
    if (own?.releaseId !== release._id) continue;
    const english = await pointer(ctx, stage, DEFAULT_LOCALE, release.distro);
    if (english) return english.releaseId;
  }
  return (await pointer(ctx, PUBLIC_DATASET_STAGE, DEFAULT_LOCALE, release.distro))?.releaseId ?? null;
}

async function scheduleOne(ctx: MutationCtx, release: Doc<"datasetReleases">): Promise<boolean> {
  const englishReleaseId = await englishFor(ctx, release);
  if (!englishReleaseId) return false;
  const build = await ctx.db.query("translationDriftBuilds").withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique();
  if (build?.englishReleaseId === englishReleaseId) return false; // Built or building for this English release.
  const fresh = { englishReleaseId, cursor: null, scanned: 0, drifted: 0, done: false, updatedAt: Date.now() };
  if (build) await ctx.db.patch(build._id, fresh);
  else await ctx.db.insert("translationDriftBuilds", { releaseId: release._id, ...fresh });
  await ctx.scheduler.runAfter(0, internal.translationDrift.runBatch, { releaseId: release._id, englishReleaseId });
  return true;
}

/**
 * After a pointer moves: a translation compares itself with English; English
 * re-compares every translation of its distro that is active anywhere. Stale
 * rows stay readable-but-ignored until the rebuild replaces them.
 */
export async function scheduleTranslationDrift(ctx: MutationCtx, release: Doc<"datasetReleases">): Promise<number> {
  if (release.locale !== DEFAULT_LOCALE) return Number(await scheduleOne(ctx, release));
  let scheduled = 0;
  const seen = new Set<Id<"datasetReleases">>();
  for (const stage of DATASET_STAGES) {
    for (const locale of CONTENT_LOCALES) {
      if (locale === DEFAULT_LOCALE) continue;
      const active = await pointer(ctx, stage, locale, release.distro);
      if (!active || seen.has(active.releaseId)) continue;
      seen.add(active.releaseId);
      const translated = await ctx.db.get(active.releaseId);
      if (translated && await scheduleOne(ctx, translated)) scheduled++;
    }
  }
  return scheduled;
}

async function flags(ctx: QueryCtx, pageId: Id<"manPages">): Promise<string[]> {
  const rows = await ctx.db.query("manPageOptionFlags").withIndex("by_pageId_and_flag", (q) => q.eq("pageId", pageId))
    .take(MAX_OPTION_FLAG_ROWS_PER_PAGE);
  return rows.map((row) => row.flag);
}

/** One batch of a translated release's pages; schedules the next until done. */
export const runBatch = internalMutation({
  args: { releaseId: v.id("datasetReleases"), englishReleaseId: v.id("datasetReleases") },
  handler: async (ctx, args) => {
    const build = await ctx.db.query("translationDriftBuilds").withIndex("by_releaseId", (q) => q.eq("releaseId", args.releaseId)).unique();
    // A newer English release superseded this build; its own job continues.
    if (!build || build.done || build.englishReleaseId !== args.englishReleaseId) return { done: true };
    const [release, english] = await Promise.all([ctx.db.get(args.releaseId), ctx.db.get(args.englishReleaseId)]);
    if (!release || release.pruning || !english || english.pruning) {
      await ctx.db.patch(build._id, { done: true, updatedAt: Date.now() });
      return { done: true };
    }
    const batch = await ctx.db.query("manPages")
      .withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", args.releaseId))
      .paginate({ cursor: build.cursor, numItems: DRIFT_BATCH_PAGES });
    let drifted = 0;
    for (const page of batch.page) {
      const existing = await ctx.db.query("manPageTranslationDrift")
        .withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", args.releaseId).eq("pageId", page._id)).unique();
      const englishPage = await pageByNameAndSection(ctx, { releaseId: english._id, name: page.name, section: page.section });
      const drift = englishPage ? translationDrift({
        documentedVersion: page.documentedVersion,
        englishPackageVersion: englishPage.sourcePackageVersion,
        translatedFlags: await flags(ctx, page._id),
        englishFlags: await flags(ctx, englishPage._id),
      }) : null;
      if (!drift) {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      drifted++;
      const row = {
        releaseId: args.releaseId, pageId: page._id, englishReleaseId: english._id,
        ...(drift.documented ? { documented: drift.documented } : {}),
        ...(drift.english ? { english: drift.english } : {}),
        older: drift.older, missingFlags: drift.missingFlags, missingCount: drift.missingCount,
      };
      if (existing) await ctx.db.replace(existing._id, row);
      else await ctx.db.insert("manPageTranslationDrift", row);
    }
    await ctx.db.patch(build._id, {
      cursor: batch.continueCursor, scanned: build.scanned + batch.page.length, drifted: build.drifted + drifted,
      done: batch.isDone, updatedAt: Date.now(),
    });
    if (!batch.isDone) await ctx.scheduler.runAfter(0, internal.translationDrift.runBatch, args);
    return { done: batch.isDone };
  },
});

export type PageTranslationDrift = {
  documented: string | null; english: string | null; older: boolean; missingFlags: string[]; missingCount: number;
  /** The English release this note compared with; a page cached under another English key must not keep it. */
  englishReleaseId: string;
};

/**
 * The drift a translated page view shows: the public English pointer, the
 * page's row and its release's build (at most 3 documents). A row compared with
 * another English release is ignored. `pending` while the build for the current
 * English release is unfinished: a page without its note is then cached briefly.
 */
export async function pageTranslationDrift(ctx: QueryCtx, release: Doc<"datasetReleases">, pageId: Id<"manPages">): Promise<{ drift: PageTranslationDrift | null; pending: boolean }> {
  if (release.locale === DEFAULT_LOCALE) return { drift: null, pending: false };
  const [english, row, build] = await Promise.all([
    pointer(ctx, PUBLIC_DATASET_STAGE, DEFAULT_LOCALE, release.distro),
    ctx.db.query("manPageTranslationDrift")
      .withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", release._id).eq("pageId", pageId)).unique(),
    ctx.db.query("translationDriftBuilds").withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique(),
  ]);
  const pending = Boolean(english) && !(build?.done && build.englishReleaseId === english!.releaseId);
  if (!row || !english || english.releaseId !== row.englishReleaseId) return { drift: null, pending };
  return {
    drift: {
      documented: row.documented ?? null, english: row.english ?? null, older: row.older,
      missingFlags: row.missingFlags, missingCount: row.missingCount, englishReleaseId: english.datasetReleaseId,
    },
    pending,
  };
}
