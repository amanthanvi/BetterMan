import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  flagUsageFor,
  GENERATED_LIMITS,
  generatedPartNameValidator,
  sameFlagUsage,
  generatedRecordValidator,
  GeneratedRecordError,
  validateGeneratedRecord,
} from "./_generatedLayer";
import { contentPointer } from "./content";
import { pageByNameAndSection, requireActiveRelease } from "./_releaseLookups";
import { datasetStageValidator, distroValidator } from "./schema";

/**
 * Insert or update generated-layer rows by content hash. Each part present in
 * a record replaces the stored part; absent parts are kept, so a tldr refresh
 * does not discard model text that was paid for.
 */
export const upsertRecords = internalMutation({
  args: { records: v.array(generatedRecordValidator), updatedAt: v.string() },
  handler: async (ctx, args) => {
    if (args.records.length > GENERATED_LIMITS.recordsPerRequest) {
      throw new GeneratedRecordError(`at most ${GENERATED_LIMITS.recordsPerRequest} records per request`);
    }
    const hashes = new Set<string>();
    for (const record of args.records) {
      validateGeneratedRecord(record);
      if (hashes.has(record.contentSha256)) throw new GeneratedRecordError("duplicate contentSha256 in batch");
      hashes.add(record.contentSha256);
    }
    let inserted = 0;
    let updated = 0;
    for (const record of args.records) {
      const existing = await ctx.db
        .query("manPageGenerated")
        .withIndex("by_contentSha256", (q) => q.eq("contentSha256", record.contentSha256))
        .unique();
      const suppressed = new Set(existing?.suppressed ?? []);
      const parts = {
        ...(record.page && !suppressed.has("page") ? { page: record.page } : {}),
        ...(record.tldr && !suppressed.has("tldr") ? { tldr: record.tldr } : {}),
        ...(record.tldrCommit ? { tldrCommit: record.tldrCommit } : {}),
        ...(record.generated && !suppressed.has("generated") ? { generated: record.generated } : {}),
        updatedAt: args.updatedAt,
      };
      if (existing) {
        await ctx.db.patch(existing._id, parts);
        updated += 1;
      } else {
        await ctx.db.insert("manPageGenerated", { contentSha256: record.contentSha256, ...parts });
        inserted += 1;
      }
    }
    // B7 ranks most-used flags from these counts; hand them over by hash.
    const usageHashes = args.records.filter((record) => record.page || record.tldr).map((record) => record.contentSha256);
    if (usageHashes.length) {
      await ctx.scheduler.runAfter(0, internal.generated.propagateFlagUsage, { contentSha256s: usageHashes });
    }
    return { inserted, updated };
  },
});

/**
 * Give B7 the verified flag counts for every page with these content hashes.
 * Each run schedules at most `flagUsageSchedules` updates, well under Convex's
 * 1,000 scheduled functions per mutation, then continues itself from the
 * hash and the last page it handled.
 */
export const propagateFlagUsage = internalMutation({
  args: {
    contentSha256s: v.array(v.string()),
    // Where the first hash stopped: the last page handled and how many of
    // that hash's pages were seen. A stable key, so pages removed between
    // runs cannot shift a later page out of reach.
    after: v.optional(v.object({ creationTime: v.number(), id: v.id("manPages"), seen: v.number() })),
  },
  handler: async (ctx, args) => {
    if (args.contentSha256s.length > GENERATED_LIMITS.recordsPerRequest) {
      throw new GeneratedRecordError(`at most ${GENERATED_LIMITS.recordsPerRequest} hashes per request`);
    }
    const hashes = [...new Set(args.contentSha256s)];
    let scheduled = 0;
    for (let index = 0; index < hashes.length; index++) {
      const contentSha256 = hashes[index];
      const after = index === 0 ? args.after : undefined;
      let seen = after?.seen ?? 0;
      let last = after ? { creationTime: after.creationTime, id: after.id } : null;
      const row = await ctx.db
        .query("manPageGenerated")
        .withIndex("by_contentSha256", (q) => q.eq("contentSha256", contentSha256))
        .unique();
      const usage = flagUsageFor(row);
      const pages = ctx.db
        .query("manPages")
        .withIndex("by_contentSha256", (q) => after
          ? q.eq("contentSha256", contentSha256).gte("_creationTime", after.creationTime)
          : q.eq("contentSha256", contentSha256));
      for await (const page of pages) {
        if (after && page._creationTime === after.creationTime && page._id === after.id) continue;
        if (seen >= GENERATED_LIMITS.flagUsagePages) break;
        if (scheduled >= GENERATED_LIMITS.flagUsageSchedules) {
          await ctx.scheduler.runAfter(0, internal.generated.propagateFlagUsage, {
            contentSha256s: hashes.slice(index),
            ...(last ? { after: { ...last, seen } } : {}),
          });
          return { scheduled, continued: true };
        }
        seen += 1;
        last = { creationTime: page._creationTime, id: page._id };
        if (sameFlagUsage(page.verifiedFlagUsage, usage)) continue;
        const release = await ctx.db.get(page.releaseId);
        if (!release || release.pruning) continue;
        await ctx.scheduler.runAfter(0, internal.derived.setVerifiedFlagUsage, { pageId: page._id, usage });
        scheduled += 1;
      }
    }
    return { scheduled, continued: false };
  },
});

