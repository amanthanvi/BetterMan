import { getConvexSize, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DISTROS, prefixUpperBound, PUBLIC_DATASET_STAGE, type Distro } from "./lib";
import { encodeSummary, encodeSummaryParts, decodeSummary, decodeOptions } from "./_derivedEncoding";
import { buildOptionPortability, newInOptions, rankFlags, variantGroups } from "./_derivedModel";
import { storedPayloadDigest } from "./_storedPayload";
import { hydrateCachedSignature, MAX_SIGNATURE_BYTES } from "./_derivedInputs";

const DERIVED_VERSION = 3;
export const DERIVED_BATCH_PAGES = 32;
// Payload reservations plus measured reads/writes stay below 6 MiB, leaving
// 10 MiB beneath Convex's 16 MiB ceiling for query/metadata overhead.
export const MAX_BATCH_BYTES = 6 * 1024 * 1024;
const MAX_BATCH_INPUT_BYTES = MAX_BATCH_BYTES;
const UNKNOWN_CONTENT_BYTES = 1024 * 1024; // legacy rows can hold four inline fields
const CHUNK_DOCUMENT_BYTES = 1024 * 1024;
const MAX_BATCH_RELATION_READS = 6000;
const LEASE_MS = 60 * 60 * 1000;
export const MAX_REFERENCED_BY = 20;
export const MAX_FAMILY_PAGES = 20;
const MAX_SUMMARY_BYTES = 32_000;
type Variant = { distro: Distro; datasetReleaseId: string; contentSha256: string };
type PageRef = { name: string; section: string };
export type PageDerivedSummary = {
  version: 1;
  variants: Variant[];
  variantGroups: ReturnType<typeof variantGroups>;
  portability: ReturnType<typeof buildOptionPortability>;
  newIn: { anchorId: string; flags: string[]; datasetReleaseId: string; packageVersion: string | null }[];
  previousDatasetReleaseId: string | null;
  mostUsed: ReturnType<typeof rankFlags>;
  referencedBy: { items: PageRef[]; hasMore: boolean };
  family: { name: string; items: PageRef[]; hasMore: boolean } | null;
  package: { name: string; version: string | null } | null;
};

async function releaseStatus(ctx: MutationCtx, releaseId: Id<"datasetReleases">, locale: string) {
  const existing = await ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", releaseId)).unique();
  if (existing) return existing;
  const id = await ctx.db.insert("derivedReleaseStatus", { releaseId, locale, required: false, pendingRefs: 0, readyRows: 0, leaseUntil: 0, updatedAt: Date.now() });
  return (await ctx.db.get(id))!;
}
export async function changePin(ctx: MutationCtx, releaseId: Id<"datasetReleases">, locale: string, change: { pending?: number; rows?: number; required?: boolean }) {
  const status = await releaseStatus(ctx, releaseId, locale);
  await ctx.db.patch(status._id, {
    pendingRefs: Math.max(0, status.pendingRefs + (change.pending ?? 0)),
    readyRows: Math.max(0, status.readyRows + (change.rows ?? 0)),
    ...(change.required !== undefined ? { required: change.required } : {}),
    leaseUntil: Date.now() + LEASE_MS, updatedAt: Date.now(),
  });
}
async function enqueueScan(ctx: MutationCtx, locale: string, releaseId: Id<"datasetReleases">, key: string, kind: "pages" | "aliases") {
  const pending = await ctx.db.query("derivedScanJobs").withIndex("by_locale_and_releaseId_and_kind", (q) => q.eq("locale", locale).eq("releaseId", releaseId).eq("kind", kind)).unique();
  if (pending) return false;
  await ctx.db.insert("derivedScanJobs", { locale, releaseId, cursor: null, createdForKey: key, scanned: 0, kind });
  await changePin(ctx, releaseId, locale, { pending: 1 });
  return true;
}

async function enqueueReleaseScans(ctx: MutationCtx, locale: string, releaseId: Id<"datasetReleases">, key: string) {
  let added = 0;
  for (const kind of ["pages", "aliases"] as const) if (await enqueueScan(ctx, locale, releaseId, key, kind)) added++;
  return added;
}

