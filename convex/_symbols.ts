import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

export const MAX_SYMBOLS_PER_PAGE = 256;
export function clipUtf16(text: string, limit: number): string {
  const prefix = text.slice(0, limit);
  return /[\uD800-\uDBFF]$/.test(prefix) ? prefix.slice(0, -1) : prefix;
}
export const symbolInput = v.object({
  term: v.string(), anchorId: v.string(), excerpt: v.string(),
  kind: v.union(v.literal('environment'), v.literal('files'), v.literal('errors'), v.literal('config'), v.literal('subcommand'), v.literal('shell')),
});
export type SymbolInput = { term: string; anchorId: string; excerpt: string; kind: 'environment' | 'files' | 'errors' | 'config' | 'subcommand' | 'shell' };
export async function insertSymbols(ctx: MutationCtx, release: Doc<'datasetReleases'>, pageId: Id<'manPages'>, page: {name: string; section: string; title: string; description: string}, symbols: SymbolInput[]) {
  if (symbols.length > MAX_SYMBOLS_PER_PAGE) throw new Error('TOO_MANY_SYMBOLS');
  const seen = new Set<string>();
  for (const symbol of symbols) {
    if (!symbol.term || symbol.term.length > 120 || symbol.anchorId.length > 160) continue;
    const termNorm = symbol.term.toLowerCase().replace(/=$/, '');
    if (seen.has(termNorm)) continue;
    seen.add(termNorm);
    await ctx.db.insert('manPageSymbols', { ...symbol, excerpt: clipUtf16(symbol.excerpt, 160), termNorm, releaseId: release._id, pageId, name: page.name, section: page.section, title: page.title, description: page.description });
  }
}