/** One section of a stage's active release, with each page's generated-layer state. */
export const listCandidates = internalQuery({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    section: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const release = await requireActiveRelease(ctx, args);
    const numItems = Math.max(1, Math.min(Math.floor(args.limit), GENERATED_LIMITS.candidatesPerPage));
    const result = await ctx.db
      .query("manPages")
      .withIndex("by_releaseId_and_section_and_name", (q) =>
        q.eq("releaseId", release._id).eq("section", args.section),
      )
      .paginate({ cursor: args.cursor, numItems });
    const items = await Promise.all(result.page.map(async (page) => {
      const row = await ctx.db
        .query("manPageGenerated")
        .withIndex("by_contentSha256", (q) => q.eq("contentSha256", page.contentSha256))
        .unique();
      return {
        name: page.name,
        section: page.section,
        contentSha256: page.contentSha256,
        sourcePackage: page.sourcePackage ?? null,
        hasRecord: row !== null,
        promptVersion: row?.generated?.promptVersion ?? null,
        tldrCommit: row?.tldrCommit ?? row?.tldr?.commit ?? null,
        suppressed: row?.suppressed ?? [],
        // False when B7 has not yet received this row's flag counts for this
        // page, e.g. a new release of an unchanged page.
        flagUsageCurrent: sameFlagUsage(page.verifiedFlagUsage, flagUsageFor(row)),
      };
    }));
    return { items, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

/** Where each requested page's stored content lives, for the inputs route. */
export const inputPointers = internalQuery({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    pages: v.array(v.object({ name: v.string(), section: v.string() })),
  },
  handler: async (ctx, args) => {
    if (args.pages.length > GENERATED_LIMITS.inputsPerRequest) {
      throw new GeneratedRecordError(`at most ${GENERATED_LIMITS.inputsPerRequest} pages per request`);
    }
    const release = await requireActiveRelease(ctx, args);
    const found = await Promise.all(args.pages.map(async ({ name, section }) => {
      const page = await pageByNameAndSection(ctx, { releaseId: release._id, name, section });
      if (!page) return null;
      const pointer = await contentPointer(ctx, page._id);
      if (!pointer) return null;
      return {
        name: page.name,
        section: page.section,
        contentSha256: page.contentSha256,
        description: page.description,
        sourcePackage: page.sourcePackage ?? null,
        pointer,
      };
    }));
    return found.filter((item) => item !== null);
  },
});

/**
 * Remove parts of one page's generated layer and keep them out. Run by an
 * operator: `npx convex run generated:suppressParts '{...}'`. A changed page
 * has a new content hash and starts unsuppressed.
 */
export const suppressParts = internalMutation({
  args: { contentSha256: v.string(), parts: v.array(generatedPartNameValidator) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("manPageGenerated")
      .withIndex("by_contentSha256", (q) => q.eq("contentSha256", args.contentSha256))
      .unique();
    const suppressed = [...new Set([...(row?.suppressed ?? []), ...args.parts])].sort();
    const cleared = Object.fromEntries(args.parts.map((part) => [part, undefined]));
    if (row) {
      await ctx.db.patch(row._id, { ...cleared, suppressed, updatedAt: new Date().toISOString() });
    } else {
      await ctx.db.insert("manPageGenerated", {
        contentSha256: args.contentSha256, suppressed, updatedAt: new Date().toISOString(),
      });
    }
    // Removed page or tldr examples no longer count toward B7's ranking.
    if (args.parts.some((part) => part === "page" || part === "tldr")) {
      await ctx.scheduler.runAfter(0, internal.generated.propagateFlagUsage, { contentSha256s: [args.contentSha256] });
    }
    return { suppressed };
  },
});
