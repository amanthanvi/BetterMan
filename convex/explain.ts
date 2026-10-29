import { v, type Infer } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import { distroValidator } from './schema';
import { requireActiveRelease } from './_releaseLookups';
import { PUBLIC_DATASET_STAGE, prefixUpperBound } from './lib';
import { flagTakesArgument } from './_optionFlags';
import { parseShell, destructiveSignals, type ShellToken } from './_shellParser';
import type { Doc } from './_generated/dataModel';

const pageObject = v.object({ name: v.string(), section: v.string(), distro: distroValidator });
const pageValidator = v.union(v.null(), pageObject);
const referenceValidator = v.union(v.null(), v.object({ page: pageObject, anchor: v.union(v.null(), v.string()), excerpt: v.string() }));
const tokenValidator = v.object({
  kind: v.union(v.literal('command'), v.literal('subcommand'), v.literal('option'), v.literal('optionArgument'), v.literal('argument'), v.literal('assignment'), v.literal('operator'), v.literal('redirect'), v.literal('redirectTarget'), v.literal('glob'), v.literal('expansion'), v.literal('comment'), v.literal('endOfOptions'), v.literal('unknown')),
  text: v.string(), value: v.string(), start: v.number(), end: v.number(),
  page: pageValidator, anchor: v.union(v.null(), v.string()), excerpt: v.string(),
  takesArgument: v.union(v.null(), v.boolean()), portability: v.null(), shell: referenceValidator,
});
export const explanationValidator = v.object({
  version: v.literal(1), input: v.string(), shareUrl: v.string(), diagnostics: v.array(v.string()),
  stages: v.array(v.object({ id: v.number(), parent: v.union(v.null(), v.number()), relation: v.union(v.literal('list'), v.literal('subshell'), v.literal('substitution'), v.literal('wrapper'), v.literal('exec')),
    tokens: v.array(tokenValidator), destructive: v.array(v.object({ description: v.string(), dryRun: v.union(v.null(), v.string()) })),
  })),
});
export type Explanation = Infer<typeof explanationValidator>;

export const explain = query({
  args: {
    distro: distroValidator,
    cmd: v.string(),
  },
  returns: explanationValidator,
  handler: async (ctx, args) => resolveExplanation(ctx, args),
});

