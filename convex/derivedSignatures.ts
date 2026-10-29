import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { changePin, scheduleDerivedSignatureRefresh } from "./derived";
import { hydrateCachedSignature, markUnavailableSignature, persistPackedSignature, MAX_SIGNATURE_BYTES } from "./_derivedInputs";
import { normalizeOptions } from "./_derivedModel";
import { encodeOptions } from "./_derivedEncoding";
import { resolveContent } from "./content";
import { DISTROS, PUBLIC_DATASET_STAGE } from "./lib";
import type { StoredContentFields } from "./_legacyContent";

const BATCH_PAGES = 32;
const MAX_OPTIONS_BYTES = 2_048_000;
const MAX_STORAGE_BYTES = 32_000_000;
const MAX_BATCH_SIGNATURE_BYTES = 2_000_000;
type Pointer = { storageId: Id<"_storage"> | null; fields: StoredContentFields | null };
type Candidate = { pageId: Id<"manPages">; cursor: string; page: Doc<"manPages"> | null };
type PreparedItem = { pageId: Id<"manPages">; cached: boolean; error: string | null; sourceKey: string | null; pointer: Pointer | null };
type PreparedBatch = { revision: number; cursor: string | null; items: PreparedItem[] } | null;

async function activeRelease(ctx: QueryCtx, releaseId: Id<"datasetReleases">) {
  const release = await ctx.db.get(releaseId);
  if (!release || release.pruning || !release.sealed || !release.manifestVerified) return null;
  const pointer = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) =>
    q.eq("stage", PUBLIC_DATASET_STAGE).eq("locale", release.locale).eq("distro", release.distro)).unique();
  return pointer?.releaseId === releaseId ? release : null;
}

async function unpin(ctx: MutationCtx, job: Doc<"derivedSignatureBackfills">) {
  if (job.migrationPin) {
    await changePin(ctx, job.releaseId, job.locale, { pending: -1 });
    await ctx.db.patch(job._id, { migrationPin: false });
  }
}

