import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { optionKeys } from "./_optionFlags";

// Same spelling budget as the top-hit brief; bounded sidecars stay below document/transaction limits.
const MAX_FLAGS = 12;
const MAX_CANDIDATES = 16;
type Candidate = Doc<"flagSearchCandidates">["candidates"][number];

export function compareFlagCandidates(a: Candidate, b: Candidate, flags: string[]): number {
  const count = (c: Candidate) => flags.reduce((sum, flag) => sum + (c.usage.find(u => u.flag === flag)?.count ?? 0), 0);
  return count(b) - count(a) || b.popularityScore - a.popularityScore || a.name.localeCompare(b.name) || a.section.localeCompare(b.section);
}

async function verifiedOptions(ctx: MutationCtx, page: Doc<"manPages">) {
  const counts = new Map<string, number>();
  for (const u of page.verifiedFlagUsage ?? []) counts.set(u.flag, (counts.get(u.flag) ?? 0) + u.count);
  const options = new Map<string, { row: Doc<"manPageOptionFlags">; count: number }>();
  for (const [flag, count] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_FLAGS)) {
    const row = await ctx.db.query("manPageOptionFlags").withIndex("by_pageId_and_flag", q => q.eq("pageId", page._id).eq("flag", flag)).first();
    if (!row) continue;
    // Count aliases of the same option together, so verified -x also supports --extract.
    for (const spelling of optionKeys(row.flags)) {
      const previous = options.get(spelling);
      options.set(spelling, { row, count: (previous?.count ?? 0) + count });
    }
  }
  return new Map([...options].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).slice(0, MAX_FLAGS));
}

/** Refresh one page's bounded verified-example candidates, including removed usage. */
export async function syncFlagCandidates(ctx: MutationCtx, page: Doc<"manPages">, previous = page) {
  const options = await verifiedOptions(ctx, page);
  const old = previous === page ? options : await verifiedOptions(ctx, previous);
  const usage = [...options].map(([flag, value]) => ({ flag, count: value.count }));
  for (const flag of new Set([...old.keys(), ...options.keys()])) {
    const existing = await ctx.db.query("flagSearchCandidates").withIndex("by_releaseId_and_flag", q => q.eq("releaseId", page.releaseId).eq("flag", flag)).unique();
    const candidates = (existing?.candidates ?? []).filter(c => c.pageId !== page._id);
    const option = options.get(flag);
    if (option && page.name.length <= 128 && page.section.length <= 16 && option.row.anchorId.length <= 256) candidates.push({
      pageId: page._id, name: page.name, section: page.section, title: page.title.slice(0, 256), description: page.description.slice(0, 512),
      popularityScore: page.popularityScore ?? 0, usage, flags: option.row.flags, anchorId: option.row.anchorId,
    });
    candidates.sort((a, b) => compareFlagCandidates(a, b, [flag]));
    const row = { releaseId: page.releaseId, flag, candidates: candidates.slice(0, MAX_CANDIDATES) };
    if (!candidates.length) { if (existing) await ctx.db.delete(existing._id); }
    else if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("flagSearchCandidates", row);
  }
}