// The queue survives later promotions; only the small active-pointer epoch changes.
export async function scheduleDerivedBuild(ctx: MutationCtx, locale: string, force = false): Promise<boolean> {
  const pointers = await ctx.db.query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) => q.eq("stage", PUBLIC_DATASET_STAGE).eq("locale", locale)).take(DISTROS.length + 1);
  if (!pointers.length) return false;
  if (pointers.length > DISTROS.length || new Set(pointers.map((p) => p.distro)).size !== pointers.length) throw new Error("DERIVED_DUPLICATE_POINTER");
  pointers.sort((a, b) => DISTROS.indexOf(a.distro) - DISTROS.indexOf(b.distro));
  const previous = await ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", locale)).unique();
  const fingerprint = JSON.stringify([DERIVED_VERSION, pointers.map((p) => [p.distro, p.releaseId])]);
  const changed = previous?.fingerprint !== fingerprint;
  const versionChanged = previous !== null && !previous.fingerprint.startsWith(`[${DERIVED_VERSION},`);
  const releases = [];
  let ready = true;
  const requiredIds: Id<"datasetReleases">[] = [];
  for (const pointer of pointers) {
    const release = await ctx.db.get(pointer.releaseId);
    if (!release || release.pruning) { ready = false; continue; }
    releases.push(release);
    requiredIds.push(release._id);
    if (!release.previousProdReleaseRecorded && !release.previousProdReleaseId) await ctx.db.patch(release._id, { previousProdReleaseRecorded: true });
    if (!release.sealed || !release.manifestVerified) ready = false;
    if (release.previousProdReleaseId) {
      const old = await ctx.db.get(release.previousProdReleaseId);
      if (old && old.sealed && old.manifestVerified && !old.pruning) requiredIds.push(old._id);
    }
  }
  const inputReleaseIds = [...new Set(requiredIds)];
  // Durable references, rather than expiring leases, protect pending and ready data.
  for (const id of previous?.inputReleaseIds ?? []) if (!inputReleaseIds.includes(id)) await changePin(ctx, id, locale, { required: false });
  for (const id of inputReleaseIds) await changePin(ctx, id, locale, { required: true });
  if (!changed && !force && previous?.phase === "complete") return false;
  const revision = (previous?.revision ?? 0) + (changed || force ? 1 : 0);
  const key = changed || force || !previous ? JSON.stringify([DERIVED_VERSION, fingerprint, revision]) : previous.key;
  let added = 0;
  for (const pointer of pointers) {
    const old = previous?.pointers.find((p) => p.distro === pointer.distro);
    if (changed && old?.releaseId !== pointer.releaseId || force || !previous || versionChanged) {
      added += await enqueueReleaseScans(ctx, locale, pointer.releaseId, key);
      if (old && old.releaseId !== pointer.releaseId) added += await enqueueReleaseScans(ctx, locale, old.releaseId, key);
    }
  }
  if (changed) for (const old of previous?.pointers ?? []) {
    if (!pointers.some((p) => p.distro === old.distro)) added += await enqueueReleaseScans(ctx, locale, old.releaseId, key);
  }
  const priorJob = previous?.jobId ? await ctx.db.system.get(previous.jobId) : null;
  const crashed = priorJob?.state.kind === "failed" || priorJob?.state.kind === "canceled";
  const priorLimit = previous?.batchPageLimit ?? DERIVED_BATCH_PAGES;
  const batchPageLimit = crashed ? Math.max(1, Math.floor(priorLimit / 2)) : priorLimit;
  const isolateNext = previous?.isolateNext || (priorJob?.state.kind === "failed" && priorLimit === 1);
  const retry = previous?.phase === "failed";
  const payload = {
    locale, key, fingerprint, revision, pointers: pointers.map(({ distro, releaseId, datasetReleaseId }) => ({ distro, releaseId, datasetReleaseId })), inputReleaseIds,
    phase: ready ? "summaries" as const : "blocked" as const, releaseIndex: 0, cursor: null,
    pendingJobs: (previous?.pendingJobs ?? 0) + added,
    retrying: !changed && !force && retry, retryCursor: !changed && !force && retry ? null : previous?.retryCursor ?? null,
    failedPages: previous?.failedPages ?? 0, batchPageLimit, isolateNext,
    scanned: previous?.scanned ?? 0, recomputed: previous?.recomputed ?? 0, cacheHits: previous?.cacheHits ?? 0,
    skipped: retry ? 0 : previous?.skipped ?? 0, batches: previous?.batches ?? 0,
    lastProgressAt: previous?.lastProgressAt ?? Date.now(), startedAt: previous?.startedAt ?? Date.now(),
    errorSamples: retry ? [] : previous?.errorSamples ?? [], error: ready ? undefined : "DERIVED_RELEASE_NOT_READY",
  };
  if (previous?.jobId && (changed || force || !ready)) await ctx.scheduler.cancel(previous.jobId);
  const buildId = previous?._id ?? await ctx.db.insert("derivedBuilds", payload);
  if (previous) await ctx.db.patch(buildId, payload);
  if (changed || force) {
    for (const release of releases) {
      const oldPointer = previous?.pointers.find((p) => p.distro === release.distro);
      const old = oldPointer ? await ctx.db.get(oldPointer.releaseId) : null;
      await ctx.db.patch(release._id, {
        derivedExpectedKey: key,
        derivedPointers: pointers.map(({ distro, datasetReleaseId }) => ({ distro, datasetReleaseId })),
        ...(!release.derivedCompletedKey && old?.derivedCompletedKey ? { derivedCompletedKey: old.derivedCompletedKey } : {}),
        ...(!release.derivedInitialized && old?.derivedInitialized ? { derivedInitialized: true } : {}),
      });
    }
  }
  if (!ready) { await ctx.db.patch(buildId, { jobId: undefined }); return false; }
  if (!changed && !force && previous?.jobId) {
    const job = await ctx.db.system.get(previous.jobId);
    if (job && ["pending", "inProgress"].includes(job.state.kind)) return true;
  }
  const jobId = await ctx.scheduler.runAfter(0, internal.derived.runBatch, { locale, key });
  await ctx.db.patch(buildId, { jobId });
  return true;
}

export const rebuildActive = internalMutation({
  args: { locale: v.optional(v.string()), force: v.optional(v.boolean()) },
  handler: (ctx, args) => scheduleDerivedBuild(ctx, args.locale ?? "en", args.force ?? false),
});

// A completed one-time signature repair invalidates alias consumers without rescanning bodies/pages.
export async function scheduleDerivedSignatureRefresh(ctx: MutationCtx, releaseId: Id<"datasetReleases">) {
  const release = await ctx.db.get(releaseId);
  if (!release || release.pruning) return false;
  await scheduleDerivedBuild(ctx, release.locale);
  const build = await ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", release.locale)).unique();
  if (!build || build.phase === "blocked" || !build.pointers.some((p) => p.releaseId === releaseId)) return false;
  const revision = build.revision + 1;
  const key = JSON.stringify([DERIVED_VERSION, build.fingerprint, revision]);
  if (build.jobId) await ctx.scheduler.cancel(build.jobId);
  const added = await enqueueScan(ctx, release.locale, releaseId, key, "aliases");
  await ctx.db.patch(build._id, { key, revision, phase: "summaries", pendingJobs: (build.pendingJobs ?? 0) + (added ? 1 : 0),
    retrying: true, retryCursor: null, skipped: 0, error: undefined, errorSamples: [] });
  for (const pointer of build.pointers) await ctx.db.patch(pointer.releaseId, { derivedExpectedKey: key });
  const jobId = await ctx.scheduler.runAfter(0, internal.derived.runBatch, { locale: release.locale, key });
  await ctx.db.patch(build._id, { jobId });
  return true;
}
export const signatureRefresh = internalMutation({
  args: { releaseId: v.id("datasetReleases") },
  handler: (ctx, args) => scheduleDerivedSignatureRefresh(ctx, args.releaseId),
});