export async function resolveExplanation(ctx: QueryCtx, args: { distro: Doc<'datasetReleases'>['distro']; cmd: string }) {
  const parsed = parseShell(args.cmd);
  const release = await requireActiveRelease(ctx, { stage: PUBLIC_DATASET_STAGE, distro: args.distro });
  // At most 64 indexed lookups, each at most four documents, plus two release reads.
  let lookups = 0;
  const cache = new Map<string, unknown>();
  async function read<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    if (cache.has(key)) return cache.get(key) as T;
    if (lookups++ >= 64) { if (!parsed.diagnostics.includes('Resolution lookup limit reached')) parsed.diagnostics.push('Resolution lookup limit reached'); return null; }
    const value = await fn(); cache.set(key, value); return value;
  }
  const pageRef = (page: { name: string; section: string }) => ({ name: page.name, section: page.section, distro: args.distro });
  async function pageFor(name: string): Promise<Doc<'manPages'> | null> {
    if (!/^[A-Za-z0-9_.+-]+$/.test(name)) return null;
    const pages = await read(`page:${name}`, () => ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', release._id).eq('name', name)).take(3));
    const page = pages?.find(p => p.section === '1' || p.section === '8');
    if (page) return page;
    // A single alias hop, within the same release, never a chain or a corpus scan.
    const aliases = await read(`alias:${name}`, () => ctx.db.query('manPageAliases').withIndex('by_releaseId_and_name', q => q.eq('releaseId', release._id).eq('name', name)).take(3));
    const alias = aliases?.find(a => a.section === '1' || a.section === '8');
    return alias ? await read(`target:${alias.targetName}:${alias.targetSection}`, () => ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', release._id).eq('name', alias.targetName).eq('section', alias.targetSection)).unique()) : null;
  }
  async function option(page: Doc<'manPages'>, flag: string) {
    return await read(`flag:${page._id}:${flag}`, () => ctx.db.query('manPageOptionFlags').withIndex('by_pageId_and_flag', q => q.eq('pageId', page._id).eq('flag', flag)).unique());
  }
  async function shellReference(token: ShellToken, relation: string) {
    const syntax = token.kind === 'redirect' || token.kind === 'redirectTarget' ? 'redirect'
      : token.kind === 'operator' ? (/[<>]/.test(token.value) ? 'redirect' : token.value.includes('|') && !token.value.includes('||') ? 'pipeline' : /[()]/.test(token.value) ? 'subshell' : 'list')
      : token.kind === 'assignment' ? 'assignment' : token.kind === 'glob' ? 'glob'
      : token.dynamic ? (token.text.includes('$(') || token.text.includes('`') ? 'substitution' : 'expansion')
      : /['"\\]/.test(token.text) ? 'quoting' : relation === 'substitution' && token.kind === 'command' ? 'substitution' : null;
    if (!syntax) return null;
    const rows = await read(`shell:${syntax}`, () => ctx.db.query('manPageSymbols').withIndex('by_releaseId_and_termNorm', q => q.eq('releaseId', release._id).eq('termNorm', `shell:${syntax}`)).take(4));
    const row = rows?.find(row => row.kind === 'shell' && row.name === 'bash' && row.section === '1');
    if (row) return { page: pageRef(row), anchor: row.anchorId || null, excerpt: row.excerpt };
    const bash = await pageFor('bash');
    return bash ? { page: pageRef(bash), anchor: null, excerpt: `Shell ${syntax}; section anchor unavailable in this release.` } : null;
  }
  const stages: Explanation['stages'] = [];
  const uncertainStages = new Set<number>();
  for (const stage of parsed.stages) {
    if (!stage.tokens.length) continue;
    let page: Doc<'manPages'> | null = null;
    const commandIndex = stage.tokens.findIndex(t => t.kind === 'command');
    if (commandIndex >= 0) page = await pageFor(stage.tokens[commandIndex].value.split('/').at(-1)!);
    const commandPage = page;
    let subcommandIndex = -1;
    let candidateIndex = commandIndex + 1;
    while (page && candidateIndex < stage.tokens.length) {
      const token = stage.tokens[candidateIndex];
      if (token.kind !== 'word' || !token.value.startsWith('-')) break;
      const row = await option(page, token.value.split('=', 1)[0]);
      if (!row) break;
      candidateIndex += (row.takesArgument ?? flagTakesArgument(row.flags)) && !token.value.includes('=') ? 2 : 1;
    }
    const next = stage.tokens[candidateIndex];
    if (page && next?.kind === 'word' && /^[a-z][a-z0-9-]*$/.test(next.value)) {
      const prefix = `${page.name} ${next.value}`;
      const rows = await read(`sub:${prefix}`, () => ctx.db.query('manPageSymbols').withIndex('by_releaseId_and_termNorm', q => q.eq('releaseId', release._id).gte('termNorm', prefix).lt('termNorm', prefixUpperBound(prefix))).take(4));
      const candidates = rows?.filter(row => row.kind === 'subcommand');
      const row = candidates?.find(row => row.termNorm === prefix) ?? (rows && rows.length < 4 && candidates?.length === 1 ? candidates[0] : null);
      if (row) {
        const subpage = await read(`id:${row.pageId}`, () => ctx.db.get(row.pageId));
        if (subpage && subpage.releaseId === release._id) { page = subpage; subcommandIndex = candidateIndex; }
      } else {
        // Existing releases can resolve hyphenated manuals before symbol ingestion.
        const name = `${page.name}-${next.value}`;
        const pages = await read(`subpage:${name}`, () => ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', release._id).gte('name', name).lt('name', prefixUpperBound(name))).take(4));
        const commands = pages?.filter(p => p.section === '1' || p.section === '8');
        const match = commands?.find(p => p.name === name) ?? (pages && pages.length < 4 && commands?.length === 1 ? commands[0] : null);
        if (match) { page = match; subcommandIndex = candidateIndex; }
      }
    }
    const tokens: Infer<typeof tokenValidator>[] = [];
    let pending: Doc<'manPageOptionFlags'> | null = null, ended = false;
    for (let i = 0; i < stage.tokens.length; i++) {
      const token = stage.tokens[i], shell = await shellReference(token, stage.relation);
      const currentPage = subcommandIndex >= 0 && i < subcommandIndex ? commandPage : page;
      const base = { text: token.text, value: token.value, start: token.start, end: token.end, page: null as ReturnType<typeof pageRef> | null, anchor: null as string | null, excerpt: '', takesArgument: null as boolean | null, portability: null, shell };
      if (token.kind === 'command' || i === subcommandIndex) {
        const target = i === subcommandIndex ? page : commandPage;
        tokens.push({ ...base, kind: target ? (i === subcommandIndex ? 'subcommand' : 'command') : 'unknown', page: target ? pageRef(target) : null, excerpt: target?.description ?? '' });
        continue;
      }
      if (token.kind === 'operator' || token.kind === 'redirect' || token.kind === 'redirectTarget' || token.kind === 'assignment' || token.kind === 'comment') { tokens.push({ ...base, kind: token.kind }); continue; }
      if (pending) {
        tokens.push({ ...base, kind: 'optionArgument', page: currentPage ? pageRef(currentPage) : null, anchor: pending.anchorId, excerpt: pending.excerpt ?? pending.flags }); pending = null; continue;
      }
      if (token.value === '--' && !ended) { ended = true; tokens.push({ ...base, kind: 'endOfOptions' }); continue; }
      if (currentPage && !ended && !token.dynamic && token.value.startsWith('-') && token.value !== '-') {
        const whole = token.value.split('=', 1)[0];
        const exact = await option(currentPage, whole);
        const entries: Array<{ row: Doc<'manPageOptionFlags'> | null; flag: string; argument: string | null }> = [];
        if (exact) {
          const takes = exact.takesArgument ?? flagTakesArgument(exact.flags);
          entries.push({ row: token.value.includes('=') && !takes ? null : exact, flag: whole, argument: token.value.includes('=') ? token.value.slice(whole.length + 1) : null });
        }
        else if (/^-[A-Za-z0-9]/.test(token.value) && !token.value.startsWith('--')) {
          for (let n = 1; n < token.value.length; n++) {
            const flag = `-${token.value[n]}`, row = await option(currentPage, flag);
            const takes = row && (row.takesArgument ?? flagTakesArgument(row.flags));
            entries.push({ row, flag, argument: takes && n + 1 < token.value.length ? token.value.slice(n + 1) : null });
            if (!row) { if (n + 1 < token.value.length) entries.push({ row: null, flag: token.value.slice(n + 1), argument: null }); break; }
            if (takes) break;
          }
        } else entries.push({ row: null, flag: whole, argument: null });
        for (const { row, flag, argument } of entries) {
          const takes = row ? row.takesArgument ?? flagTakesArgument(row.flags) : null;
          tokens.push({ ...base, kind: row ? 'option' : 'unknown', value: flag, page: row ? pageRef(currentPage) : null, anchor: row?.anchorId ?? null, excerpt: row?.excerpt ?? row?.flags ?? '', takesArgument: takes });
          if (argument !== null) tokens.push({ ...base, kind: 'optionArgument', value: argument, page: pageRef(currentPage), anchor: row?.anchorId ?? null, excerpt: row?.excerpt ?? row?.flags ?? '' });
          else if (row && takes && !row.flags.includes('[=')) pending = row;
        }
      } else tokens.push({ ...base, kind: token.dynamic ? 'expansion' : token.kind === 'glob' ? 'glob' : 'argument' });
    }
    if (pending) parsed.diagnostics.push(`Missing argument for ${pending.flag}`);
    const flags = tokens.filter(token => token.kind === 'option').map(token => token.value);
    const uncertain = parsed.diagnostics.length > 0 || tokens.some(token => token.kind === 'unknown') || (stage.parent !== null && uncertainStages.has(stage.parent));
    if (uncertain) uncertainStages.add(stage.id);
    stages.push({ id: stage.id, parent: stage.parent, relation: stage.relation, tokens, destructive: uncertain ? [] : destructiveSignals(stage, flags) });
  }
  return { version: 1 as const, input: args.cmd, shareUrl: `/explain?cmd=${encodeURIComponent(args.cmd)}${args.distro === 'debian' ? '' : `&distro=${args.distro}`}`, diagnostics: parsed.diagnostics, stages };
}