export const backfillActive = internalMutation({
  args: { locale: v.optional(v.string()), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const locale = args.locale ?? "en";
    const pointers = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", PUBLIC_DATASET_STAGE).eq("locale", locale)).take(DISTROS.length + 1);
    if (pointers.length > DISTROS.length || new Set(pointers.map((p) => p.distro)).size !== pointers.length) throw new Error("DERIVED_DUPLICATE_POINTER");
    const current = new Set(pointers.map((p) => p.releaseId));
    // Retired failed chains otherwise never run again to release their durable pin.
    for (const state of ["pending", "failed"] as const) {
      const retired = await ctx.db.query("derivedSignatureBackfills").withIndex("by_state_and_locale", (q) => q.eq("state", state).eq("locale", locale)).take(32);
      for (const job of retired) if (!current.has(job.releaseId)) {
        if (job.jobId) {
          const scheduled = await ctx.db.system.get(job.jobId);
          if (scheduled && ["pending", "inProgress"].includes(scheduled.state.kind)) await ctx.scheduler.cancel(job.jobId);
        }
        await unpin(ctx, job);
        await ctx.db.patch(job._id, { state: "complete", jobId: undefined, error: "RELEASE_RETIRED", lastProgressAt: Date.now() });
      }
    }
    let scheduled = 0;
    for (const pointer of pointers) {
      const release = await activeRelease(ctx, pointer.releaseId);
      if (!release) continue;
      const existing = await ctx.db.query("derivedSignatureBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique();
      if (existing?.state === "complete" && !existing.error && !args.force) continue;
      if (existing?.jobId) {
        const job = await ctx.db.system.get(existing.jobId);
        if (job && ["pending", "inProgress"].includes(job.state.kind)) continue;
      }
      const revision = (existing?.revision ?? 0) + 1;
      const reset = !existing || args.force || existing.state === "complete";
      const data = {
        releaseId: release._id, locale, revision, state: "pending" as const,
        phase: reset ? "scan" as const : existing.phase ?? "scan" as const,
        cursor: reset ? null : existing.cursor,
        processed: existing?.processed ?? 0, cacheHits: existing?.cacheHits ?? 0,
        failures: existing?.failures ?? 0, lastProgressAt: Date.now(), migrationPin: true,
      };
      const id = existing?._id ?? await ctx.db.insert("derivedSignatureBackfills", data);
      if (existing) await ctx.db.replace(existing._id, data);
      if (!existing?.migrationPin) await changePin(ctx, release._id, locale, { pending: 1 });
      else await changePin(ctx, release._id, locale, {});
      const jobId = await ctx.scheduler.runAfter(0, internal.derivedSignatures.run, { releaseId: release._id, revision });
      await ctx.db.patch(id, { jobId });
      scheduled++;
    }
    return { scheduled };
  },
});

async function candidates(ctx: QueryCtx, job: Doc<"derivedSignatureBackfills">): Promise<Candidate[]> {
  if (job.phase === "retry") {
    const rows = job.cursor
      ? await ctx.db.query("derivedSignatureFailures").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", job.releaseId).gt("pageId", job.cursor as Id<"manPages">)).take(BATCH_PAGES + 1)
      : await ctx.db.query("derivedSignatureFailures").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", job.releaseId)).take(BATCH_PAGES + 1);
    return Promise.all(rows.map(async (row) => ({ pageId: row.pageId, cursor: row.pageId, page: await ctx.db.get(row.pageId) })));
  }
  let pages: Doc<"manPages">[];
  if (!job.cursor) pages = await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", job.releaseId)).take(BATCH_PAGES + 1);
  else {
    const [name, section] = JSON.parse(job.cursor) as [string, string];
    pages = await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", job.releaseId).eq("name", name).gt("section", section)).take(BATCH_PAGES + 1);
    if (pages.length < BATCH_PAGES + 1) pages.push(...await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", job.releaseId).gt("name", name)).take(BATCH_PAGES + 1 - pages.length));
  }
  return pages.map((page) => ({ pageId: page._id, page, cursor: JSON.stringify([page.name, page.section]) }));
}

async function optionsPointer(ctx: QueryCtx, content: Doc<"manPageContents">): Promise<Pointer> {
  const blob = content.blobId ? await ctx.db.get(content.blobId) : null;
  if (content.blobId && !blob) throw new Error("DERIVED_CONTENT_UNAVAILABLE");
  const storageId = blob?.storageId ?? content.storageId ?? null;
  if (storageId) {
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata || metadata.size > MAX_STORAGE_BYTES) throw new Error("DERIVED_STORAGE_LIMIT");
    return { storageId, fields: null };
  }
  let optionsJson = (blob ?? content).optionsJson ?? null;
  if (optionsJson === null) {
    const chunks = blob
      ? await ctx.db.query("manPageContentBlobChunks").withIndex("by_blobId_and_kind_and_chunkIndex", (q) => q.eq("blobId", blob._id).eq("kind", "optionsJson")).take(9)
      : await ctx.db.query("manPageContentChunks").withIndex("by_contentId_and_kind_and_chunkIndex", (q) => q.eq("contentId", content._id).eq("kind", "optionsJson")).take(9);
    if (chunks.length > 8 || chunks.some((chunk, i) => chunk.chunkIndex !== i)) throw new Error("DERIVED_OPTIONS_CHUNKS_LIMIT");
    optionsJson = chunks.length ? chunks.map((chunk) => chunk.chunk).join("") : null;
  }
  if (optionsJson && new TextEncoder().encode(optionsJson).length > MAX_OPTIONS_BYTES) throw new Error("DERIVED_OPTIONS_LIMIT");
  return { storageId: null, fields: { optionsJson, docJson: null, synopsisJson: null, seeAlsoJson: null } };
}

export const readBatch = internalMutation({
  args: { releaseId: v.id("datasetReleases"), revision: v.number() },
  handler: async (ctx, args): Promise<PreparedBatch> => {
    const job = await ctx.db.query("derivedSignatureBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", args.releaseId)).unique();
    if (!job || job.revision !== args.revision || job.state !== "pending") return null;
    if (!await activeRelease(ctx, args.releaseId)) {
      await unpin(ctx, job);
      await ctx.db.patch(job._id, { state: "complete", jobId: undefined, error: "RELEASE_RETIRED", lastProgressAt: Date.now() });
      return null;
    }
    const rows = await candidates(ctx, job);
    const items: PreparedItem[] = [];
    let signatureBytes = 0;
    for (const row of rows.slice(0, BATCH_PAGES)) {
      if (!row.page) { items.push({ pageId: row.pageId, cached: true, error: null, sourceKey: null, pointer: null }); continue; }
      const page = row.page;
      const estimatedBytes = page.optionSignatureBytes ?? MAX_SIGNATURE_BYTES;
      if (items.length && signatureBytes + estimatedBytes > MAX_BATCH_SIGNATURE_BYTES) break;
      signatureBytes += estimatedBytes;
      const existing = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", page.releaseId).eq("pageId", page._id)).unique();
      if (existing?.status === "ready" && existing.contentSha256 === page.contentSha256 && (!page.optionSignatureHash || existing.signatureHash === page.optionSignatureHash)) {
        items.push({ pageId: page._id, cached: true, error: null, sourceKey: null, pointer: null }); continue;
      }
      if (page.optionSignatureHash && await hydrateCachedSignature(ctx, page)) { items.push({ pageId: page._id, cached: true, error: null, sourceKey: null, pointer: null }); continue; }
      try {
        const content = await ctx.db.query("manPageContents").withIndex("by_pageId", (q) => q.eq("pageId", page._id)).unique();
        if (!content) throw new Error("DERIVED_CONTENT_UNAVAILABLE");
        const sourceKey = `options-v2:${content.blobId ? `blob:${content.blobId}` : content.storageId ? `storage:${content.storageId}` : `content:${content._id}`}`;
        const cached = await ctx.db.query("derivedLegacySignatures").withIndex("by_sourceKey", (q) => q.eq("sourceKey", sourceKey)).unique();
        if (cached) {
          const input = await persistPackedSignature(ctx, page._id, cached.optionsJson, page.optionExtractorVersion ?? null);
          items.push({ pageId: page._id, cached: input?.status === "ready", error: input?.status === "ready" ? null : input?.error ?? "INVALID_OPTION_SIGNATURE", sourceKey: null, pointer: null }); continue;
        }
        items.push({ pageId: page._id, cached: false, error: null, sourceKey, pointer: await optionsPointer(ctx, content) });
        break; // At most one uncached legacy payload enters an action or query result.
      } catch (error) {
        items.push({ pageId: page._id, cached: false, error: error instanceof Error ? error.message.slice(0, 120) : "SIGNATURE_BACKFILL_FAILED", sourceKey: null, pointer: null });
      }
    }
    return { revision: job.revision, cursor: job.cursor, items };
  },
});