export const status = internalQuery({
  args: { locale: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const build = await ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", args.locale ?? "en")).unique();
    if (!build) return { state: "uninitialized" as const, healthy: false };
    const job = build.jobId ? await ctx.db.system.get(build.jobId) : null;
    const crashed = job?.state.kind === "failed" || job?.state.kind === "canceled";
    return { state: crashed ? "failed" : build.phase, healthy: build.phase === "complete" && !build.failedPages && !crashed,
      failedPages: build.failedPages ?? 0, batchPageLimit: build.batchPageLimit ?? DERIVED_BATCH_PAGES,
      key: build.key, pendingJobs: build.pendingJobs ?? 0, scanned: build.scanned ?? 0, recomputed: build.recomputed ?? 0,
      cacheHits: build.cacheHits ?? 0, skipped: build.skipped ?? 0, batches: build.batches ?? 0,
      lastProgressAt: build.lastProgressAt ?? null, error: build.error ?? (crashed ? "SCHEDULED_BATCH_FAILED" : null), errors: build.errorSamples ?? [] };
  },
});

async function physicalPageByName(ctx: QueryCtx, releaseId: Id<"datasetReleases">, name: string, section: string) {
  return ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId).eq("name", name).eq("section", section)).unique();
}
async function pageByName(ctx: QueryCtx, releaseId: Id<"datasetReleases">, name: string, section: string) {
  const seen = new Set<string>();
  let targetPackage: string | undefined;
  for (let depth = 0; depth < 4; depth++) {
    const key = JSON.stringify([name, section]);
    if (seen.has(key)) return null;
    seen.add(key);
    const page = await physicalPageByName(ctx, releaseId, name, section);
    if (page) return !targetPackage || page.sourcePackage === targetPackage ? page : null;
    const alias = await ctx.db.query("manPageAliases").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId).eq("name", name).eq("section", section)).unique();
    if (!alias) return null;
    targetPackage = alias.targetPackage ?? targetPackage;
    name = alias.targetName; section = alias.targetSection;
  }
  return null;
}
async function inputForPage(ctx: MutationCtx, page: Doc<"manPages">) {
  const existing = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", page.releaseId).eq("pageId", page._id)).unique();
  const content = await ctx.db.query("manPageContents").withIndex("by_pageId", (q) => q.eq("pageId", page._id)).first();
  if (!content) {
    const missing = { releaseId: page.releaseId, pageId: page._id, name: page.name, section: page.section,
      contentSha256: page.contentSha256, optionsJson: "[]", truncated: true, signatureHash: `unavailable:${page.contentSha256}`,
      extractorVersion: null, status: "unavailable" as const, error: "DERIVED_CONTENT_UNAVAILABLE" };
    const id = existing?._id ?? await ctx.db.insert("derivedPageInputs", missing);
    if (existing) await ctx.db.replace(id, missing);
    return await ctx.db.get(id);
  }
  const contentBytes = getConvexSize(content) + 1024;
  if (page.optionContentBytes !== contentBytes) await ctx.db.patch(page._id, { optionContentBytes: contentBytes });
  if (existing?.status === "ready" && existing.contentSha256 === page.contentSha256 && (!page.optionSignatureHash || existing.signatureHash === page.optionSignatureHash)) return existing;
  const hydrated = await hydrateCachedSignature(ctx, page, contentBytes);
  if (hydrated || existing) return hydrated ?? existing;
  const id = await ctx.db.insert("derivedPageInputs", { releaseId: page.releaseId, pageId: page._id, name: page.name, section: page.section,
    contentSha256: page.contentSha256, optionsJson: "[]", truncated: true, signatureHash: `unavailable:${page.contentSha256}`,
    extractorVersion: null, status: "unavailable", error: "OPTION_SIGNATURE_UNAVAILABLE" });
  return await ctx.db.get(id);
}
async function storedRow(ctx: QueryCtx, locale: string, distro: Distro, name: string, section: string) {
  return ctx.db.query("manPageDerived").withIndex("by_locale_and_distro_and_name_and_section", (q) => q.eq("locale", locale).eq("distro", distro).eq("name", name).eq("section", section)).unique();
}
async function referencedBy(ctx: QueryCtx, page: Doc<"manPages">) {
  const links = await ctx.db.query("manPageLinks").withIndex("by_releaseId_and_toName_and_toSection", (q) => q.eq("releaseId", page.releaseId).eq("toName", page.name).eq("toSection", page.section)).take(201);
  const unique = [...new Set(links.map((link) => link.fromPageId))].filter((id) => id !== page._id);
  const items: PageRef[] = [];
  for (const id of unique.slice(0, MAX_REFERENCED_BY)) {
    const source = await ctx.db.get(id);
    if (source?.releaseId === page.releaseId) items.push({ name: source.name, section: source.section });
  }
  return { data: { items, hasMore: unique.length > MAX_REFERENCED_BY || links.length > 200 }, reads: links.length + Math.min(unique.length, MAX_REFERENCED_BY) };
}
async function familyForPage(ctx: QueryCtx, page: Doc<"manPages">) {
  const name = ["git", "ip", "openssl"].find((root) => page.name === root || page.name.startsWith(`${root}-`));
  if (!name) return { data: null, reads: 0 };
  const prefix = `${name}-`;
  const pages = await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", page.releaseId).gte("name", prefix).lt("name", prefixUpperBound(prefix))).take(MAX_FAMILY_PAGES + 2);
  const others = pages.filter((p) => p._id !== page._id);
  return { data: { name, items: others.slice(0, MAX_FAMILY_PAGES).map(({ name, section }) => ({ name, section })), hasMore: others.length > MAX_FAMILY_PAGES }, reads: pages.length };
}

