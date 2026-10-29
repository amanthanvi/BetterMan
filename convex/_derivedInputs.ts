import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { normalizeOptions } from "./_derivedModel";
import { encodeOptions } from "./_derivedEncoding";
import { storedPayloadDigest } from "./_storedPayload";

export const MAX_SIGNATURE_BYTES = 700_000;
const cacheKey = (hash: string, version: number | null, signatureHash: string) => `${hash}:${version ?? "unknown"}:${signatureHash}`;

async function saveInput(ctx: MutationCtx, page: Doc<"manPages">, signature: {
  optionsJson: string; signatureHash: string; extractorVersion: number | null;
}) {
  const existing = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", page.releaseId).eq("pageId", page._id)).unique();
  const data = { releaseId: page.releaseId, pageId: page._id, name: page.name, section: page.section,
    contentSha256: page.contentSha256, ...signature, truncated: false, status: "ready" as const };
  if (existing) await ctx.db.replace(existing._id, data);
  else await ctx.db.insert("derivedPageInputs", data);
  await ctx.db.patch(page._id, { optionSignatureHash: signature.signatureHash,
    optionSignatureBytes: new TextEncoder().encode(signature.optionsJson).length,
    ...(signature.extractorVersion !== null ? { optionExtractorVersion: signature.extractorVersion } : {}),
  });
  return ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", page.releaseId).eq("pageId", page._id)).unique();
}

export async function persistPackedSignature(ctx: MutationCtx, pageId: Id<"manPages">, optionsJson: string, extractorVersion: number | null) {
  const page = await ctx.db.get(pageId);
  if (!page) throw new Error("PAGE_NOT_FOUND");
  try {
    if (extractorVersion !== null && (!Number.isSafeInteger(extractorVersion) || extractorVersion < 1)) throw new Error("INVALID_EXTRACTOR_VERSION");
    if (new TextEncoder().encode(optionsJson).length > MAX_SIGNATURE_BYTES) throw new Error("DERIVED_INPUT_LIMIT");
    const raw: unknown = JSON.parse(optionsJson);
    if (!Array.isArray(raw) || raw.some((entry) => !Array.isArray(entry) || entry.length !== 4 || typeof entry[0] !== "string" || !entry[0] || !Array.isArray(entry[1]) || !entry[1].length || entry[1].some((flag: unknown) => typeof flag !== "string" || !flag) || !["none", "required", "optional"].includes(entry[2]) || (entry[3] !== null && typeof entry[3] !== "string"))) throw new Error("INVALID_OPTION_SIGNATURE");
  } catch (error) {
    const code = error instanceof Error && ["DERIVED_INPUT_LIMIT", "INVALID_EXTRACTOR_VERSION"].includes(error.message) ? error.message : "INVALID_OPTION_SIGNATURE";
    return markUnavailableSignature(ctx, pageId, code);
  }
  const signatureHash = await storedPayloadDigest(JSON.stringify([extractorVersion, optionsJson]));
  const key = cacheKey(page.contentSha256, extractorVersion, signatureHash);
  const cached = await ctx.db.query("derivedSignatureCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (!cached) await ctx.db.insert("derivedSignatureCache", { key, contentSha256: page.contentSha256, extractorVersion, signatureHash, optionsJson });
  return saveInput(ctx, page, { optionsJson, signatureHash, extractorVersion });
}

/** JSON null is deliberately not a valid packed signature: preserve failure through the storage action. */
export function packOptionSignature(options: unknown): string {
  if (options !== undefined && options !== null && (!Array.isArray(options) || options.some((option) => !option || typeof option !== "object" || typeof option.flags !== "string" || typeof option.anchorId !== "string" || !option.anchorId))) return "null";
  return encodeOptions(normalizeOptions(options));
}

export async function persistOptionSignature(ctx: MutationCtx, pageId: Id<"manPages">, options: unknown, extractorVersion: number | null) {
  return persistPackedSignature(ctx, pageId, packOptionSignature(options), extractorVersion);
}

/** A malformed derived input must not reject an otherwise valid upstream page batch. */
export async function markUnavailableSignature(ctx: MutationCtx, pageId: Id<"manPages">, error: string) {
  const page = await ctx.db.get(pageId);
  if (!page) throw new Error("PAGE_NOT_FOUND");
  const existing = await ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", page.releaseId).eq("pageId", pageId)).unique();
  const data = { releaseId: page.releaseId, pageId, name: page.name, section: page.section, contentSha256: page.contentSha256,
    optionsJson: "[]", truncated: true, status: "unavailable" as const, error: error.slice(0, 120) };
  if (existing) await ctx.db.replace(existing._id, data);
  else await ctx.db.insert("derivedPageInputs", data);
  // Clearing provenance prevents a cached old signature from reviving this failed input.
  await ctx.db.patch(pageId, { optionSignatureHash: undefined, optionSignatureBytes: undefined, optionExtractorVersion: undefined });
  return ctx.db.query("derivedPageInputs").withIndex("by_releaseId_and_pageId", (q) => q.eq("releaseId", page.releaseId).eq("pageId", pageId)).unique();
}

export async function hydrateCachedSignature(ctx: MutationCtx, page: Doc<"manPages">) {
  // Unknown historical parses cannot share solely by raw roff hash; use exact signature metadata.
  if (page.optionExtractorVersion === undefined && !page.optionSignatureHash) return null;
  if (page.optionSignatureHash) {
    const cached = await ctx.db.query("derivedSignatureCache").withIndex("by_key", (q) => q.eq("key", cacheKey(page.contentSha256, page.optionExtractorVersion ?? null, page.optionSignatureHash!))).unique();
    return cached ? saveInput(ctx, page, { optionsJson: cached.optionsJson, signatureHash: cached.signatureHash, extractorVersion: cached.extractorVersion }) : null;
  }
  const candidates = await ctx.db.query("derivedSignatureCache").withIndex("by_contentSha256_and_extractorVersion", (q) => q.eq("contentSha256", page.contentSha256).eq("extractorVersion", page.optionExtractorVersion ?? null)).take(2);
  const cached = candidates.length === 1 ? candidates[0] : null;
  return cached ? saveInput(ctx, page, { optionsJson: cached.optionsJson, signatureHash: cached.signatureHash, extractorVersion: cached.extractorVersion }) : null;
}