const resultInput = v.object({ pageId: v.id("manPages"), cached: v.boolean(), error: v.union(v.string(), v.null()), sourceKey: v.union(v.string(), v.null()), optionsJson: v.union(v.string(), v.null()) });
export const commitBatch = internalMutation({
  args: { releaseId: v.id("datasetReleases"), revision: v.number(), cursor: v.union(v.string(), v.null()), items: v.array(resultInput) },
  handler: async (ctx, args) => {
    const job = await ctx.db.query("derivedSignatureBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", args.releaseId)).unique();
    if (!job || job.revision !== args.revision || job.state !== "pending" || job.cursor !== args.cursor) return false;
    if (!await activeRelease(ctx, args.releaseId)) {
      await unpin(ctx, job);
      await ctx.db.patch(job._id, { state: "complete", jobId: undefined, error: "RELEASE_RETIRED", lastProgressAt: Date.now() });
      return false;
    }
    if (args.items.filter((item) => item.optionsJson !== null).length > 1 || args.items.reduce((sum, item) => sum + (item.optionsJson ? new TextEncoder().encode(item.optionsJson).length : 0), 0) > MAX_SIGNATURE_BYTES) throw new Error("SIGNATURE_BACKFILL_BATCH_LIMIT");
    const rows = await candidates(ctx, job);
    if (args.items.length > BATCH_PAGES || args.items.length > rows.length || args.items.some((item, i) => item.pageId !== rows[i].pageId) || (!args.items.length && rows.length)) throw new Error("SIGNATURE_BACKFILL_BATCH_MISMATCH");
    let failures = job.failures;
    for (const [i, item] of args.items.entries()) {
      const page = rows[i].page;
      let itemError = item.error;
      if (item.optionsJson !== null && page) {
        if (!item.sourceKey || new TextEncoder().encode(item.optionsJson).length > MAX_SIGNATURE_BYTES) throw new Error("INVALID_OPTION_SIGNATURE");
        const cached = await ctx.db.query("derivedLegacySignatures").withIndex("by_sourceKey", (q) => q.eq("sourceKey", item.sourceKey!)).unique();
        if (cached && cached.optionsJson !== item.optionsJson) throw new Error("SIGNATURE_SOURCE_CONFLICT");
        const input = await persistPackedSignature(ctx, page._id, item.optionsJson, page.optionExtractorVersion ?? null);
        if (input?.status !== "ready") itemError = input?.error ?? "INVALID_OPTION_SIGNATURE";
        else if (!cached) await ctx.db.insert("derivedLegacySignatures", { sourceKey: item.sourceKey, optionsJson: item.optionsJson });
      }
      const previous = await ctx.db.query("derivedSignatureFailures").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", job.releaseId).eq("pageId", item.pageId)).unique();
      if (itemError && page) {
        await markUnavailableSignature(ctx, page._id, itemError);
        if (previous) await ctx.db.patch(previous._id, { error: itemError });
        else { await ctx.db.insert("derivedSignatureFailures", { releaseId: job.releaseId, pageId: item.pageId, error: itemError }); failures++; }
      } else if (previous) { await ctx.db.delete(previous._id); failures = Math.max(0, failures - 1); }
    }
    const done = rows.length <= args.items.length;
    const refreshNeeded = job.refreshNeeded || job.phase !== "retry" || args.items.some((item) => item.optionsJson !== null) || failures < job.failures;
    const updates = { processed: job.processed + args.items.length, cacheHits: job.cacheHits + args.items.filter((item) => item.cached).length,
      failures, refreshNeeded, lastProgressAt: Date.now(), error: failures ? "SIGNATURE_PAGES_UNAVAILABLE" : undefined };
    if (done) {
      await ctx.db.patch(job._id, { ...updates, state: failures ? "failed" : "complete", phase: failures ? "retry" : job.phase ?? "scan", cursor: null, jobId: undefined });
      if (!failures) await unpin(ctx, job);
      if (refreshNeeded) await scheduleDerivedSignatureRefresh(ctx, job.releaseId);
      await ctx.db.patch(job._id, { refreshNeeded: false });
    } else {
      const jobId = await ctx.scheduler.runAfter(0, internal.derivedSignatures.run, { releaseId: job.releaseId, revision: job.revision });
      await ctx.db.patch(job._id, { ...updates, cursor: rows[args.items.length - 1].cursor, jobId });
      await changePin(ctx, job.releaseId, job.locale, {});
    }
    return true;
  },
});