async function deleteDetails(ctx: MutationCtx, id: Id<"manPageDerived">) {
  const chunks = await ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", id)).take(65);
  for (const chunk of chunks) await ctx.db.delete(chunk._id);
}
async function discardRow(ctx: MutationCtx, row: Doc<"manPageDerived"> | null, locale: string) {
  if (!row) return;
  await deleteDetails(ctx, row._id);
  await ctx.db.delete(row._id);
  await changePin(ctx, row.releaseId, locale, { rows: -1 });
}
async function saveRow(ctx: MutationCtx, page: Doc<"manPages">, key: string, fingerprint: string, signatureHash: string | undefined, summary: PageDerivedSummary, previous: Doc<"manPageDerived"> | null) {
  let encoded: ReturnType<typeof encodeSummaryParts>;
  try { encoded = encodeSummaryParts(summary); }
  catch (error) {
    if (error instanceof Error && error.message === "DERIVED_SUMMARY_LIMIT") return error.message;
    throw error;
  }
  const { summaryJson, chunks } = encoded;
  if (new TextEncoder().encode(summaryJson).length > MAX_SUMMARY_BYTES) return "DERIVED_SUMMARY_LIMIT";
  const data = { releaseId: page.releaseId, pageId: page._id, locale: page.locale, distro: page.distro, name: page.name, section: page.section,
    sourceContentSha256: page.contentSha256, ...(signatureHash ? { sourceSignatureHash: signatureHash } : {}), dependencyFingerprint: fingerprint, key, summaryJson,
    detailBytes: chunks.reduce((sum, json) => sum + new TextEncoder().encode(json).length + 1024, 0), detailChunkCount: chunks.length };
  const id = previous?._id ?? await ctx.db.insert("manPageDerived", data);
  if (previous) {
    await deleteDetails(ctx, previous._id);
    await ctx.db.replace(previous._id, data);
  }
  for (const [chunkIndex, json] of chunks.entries()) await ctx.db.insert("derivedPortabilityChunks", { releaseId: page.releaseId, derivedId: id, key, chunkIndex, json });
  if (!previous || previous.releaseId !== page.releaseId) {
    if (previous) await changePin(ctx, previous.releaseId, page.locale, { rows: -1 });
    await changePin(ctx, page.releaseId, page.locale, { rows: 1 });
  }
  return null;
}

type ComparisonPlan = { pages: (Doc<"manPages"> | null)[]; aliases: { name: string; section: string }[]; reads: number };
async function processName(ctx: MutationCtx, build: Doc<"derivedBuilds">, name: string, section: string) {
  const pages = await Promise.all(build.pointers.map((p) => pageByName(ctx, p.releaseId, name, section)));
  const comparisons: ComparisonPlan[] = [];
  const allInputs = new Map(pages.filter((p): p is Doc<"manPages"> => p !== null).map((p) => [p._id, p]));
  for (const source of pages) {
    const comparison: ComparisonPlan = { pages: [...pages], aliases: [], reads: 0 };
    if (source?.name === name && source.section === section) {
      const aliases = await ctx.db.query("manPageAliases").withIndex("by_releaseId_and_targetName_and_targetSection", (q) =>
        q.eq("releaseId", source.releaseId).eq("targetName", source.name).eq("targetSection", source.section)).take(8);
      comparison.aliases = aliases.filter(alias => !alias.targetPackage || alias.targetPackage === source.sourcePackage)
        .map(({ name, section }) => ({ name, section }));
      comparison.reads += aliases.length;
      for (const [i, pointer] of build.pointers.entries()) if (!pages[i]) {
        for (const alias of comparison.aliases) {
          comparison.reads += 8; // At most four page/alias hops, counted conservatively.
          const fallback = await pageByName(ctx, pointer.releaseId, alias.name, alias.section);
          if (fallback) { comparison.pages[i] = fallback; allInputs.set(fallback._id, fallback); break; }
        }
      }
    }
    comparisons.push(comparison);
  }
  // Resolve predecessor metadata before any option payload is loaded.
  const histories = new Map<Id<"manPages">, { oldRelease: Doc<"datasetReleases"> | null; oldPage: Doc<"manPages"> | null; compareOptions: boolean }>();
  for (const page of pages) if (page?.name === name && page.section === section) {
    const release = await ctx.db.get(page.releaseId);
    const oldRelease = release?.previousProdReleaseId ? await ctx.db.get(release.previousProdReleaseId) : null;
    const oldPage = oldRelease?.sealed && oldRelease.manifestVerified && !oldRelease.pruning
      ? await physicalPageByName(ctx, oldRelease._id, name, section) : null;
    // Unknown/different extraction or unchanged source cannot produce marks.
    // Do not load (or reserve a guessed maximum for) irrelevant old payloads.
    const compareOptions = !!oldPage && typeof page.optionExtractorVersion === "number" &&
      page.optionExtractorVersion === oldPage.optionExtractorVersion &&
      (oldPage.contentSha256 !== page.contentSha256 || oldPage.sourcePackageVersion !== page.sourcePackageVersion);
    histories.set(page._id, { oldRelease, oldPage, compareOptions });
    if (oldPage && compareOptions) allInputs.set(oldPage._id, oldPage);
  }
  // Older unavailable inputs have no signature length. Learn their actual
  // stored input size under a full-document reservation, without treating the
  // empty failure payload as the size of a future cache repair.
  let deferred = false, metadataChanged = false;
  for (const page of allInputs.values()) {
    if (page.optionInputBytes === undefined && page.optionSignatureBytes === undefined) {
      if (!await fitsBudget(ctx, CHUNK_DOCUMENT_BYTES, 64 * 1024)) { deferred = true; break; }
      const input = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", page.releaseId).eq("pageId", page._id)).unique();
      page.optionInputBytes = input ? new TextEncoder().encode(input.optionsJson).length : 2;
      await ctx.db.patch(page._id, { optionInputBytes: page.optionInputBytes });
      metadataChanged = true;
    }
    if (page.optionContentBytes === undefined) {
      if (!await fitsBudget(ctx, CHUNK_DOCUMENT_BYTES, 64 * 1024)) { deferred = true; break; }
      const content = await ctx.db.query("manPageContents").withIndex("by_pageId", (q) => q.eq("pageId", page._id)).first();
      page.optionContentBytes = content ? getConvexSize(content) + 1024 : 0;
      await ctx.db.patch(page._id, { optionContentBytes: page.optionContentBytes });
      metadataChanged = true;
    }
  }
  const rows = new Map<Distro, Doc<"manPageDerived">>();
  for (const distro of DISTROS) {
    const row = await storedRow(ctx, build.locale, distro, name, section);
    if (row) rows.set(distro, row);
  }
  return { pages, comparisons, histories, rows, allInputs, deferred, metadataChanged };
}

