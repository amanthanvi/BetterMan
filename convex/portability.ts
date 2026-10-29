import { v } from "convex/values";
import { query } from "./_generated/server";
import { distroValidator } from "./schema";
import { requireActiveRelease, pageByNameAndSection } from "./_releaseLookups";
import { normalizeName, normalizeSection, PUBLIC_DATASET_STAGE, DISTROS } from "./lib";
import { decodeSummary, PORTABILITY_PAGE_SIZE, type PortabilityDetailRow } from "./_derivedEncoding";

export const getDetails = query({
  args: { distro: distroValidator, name: v.string(), section: v.string(), offset: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const offset = args.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 8192) throw new Error("INVALID_PORTABILITY_OFFSET");
    const release = await requireActiveRelease(ctx, { stage: PUBLIC_DATASET_STAGE, distro: args.distro });
    const page = await pageByNameAndSection(ctx, { releaseId: release._id, name: normalizeName(args.name), section: normalizeSection(args.section) });
    if (!page || (!release.derivedCompletedKey && !release.derivedInitialized)) return null;
    const row = await ctx.db.query("manPageDerived").withIndex("by_locale_and_distro_and_name_and_section", (q) => q.eq("locale", release.locale).eq("distro", args.distro).eq("name", page.name).eq("section", page.section)).unique();
    if (!row || row.sourceContentSha256 !== page.contentSha256 || !page.optionSignatureHash || row.sourceSignatureHash !== page.optionSignatureHash) return null;
    const main = decodeSummary(row.summaryJson);
    const chunkIndex = Math.floor(offset / PORTABILITY_PAGE_SIZE);
    const chunk = await ctx.db.query("derivedPortabilityChunks").withIndex("by_derivedId_and_chunkIndex", (q) => q.eq("derivedId", row._id).eq("chunkIndex", chunkIndex)).unique();
    const rows = chunk?.key === row.key ? (JSON.parse(chunk.json) as PortabilityDetailRow[]).slice(offset % PORTABILITY_PAGE_SIZE) : [];
    const nextOffset = offset + rows.length;
    return { asOf: row.key, stale: row.key !== release.derivedExpectedKey && release.derivedCompletedKey !== release.derivedExpectedKey, distros: [...DISTROS], rows,
      total: main.portability.total, truncated: main.portability.available < main.portability.total,
      nextOffset: rows.length && nextOffset < main.portability.available ? nextOffset : null };
  },
});