export const failBatch = internalMutation({
  args: { releaseId: v.id("datasetReleases"), revision: v.number(), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.query("derivedSignatureBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", args.releaseId)).unique();
    if (job?.revision === args.revision && job.state === "pending") await ctx.db.patch(job._id, { state: "failed", jobId: undefined, error: args.error.slice(0, 120), lastProgressAt: Date.now() });
  },
});

export const run = internalAction({
  args: { releaseId: v.id("datasetReleases"), revision: v.number() },
  handler: async (ctx, args): Promise<null> => {
    try {
      const batch: PreparedBatch = await ctx.runMutation(internal.derivedSignatures.readBatch, args);
      if (!batch) return null;
      const items = [];
      for (const item of batch.items) {
        let optionsJson: string | null = null;
        let error = item.error;
        if (item.pointer) {
          try {
            const content = await resolveContent(ctx, item.pointer);
            if (!content) throw new Error("DERIVED_CONTENT_UNAVAILABLE");
            if (content.optionsJson && new TextEncoder().encode(content.optionsJson).length > MAX_OPTIONS_BYTES) throw new Error("DERIVED_OPTIONS_LIMIT");
            const options: unknown = content.optionsJson ? JSON.parse(content.optionsJson) : null;
            if (options !== null && !Array.isArray(options)) throw new Error("DERIVED_OPTIONS_INVALID");
            optionsJson = encodeOptions(normalizeOptions(options));
            if (new TextEncoder().encode(optionsJson).length > MAX_SIGNATURE_BYTES) throw new Error("DERIVED_INPUT_LIMIT");
          } catch (failure) { optionsJson = null; error = failure instanceof Error ? failure.message.slice(0, 120) : "SIGNATURE_BACKFILL_FAILED"; }
        }
        items.push({ pageId: item.pageId, cached: item.cached, sourceKey: item.sourceKey, error, optionsJson });
      }
      await ctx.runMutation(internal.derivedSignatures.commitBatch, { ...args, cursor: batch.cursor, items });
    } catch (error) {
      await ctx.runMutation(internal.derivedSignatures.failBatch, { ...args, error: error instanceof Error ? error.message : "SIGNATURE_BACKFILL_FAILED" });
      throw error;
    }
    return null;
  },
});

export const status = internalQuery({
  args: { locale: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const pointers = await ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", PUBLIC_DATASET_STAGE).eq("locale", args.locale ?? "en")).take(DISTROS.length);
    const releases = await Promise.all(pointers.map(async (pointer) => {
      const job = await ctx.db.query("derivedSignatureBackfills").withIndex("by_releaseId", (q) => q.eq("releaseId", pointer.releaseId)).unique();
      const scheduled = job?.jobId ? await ctx.db.system.get(job.jobId) : null;
      const crashed = scheduled?.state.kind === "failed" || scheduled?.state.kind === "canceled";
      return { distro: pointer.distro, datasetReleaseId: pointer.datasetReleaseId, state: crashed ? "failed" : job?.state ?? "uninitialized",
        processed: job?.processed ?? 0, cacheHits: job?.cacheHits ?? 0, failures: job?.failures ?? 0, error: job?.error ?? (crashed ? "SCHEDULED_BATCH_FAILED" : null) };
    }));
    return { healthy: releases.length > 0 && releases.every((release) => release.state === "complete" && !release.failures && release.error === null), releases };
  },
});