type GroupPlan = Awaited<ReturnType<typeof processName>>;
function signatureBytes(page: Doc<"manPages">) {
  const bytes = page.optionInputBytes ?? page.optionSignatureBytes ?? MAX_SIGNATURE_BYTES;
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= MAX_SIGNATURE_BYTES ? bytes : MAX_BATCH_BYTES + 1;
}
function groupBudget(plan: GroupPlan) {
  let readBytes = 0, writeBytes = 0;
  for (const page of plan.allInputs.values()) {
    const size = signatureBytes(page);
    // Existing input + up to two cache candidates + saveInput reread/return.
    const cacheBytes = page.optionSignatureHash || page.optionExtractorVersion !== undefined
      ? page.optionSignatureBytes ?? MAX_SIGNATURE_BYTES : 0;
    readBytes += size + cacheBytes * 4 + (page.optionContentBytes ?? UNKNOWN_CONTENT_BYTES) + 16 * 1024;
    writeBytes += cacheBytes * 2 + 16 * 1024; // possible cache hydration and page metadata
  }
  for (const page of plan.pages) if (page) {
    // New detail JSON is smaller than twice the source signature, including
    // the bounded 64 chunk documents and the compact main summary.
    const size = signatureBytes(page);
    // Every packed option occupies at least 16 bytes; do not reserve 64 chunk
    // documents for small manuals that can only produce one.
    const chunkCount = Math.min(64, Math.ceil(size / (16 * 128)));
    writeBytes += size * 2 + chunkCount * 1024 + MAX_SUMMARY_BYTES;
  }
  for (const row of plan.rows.values()) {
    readBytes += row.detailBytes ?? MAX_BATCH_BYTES + 1;
    writeBytes += row.detailBytes ?? MAX_BATCH_BYTES + 1; // old deletes/ownership patches
  }
  return { readBytes, writeBytes };
}
async function fitsBudget(ctx: MutationCtx, readBytes: number, writeBytes: number) {
  const metrics = await ctx.meta.getTransactionMetrics();
  return metrics.bytesRead.used + readBytes <= MAX_BATCH_BYTES && metrics.bytesWritten.used + writeBytes <= MAX_BATCH_BYTES;
}

// Older rows have no size metadata. Drain a bounded number of <=1 MiB
// documents before replacing them, instead of guessing and bulk-reading them.
// The same path clears oversized-page output without loading its inputs.
async function prepareDetails(ctx: MutationCtx, plan: GroupPlan, discard: boolean) {
  let changed = false;
  for (const [distro, row] of plan.rows) {
    if (row.detailBytes !== undefined && row.detailChunkCount === 0) continue;
    if (row.detailBytes !== undefined && !row.cleanupPending && !discard) continue;
    const metrics = await ctx.meta.getTransactionMetrics();
    const available = Math.min(MAX_BATCH_BYTES - metrics.bytesRead.used, MAX_BATCH_BYTES - metrics.bytesWritten.used) - 64 * 1024;
    const limit = Math.min(4, Math.floor(available / CHUNK_DOCUMENT_BYTES));
    if (limit < 1) return { ready: false, changed };
    changed = true;
    await ctx.db.patch(row._id, { cleanupPending: true, dependencyFingerprint: undefined });
    const chunks = await ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", row._id)).take(limit);
    for (const chunk of chunks) await ctx.db.delete(chunk._id);
    if (chunks.length === limit) return { ready: false, changed };
    // Keep the parent hidden until saveRow replaces its summary and chunks
    // together. Another distro in this logical group may still need cleanup.
    const ready = { ...row, detailBytes: 0, detailChunkCount: 0, cleanupPending: true, dependencyFingerprint: undefined };
    await ctx.db.patch(row._id, { detailBytes: 0, detailChunkCount: 0, cleanupPending: true, dependencyFingerprint: undefined });
    plan.rows.set(distro, ready);
  }
  return { ready: true, changed };
}
async function admitGroup(ctx: MutationCtx, plan: GroupPlan, processed: number, isolate: boolean) {
  const initial = groupBudget(plan);
  const oversized = initial.readBytes > MAX_BATCH_BYTES || initial.writeBytes > MAX_BATCH_BYTES || isolate;
  if (processed && (oversized || !await fitsBudget(ctx, initial.readBytes, initial.writeBytes))) return { defer: true };
  const preparation = await prepareDetails(ctx, plan, oversized);
  if (!preparation.ready) return { defer: true };
  const ready = groupBudget(plan);
  if (isolate) return { defer: false, error: "DERIVED_TRANSACTION_LIMIT" };
  if (ready.readBytes > MAX_BATCH_BYTES || ready.writeBytes > MAX_BATCH_BYTES) return { defer: false, error: "DERIVED_GROUP_INPUT_LIMIT" };
  if (!await fitsBudget(ctx, ready.readBytes, ready.writeBytes)) {
    if (processed || preparation.changed || plan.metadataChanged) return { defer: true };
    // A fresh transaction still cannot fit this name. Clear obsolete output
    // before isolating it, instead of repeating the same failing workload.
    const cleanup = await prepareDetails(ctx, plan, true);
    if (!cleanup.ready || cleanup.changed) return { defer: true };
    return { defer: false, error: "DERIVED_GROUP_INPUT_LIMIT" };
  }
  return { defer: false };
}

async function retryPage(ctx: MutationCtx, locale: string, distro: Distro, name: string, section: string, failure?: { releaseId: Id<"datasetReleases">; error: string }) {
  const key = JSON.stringify([distro, name, section]);
  const previous = await ctx.db.query("derivedRetryPages").withIndex("by_locale_and_key", (q) => q.eq("locale", locale).eq("key", key)).unique();
  if (!failure) { if (previous) await ctx.db.delete(previous._id); return previous ? -1 : 0; }
  const data = { locale, key, distro, name, section, ...failure };
  if (!previous) { await ctx.db.insert("derivedRetryPages", data); return 1; }
  if (previous.releaseId !== failure.releaseId || previous.error !== failure.error) await ctx.db.replace(previous._id, data);
  return 0;
}

async function processGroup(ctx: MutationCtx, build: Doc<"derivedBuilds">, pages: (Doc<"manPages"> | null)[], name: string, section: string, plan: GroupPlan, forcedError?: string) {
  const { comparisons } = plan;
  const estimate = groupBudget(plan);
  if (forcedError || estimate.readBytes > MAX_BATCH_INPUT_BYTES || estimate.writeBytes > MAX_BATCH_INPUT_BYTES) {
    let retryDelta = 0, skipped = 0;
    // Admission already drained output within its own budget. Removed pages,
    // aliases and retired distros also lose their obsolete row ownership.
    for (const row of plan.rows.values()) await discardRow(ctx, row, build.locale);
    for (const distro of DISTROS) {
      const index = build.pointers.findIndex((p) => p.distro === distro);
      const page = index < 0 ? null : pages[index];
      if (page?.name === name && page.section === section) {
        skipped++; retryDelta += await retryPage(ctx, build.locale, distro, name, section, { releaseId: page.releaseId, error: forcedError ?? "DERIVED_GROUP_INPUT_LIMIT" });
      } else retryDelta += await retryPage(ctx, build.locale, distro, name, section);
    }
    return { recomputed: 0, cacheHits: 0, skipped, reads: 0, errors: [{ name, section, code: forcedError ?? "DERIVED_GROUP_INPUT_LIMIT" }], retryDelta };
  }
  const inputs = await Promise.all(pages.map((page) => page ? inputForPage(ctx, page) : null));
  const inputMemo = new Map(pages.flatMap((page, i) => page ? [[page._id, inputs[i]] as const] : []));
  const variants = build.pointers.flatMap((p, i) => pages[i] ? [{ distro: p.distro, datasetReleaseId: p.datasetReleaseId, contentSha256: pages[i]!.contentSha256 }] : []);
  let recomputed = 0, cacheHits = 0, skipped = 0, reads = 0, retryDelta = 0;
  const errors: { name: string; section: string; code: string }[] = [];
  for (const distro of DISTROS) if (!build.pointers.some((p) => p.distro === distro)) {
    const stale = plan.rows.get(distro) ?? null;
    await discardRow(ctx, stale, build.locale);
    retryDelta += await retryPage(ctx, build.locale, distro, name, section);
  }
  for (const [index, pointer] of build.pointers.entries()) {
    const page = pages[index];
    const prior = plan.rows.get(pointer.distro) ?? null;
    if (!page || page.name !== name || page.section !== section) {
      retryDelta += await retryPage(ctx, build.locale, pointer.distro, name, section);
      await discardRow(ctx, prior, build.locale);
      continue;
    }
    const input = inputs[index];
    if (input?.status !== "ready") {
      const code = input?.error ?? "OPTION_SIGNATURE_UNAVAILABLE";
      skipped++; errors.push({ name, section, code });
      retryDelta += await retryPage(ctx, build.locale, pointer.distro, name, section, { releaseId: page.releaseId, error: code });
      // An unavailable input cannot validate an older row, even when its raw source
      // hash happens to match. Keeping it would both misstate freshness and pin its
      // previous owning release indefinitely through later promotions/rollbacks.
      await discardRow(ctx, prior, build.locale);
      continue;
    }
    const comparison = comparisons[index];
    const comparisonInputs: (Doc<"derivedPageInputs"> | null)[] = [];
    for (const peerPage of comparison.pages) {
      if (!peerPage) { comparisonInputs.push(null); continue; }
      if (!inputMemo.has(peerPage._id)) inputMemo.set(peerPage._id, await inputForPage(ctx, peerPage));
      comparisonInputs.push(inputMemo.get(peerPage._id) ?? null);
    }
    reads += comparison.reads;
    const peers = build.pointers.map((pointer, i) => ({ distro: pointer.distro, pagePresent: comparison.pages[i] !== null,
      options: comparisonInputs[i]?.status === "ready" ? decodeOptions(comparisonInputs[i]!.optionsJson) : [],
      inputAvailable: comparisonInputs[i]?.status === "ready", truncated: comparisonInputs[i]?.extractorVersion == null }));
    const peerBasis = build.pointers.map((p, i) => [p.distro, comparison.pages[i]?.contentSha256 ?? null, comparison.pages[i]?.sourcePackageVersion ?? null,
      comparisonInputs[i]?.signatureHash ?? null, comparisonInputs[i]?.extractorVersion ?? null, comparisonInputs[i]?.status ?? "unavailable"]);
    const semanticName = name === "bsdtar" && section === "1" && comparison.aliases.some((a) => a.name === "tar" && a.section === "1") ? "tar" : name;
    const options = decodeOptions(input.optionsJson);
    const { oldRelease, oldPage, compareOptions } = plan.histories.get(page._id)!;
    if (oldPage && compareOptions && !inputMemo.has(oldPage._id)) inputMemo.set(oldPage._id, await inputForPage(ctx, oldPage));
    const oldInput = oldPage && compareOptions ? inputMemo.get(oldPage._id) ?? null : null;
    const comparable = oldPage && oldInput?.status === "ready" && typeof input.extractorVersion === "number" && input.extractorVersion === oldInput.extractorVersion &&
      (oldPage.contentSha256 !== page.contentSha256 || oldPage.sourcePackageVersion !== page.sourcePackageVersion);
    // A version migration must not preserve marks computed by older inference
    // rules after their predecessor was already lost to historical pruning.
    const history = prior?.releaseId === page.releaseId && !oldRelease && prior.key.startsWith(`[${DERIVED_VERSION},`) ? decodeSummary(prior.summaryJson) : null;
    const newIn = comparable ? newInOptions(options, decodeOptions(oldInput.optionsJson)).map((o) => ({ ...o, datasetReleaseId: page.datasetReleaseId, packageVersion: page.sourcePackageVersion ?? null })) : history?.newIn ?? [];
    const refs = await referencedBy(ctx, page);
    const family = await familyForPage(ctx, page);
    reads += refs.reads + family.reads;
    const fingerprint = await storedPayloadDigest(JSON.stringify([DERIVED_VERSION, semanticName, peerBasis, page.sourcePackage ?? null, page.sourcePackageVersion ?? null, page.verifiedFlagUsage ?? [], refs.data, family.data, newIn]));
    if (prior?.dependencyFingerprint === fingerprint) {
      retryDelta += await retryPage(ctx, build.locale, pointer.distro, name, section);
      cacheHits++;
      if (prior.releaseId !== page.releaseId || prior.pageId !== page._id) {
        await ctx.db.patch(prior._id, { releaseId: page.releaseId, pageId: page._id });
        const chunks = await ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", prior._id)).take(65);
        for (const chunk of chunks) await ctx.db.patch(chunk._id, { releaseId: page.releaseId });
        await changePin(ctx, prior.releaseId, build.locale, { rows: -1 }); await changePin(ctx, page.releaseId, build.locale, { rows: 1 });
      }
      continue;
    }
    const summary: PageDerivedSummary = { version: 1, variants, variantGroups: variantGroups(variants),
      portability: buildOptionPortability(options, peers, [...DISTROS], { name: semanticName, section, distro: page.distro }),
      newIn, previousDatasetReleaseId: oldRelease?.datasetReleaseId ?? history?.previousDatasetReleaseId ?? null,
      mostUsed: rankFlags(options, page.verifiedFlagUsage ?? []), referencedBy: refs.data, family: family.data,
      package: page.sourcePackage ? { name: page.sourcePackage, version: page.sourcePackageVersion ?? null } : null };
    const error = await saveRow(ctx, page, build.key, fingerprint, input.signatureHash, summary, prior);
    if (error) {
      skipped++; errors.push({ name, section, code: error });
      retryDelta += await retryPage(ctx, build.locale, pointer.distro, name, section, { releaseId: page.releaseId, error });
      await discardRow(ctx, prior, build.locale);
    } else {
      recomputed++; retryDelta += await retryPage(ctx, build.locale, pointer.distro, name, section);
    }
  }
  return { recomputed, cacheHits, skipped, reads, errors, retryDelta };
}

// Internal keyset cursors let byte-aware batches stop without losing the unprocessed suffix.
async function scanPages(ctx: QueryCtx, releaseId: Id<"datasetReleases">, cursor: string | null, kind: "pages" | "aliases", limit: number) {
  const table = kind === "pages" ? "manPages" : "manPageAliases";
  if (!cursor) return ctx.db.query(table).withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId)).take(limit + 1);
  const [name, section] = JSON.parse(cursor) as [string, string];
  const tail = await ctx.db.query(table).withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId).eq("name", name).gt("section", section)).take(limit + 1);
  if (tail.length < limit + 1) tail.push(...await ctx.db.query(table).withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId).gt("name", name)).take(limit + 1 - tail.length));
  return tail;
}

async function finishBuild(ctx: MutationCtx, build: Doc<"derivedBuilds">) {
  for (const pointer of build.pointers) {
    const release = await ctx.db.get(pointer.releaseId);
    if (!release || release.pruning) continue;
    const status = await ctx.db.query("derivedReleaseStatus").withIndex("by_releaseId", (q) => q.eq("releaseId", release._id)).unique();
    const initialized = release.derivedInitialized || (status?.readyRows ?? 0) > 0;
    // Completion means every queued name was assessed, not that every input was
    // usable. Failed own-page rows have been removed; healthy rows are fresh while
    // individual failures remain visible in status and the targeted retry queue.
    await ctx.db.patch(release._id, { derivedCompletedKey: build.key, ...(initialized ? { derivedInitialized: true } : {}) });
  }
  await ctx.db.patch(build._id, { phase: build.failedPages ? "failed" : "complete", pendingJobs: 0, retrying: false,
    retryCursor: null, jobId: undefined, error: build.failedPages ? "DERIVED_PAGES_UNAVAILABLE" : undefined, lastProgressAt: Date.now() });
}

export const runBatch = internalMutation({
  args: { locale: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const build = await ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", args.locale)).unique();
    if (!build || build.key !== args.key || build.phase === "complete" || build.phase === "blocked") return { processed: 0, stale: true };
    const limit = build.batchPageLimit ?? DERIVED_BATCH_PAGES;
    const job = await ctx.db.query("derivedScanJobs").withIndex("by_locale", (q) => q.eq("locale", args.locale)).first();
    if (!job) {
      if (!build.retrying) { await finishBuild(ctx, build); return { processed: 0, stale: false }; }
      const retries = build.retryCursor ? await ctx.db.query("derivedRetryPages")
        .withIndex("by_locale_and_key", (q) => q.eq("locale", args.locale).gt("key", build.retryCursor!)).take(limit + 1)
        : await ctx.db.query("derivedRetryPages").withIndex("by_locale_and_key", (q) => q.eq("locale", args.locale)).take(limit + 1);
      let processed = 0, recomputed = 0, cacheHits = 0, skipped = 0, retryDelta = 0, reads = 0;
      const errors = [...(build.errorSamples ?? [])];
      for (const retry of retries.slice(0, limit)) {
        const group = await processName(ctx, build, retry.name, retry.section);
        if (group.deferred) break;
        if (processed && reads >= MAX_BATCH_RELATION_READS) break;
        const admission = await admitGroup(ctx, group, processed, build.isolateNext === true);
        if (admission.defer) break;
        const result = await processGroup(ctx, build, group.pages, retry.name, retry.section, group, admission.error);
        processed++; reads += result.reads; retryDelta += result.retryDelta;
        recomputed += result.recomputed; cacheHits += result.cacheHits; skipped += result.skipped;
        for (const error of result.errors) if (errors.length < 20) errors.push(error);
      }
      const changes = { scanned: (build.scanned ?? 0) + processed, recomputed: (build.recomputed ?? 0) + recomputed,
        cacheHits: (build.cacheHits ?? 0) + cacheHits, skipped: (build.skipped ?? 0) + skipped,
        failedPages: Math.max(0, (build.failedPages ?? 0) + retryDelta), batches: (build.batches ?? 0) + 1,
        errorSamples: errors, lastProgressAt: Date.now() };
      await ctx.db.patch(build._id, { ...changes, ...(processed ? { isolateNext: false } : {}) });
      if (retries.length <= processed) { await finishBuild(ctx, { ...build, ...changes }); return { processed, stale: false }; }
      if (processed) await ctx.db.patch(build._id, { retryCursor: retries[processed - 1].key });
      const jobId = await ctx.scheduler.runAfter(0, internal.derived.runBatch, args);
      await ctx.db.patch(build._id, { jobId });
      return { processed, stale: false };
    }
    const release = await ctx.db.get(job.releaseId);
    const pages = release && !release.pruning ? await scanPages(ctx, job.releaseId, job.cursor, job.kind, limit) : [];
    let processed = 0, relationReads = 0, recomputed = 0, cacheHits = 0, skipped = 0, retryDelta = 0;
    const errorSamples = [...(build.errorSamples ?? [])];
    for (const page of pages.slice(0, limit)) {
      const group = await processName(ctx, build, page.name, page.section);
      if (group.deferred) break;
      if (processed && relationReads >= MAX_BATCH_RELATION_READS) break;
      const admission = await admitGroup(ctx, group, processed, build.isolateNext === true);
      if (admission.defer) break;
      const result = await processGroup(ctx, build, group.pages, page.name, page.section, group, admission.error);
      processed++; relationReads += result.reads;
      recomputed += result.recomputed; cacheHits += result.cacheHits; skipped += result.skipped; retryDelta += result.retryDelta;
      for (const error of result.errors) if (errorSamples.length < 20) errorSamples.push(error);
    }
    const done = pages.length <= processed;
    if (done) { await ctx.db.delete(job._id); await changePin(ctx, job.releaseId, args.locale, { pending: -1 }); }
    else if (processed) {
      const last = pages[processed - 1];
      await ctx.db.patch(job._id, { cursor: JSON.stringify([last.name, last.section]), scanned: job.scanned + processed });
    }
    let queued = 0;
    if (!release || release.pruning) {
      skipped++; if (errorSamples.length < 20) errorSamples.push({ name: "", section: "", code: "SCAN_RELEASE_UNAVAILABLE" });
      // Legacy pre-pin pruning may have removed a scan source; reconstruct from current pointers.
      for (const pointer of build.pointers) queued += await enqueueReleaseScans(ctx, args.locale, pointer.releaseId, build.key);
    }
    await ctx.db.patch(build._id, { ...(processed ? { isolateNext: false } : {}), pendingJobs: Math.max(0, (build.pendingJobs ?? 0) + queued - (done ? 1 : 0)), scanned: (build.scanned ?? 0) + processed,
      recomputed: (build.recomputed ?? 0) + recomputed, cacheHits: (build.cacheHits ?? 0) + cacheHits, skipped: (build.skipped ?? 0) + skipped,
      failedPages: Math.max(0, (build.failedPages ?? 0) + retryDelta),
      batches: (build.batches ?? 0) + 1, lastProgressAt: Date.now(), errorSamples, error: skipped ? "DERIVED_PAGES_UNAVAILABLE" : build.error });
    const jobId = await ctx.scheduler.runAfter(0, internal.derived.runBatch, args);
    await ctx.db.patch(build._id, { jobId });
    return { processed, stale: false };
  },
});

// Compatibility for previously queued v1 actions: never accept caller-owned progress.
export const failBuild = internalMutation({
  args: { locale: v.string(), key: v.string(), error: v.string() },
  handler: async (ctx, args) => {
    const build = await ctx.db.query("derivedBuilds").withIndex("by_locale", (q) => q.eq("locale", args.locale)).unique();
    if (build?.key === args.key) await ctx.db.patch(build._id, { phase: "failed", error: args.error, jobId: undefined });
  },
});

export const setVerifiedFlagUsage = internalMutation({
  args: { pageId: v.id("manPages"), usage: v.array(v.object({ flag: v.string(), count: v.number(), source: v.union(v.literal("examples"), v.literal("tldr")) })) },
  handler: async (ctx, args) => {
    if (args.usage.length > 256 || args.usage.some((item) => !Number.isSafeInteger(item.count) || item.count < 1 || item.flag.length > 80)) throw new Error("INVALID_VERIFIED_FLAG_USAGE");
    const page = await ctx.db.get(args.pageId);
    if (!page) throw new Error("PAGE_NOT_FOUND");
    const release = await ctx.db.get(page.releaseId);
    if (!release || release.pruning) throw new Error("RELEASE_NOT_AVAILABLE");
    await ctx.db.patch(page._id, { verifiedFlagUsage: args.usage });
    const input = await inputForPage(ctx, page);
    const row = await storedRow(ctx, page.locale, page.distro, page.name, page.section);
    if (row && row.releaseId === page.releaseId && row.pageId === page._id && input?.status === "ready" && row.sourceContentSha256 === page.contentSha256) {
      const summary = decodeSummary(row.summaryJson);
      summary.mostUsed = rankFlags(decodeOptions(input.optionsJson), args.usage);
      await ctx.db.patch(row._id, { summaryJson: encodeSummary(summary), dependencyFingerprint: undefined });
    }
  },
});
