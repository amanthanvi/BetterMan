import { ConvexError, v, type Infer } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import { distroValidator } from './schema';
import { requireActiveRelease } from './_releaseLookups';
import { PUBLIC_DATASET_STAGE } from './lib';
import { flagTakesArgument, optionArgumentOptional, flagAllowsShortEquals } from './_optionFlags';
import { parseShell, ShellParseError, type ShellToken } from './_shellParser';
import { destructiveSignals } from './_destructive';
import { COMMAND_FAMILIES, IP_OBJECTS, commandSection, manualCommandName } from './_commandConventions';
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
  let parsed: ReturnType<typeof parseShell>;
  try { parsed = parseShell(args.cmd); } catch (error) {
    if (error instanceof ShellParseError) throw new ConvexError({code: error.code});
    throw error;
  }
  const release = await requireActiveRelease(ctx, { stage: PUBLIC_DATASET_STAGE, distro: args.distro });
  // Both probes and returned documents are bounded; reserve each query's maximum
  // before issuing it so even multi-row lookups cannot exceed 66 total reads.
  let lookups = 0, remaining = 64, limited = false;
  const cache = new Map<string, unknown>();
  async function read<T>(key: string, maximum: number, fn: () => Promise<T>): Promise<T | null> {
    if (limited) return null;
    if (cache.has(key)) return cache.get(key) as T;
    if (lookups++ >= 64 || remaining < maximum) {
      limited = true;
      if (!parsed.diagnostics.includes('Resolution lookup limit reached')) parsed.diagnostics.push('Resolution lookup limit reached');
      return null;
    }
    const value = await fn();
    remaining -= Array.isArray(value) ? value.length : value === null ? 0 : 1;
    cache.set(key, value); return value;
  }
  const pageRef = (page: { name: string; section: string }) => ({ name: page.name, section: page.section, distro: args.distro });
  async function pageFor(name: string): Promise<Doc<'manPages'> | null> {
    if (!/^[A-Za-z0-9_.+-]+$/.test(name)) return null;
    const pages = await read(`page:${name}`, 3, () => ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', release._id).eq('name', name)).take(3));
    const page = pages?.find(p => commandSection(p.section));
    if (page) return page;
    // A single alias hop, within the same release, never a chain or a corpus scan.
    const aliases = await read(`alias:${name}`, 3, () => ctx.db.query('manPageAliases').withIndex('by_releaseId_and_name', q => q.eq('releaseId', release._id).eq('name', name)).take(3));
    const alias = aliases?.find(a => commandSection(a.section));
    return alias ? await read(`target:${alias.targetName}:${alias.targetSection}`, 1, () => ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', release._id).eq('name', alias.targetName).eq('section', alias.targetSection)).first()) : null;
  }
  async function option(page: Doc<'manPages'>, flag: string) {
    return await read(`flag:${page._id}:${flag}`, 1, () => ctx.db.query('manPageOptionFlags').withIndex('by_pageId_and_flag', q => q.eq('pageId', page._id).eq('flag', flag)).first());
  }
  async function shellReference(token: ShellToken, relation: string) {
    if(token.replacement) return null; // find/xargs substitution is not shell expansion.
    const syntax = token.kind === 'redirect' || token.kind === 'redirectTarget' ? 'redirect'
      : token.kind === 'operator' ? (/[<>]/.test(token.value) ? 'redirect' : token.value.includes('|') && !token.value.includes('||') ? 'pipeline' : /[()]/.test(token.value) ? 'subshell' : 'list')
      : token.kind === 'assignment' ? 'assignment' : token.kind === 'glob' ? 'glob'
      : token.dynamic ? (/^[<>]\(/.test(token.text) ? 'processSubstitution' : token.text.includes('$(') || token.text.includes('`') ? 'substitution' : 'expansion')
      : /['"\\]/.test(token.text) ? 'quoting' : relation === 'substitution' && token.kind === 'command' ? 'substitution' : null;
    if (!syntax) return null;
    const rows = await read(`shell:${syntax}`, 4, () => ctx.db.query('manPageSymbols').withIndex('by_releaseId_and_termNorm', q => q.eq('releaseId', release._id).eq('termNorm', `shell:${syntax}`.toLowerCase())).take(4));
    const row = rows?.find(row => row.kind === 'shell' && row.name === 'bash' && row.section === '1');
    if (row) return { page: pageRef(row), anchor: row.anchorId || null, excerpt: row.excerpt };
    const bash = await pageFor('bash');
    return bash ? { page: pageRef(bash), anchor: null, excerpt: `Shell ${syntax}; section anchor unavailable in this release.` } : null;
  }
  const stages: Explanation['stages'] = [];
  const uncertainStages = new Set<number>();
  const safetyContexts = new Map<number, {stage: typeof parsed.stages[number]; tokens: Explanation['stages'][number]['tokens']; command: string}>();
  for (const stage of parsed.stages) {
    if (!stage.tokens.length) continue;
    let page: Doc<'manPages'> | null = null;
    const commandIndex = stage.tokens.findIndex(t => t.kind === 'command');
    if (commandIndex >= 0) page = await pageFor(manualCommandName(stage.tokens[commandIndex].value) ?? '');
    if(page?.name === 'find' && ['freebsd','macos'].includes(args.distro)) {
      const argv=stage.tokens.slice(commandIndex+1);
      let i=0; while(['-H','-L','-P'].includes(argv[i]?.value)) i++;
      if(!argv[i] || argv[i].value.startsWith('-')) parsed.diagnostics.push('find requires an explicit root on this distro');
    }
    const commandPage = page;
    let subcommandIndex = -1;
    let subcommandRow: Doc<'manPageSymbols'> | null = null;
    let candidateIndex = commandIndex + 1;
    while (page && COMMAND_FAMILIES.has(page.name) && candidateIndex < stage.tokens.length) {
      const token = stage.tokens[candidateIndex];
      if (!['word','expansion'].includes(token.kind) || !token.value.startsWith('-')) break;
      let row = await option(page, token.value.split('=', 1)[0]);
      let attached = false;
      if(!row && /^-[^-].+/.test(token.value)) {
        const prefix = token.value.slice(0,2);
        if(token.replacement && prefix.includes(token.replacement.marker)) break;
        const short = await option(page,prefix);
        if(short && (short.takesArgument ?? flagTakesArgument(short.flags))) {row=short;attached=true;}
      }
      if (!row) break;
      if(token.value.includes('=') && !token.value.startsWith('--') && !flagAllowsShortEquals(row.flags,row.flag)) break;
      candidateIndex += (row.takesArgument ?? flagTakesArgument(row.flags)) && !optionArgumentOptional(row,page.name) && !token.value.includes('=') && !attached ? 2 : 1;
    }
    const next = stage.tokens[candidateIndex];
    const family = page && COMMAND_FAMILIES.has(page.name) ? page.name : null;
    let unknownSubcommand = -1;
    if (page && family && next?.kind === 'word' && /^[a-z][a-z0-9-]*$/.test(next.value)) {
      const literal = `${family} ${next.value}`;
      const lookupSymbol = (term: string) => read(`sub:${term}`, 4, () => ctx.db.query('manPageSymbols').withIndex('by_releaseId_and_termNorm', q => q.eq('releaseId', release._id).eq('termNorm', term)).take(4));
      let rows = await lookupSymbol(literal);
      const verb = family === 'ip' ? IP_OBJECTS[next.value] ?? next.value : next.value;
      if (!rows?.length && verb !== next.value) rows = await lookupSymbol(`${family} ${verb}`);
      const row = rows?.find(row => row.kind === 'subcommand' && commandSection(row.section) && row.name === `${family}-${verb}`)
        ?? rows?.find(row => row.kind === 'subcommand' && commandSection(row.section));
      let subpage: Doc<'manPages'> | null = null;
      if (row) subpage = await read(`id:${row.pageId}`, 1, () => ctx.db.get(row.pageId));
      // Exact names only, only for known families, and only without symbol rows.
      else if (rows && !rows.length) {
        const names = [...new Set([next.value, verb])];
        for (const name of names) {
          const pages = await read(`subpage:${family}-${name}`, 3, () => ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId', release._id).eq('name', `${family}-${name}`)).take(3));
          subpage = pages?.find(p => commandSection(p.section)) ?? null;
          if (subpage) break;
        }
      }
      if (subpage && subpage.releaseId === release._id) { page = subpage; subcommandIndex = candidateIndex; subcommandRow = row ?? null; }
      else unknownSubcommand = candidateIndex;
    }
    const tokens: Infer<typeof tokenValidator>[] = [];
    let pending: Doc<'manPageOptionFlags'> | null = null, ended = false;
    for (let i = 0; i < stage.tokens.length; i++) {
      const token = stage.tokens[i], shell = await shellReference(token, stage.relation);
      const currentPage = subcommandIndex >= 0 && i < subcommandIndex ? commandPage : page;
      let replacementSource: Explanation['stages'][number]['tokens'][number] | undefined;
      if(token.replacement) {
        let parent=stage.parent;
        while(parent!==null) {
          const context=safetyContexts.get(parent);
          if(!context) break;
          if(context.command===token.replacement.source) {
            replacementSource=context.tokens.find(t=>t.kind==='option' && (context.command==='find' ? ['-exec','-execdir'].includes(t.value) : ['-I','-i','--replace'].includes(t.value)));break;
          }
          parent=context.stage.parent;
        }
      }
      const base = { text: token.text, value: token.value, start: token.start, end: token.end, page: (replacementSource?.page ?? null) as ReturnType<typeof pageRef> | null, anchor: (replacementSource?.anchor ?? null) as string | null, excerpt: token.replacement ? `${token.replacement.source === 'find' ? 'find supplies matched paths' : 'xargs supplies input'} in place of ${token.replacement.marker} within this word at runtime.` : '', takesArgument: null as boolean | null, portability: null, shell };
      if (limited || i === unknownSubcommand || token.kind === 'unknown') { tokens.push({...base, kind: 'unknown'}); continue; }
      if (token.kind === 'command' || i === subcommandIndex) {
        const target = i === subcommandIndex ? page : commandPage;
        tokens.push({ ...base, kind: target ? (i === subcommandIndex ? 'subcommand' : 'command') : 'unknown', page: target ? pageRef(target) : null, excerpt: i === subcommandIndex ? subcommandRow?.excerpt ?? target?.description ?? '' : target?.description ?? '', anchor: i === subcommandIndex ? subcommandRow?.anchorId || null : null });
        continue;
      }
      if (token.kind === 'operator' || token.kind === 'redirect' || token.kind === 'redirectTarget' || token.kind === 'assignment' || token.kind === 'comment') { tokens.push({ ...base, kind: token.kind }); continue; }
      if (pending) {
        tokens.push({ ...base, kind: token.replacement ? 'expansion' : 'optionArgument', page: currentPage ? pageRef(currentPage) : null, anchor: pending.anchorId, excerpt: token.replacement ? `${pending.excerpt ?? pending.flags} ${base.excerpt}` : pending.excerpt ?? pending.flags }); pending = null; continue;
      }
      if (token.value === '--' && !ended) { ended = true; tokens.push({ ...base, kind: 'endOfOptions' }); continue; }
      if(token.dynamic && !token.replacement && token.value.startsWith('-') && !ended) {tokens.push({...base,kind:'unknown'});parsed.diagnostics.push('Runtime replacement in an option cannot be resolved');continue;}
      if (currentPage && !ended && (!token.dynamic || token.replacement) && token.value.startsWith('-') && token.value !== '-') {
        const whole = token.value.split('=', 1)[0];
        const exact = await option(currentPage, whole);
        const entries: Array<{ row: Doc<'manPageOptionFlags'> | null; flag: string; argument: string | null }> = [];
        if (exact) {
          const takes = exact.takesArgument ?? flagTakesArgument(exact.flags);
          const equals = token.value.includes('=');
          const replacementArgument = currentPage.name === 'xargs' && whole === '-I' && equals;
          const stableFlag = !token.replacement || !whole.includes(token.replacement.marker);
          const supported = stableFlag && (!equals || (takes && (token.value.startsWith('--') || flagAllowsShortEquals(exact.flags,whole) || replacementArgument)));
          if(!supported) parsed.diagnostics.push('Unsupported option equals form');
          entries.push({row:supported ? exact : null,flag:supported ? whole : token.value,argument:equals && supported ? token.value.slice(whole.length + (replacementArgument ? 0 : 1)) : null});
        }
        else if (/^-[A-Za-z0-9]/.test(token.value) && !token.value.startsWith('--')) {
          for (let n = 1; n < token.value.length; n++) {
            const flag = `-${token.value[n]}`;
            const changingFlag = token.replacement && token.value.indexOf(token.replacement.marker) <= n;
            const row = changingFlag ? null : await option(currentPage, flag);
            const takes = row && (row.takesArgument ?? flagTakesArgument(row.flags));
            entries.push({ row, flag, argument: takes && n + 1 < token.value.length ? token.value.slice(n + 1) : null });
            if (!row) { if (n + 1 < token.value.length) entries.push({ row: null, flag: token.value.slice(n + 1), argument: null }); break; }
            if (takes) break;
          }
        } else entries.push({ row: null, flag: whole, argument: null });
        for (const { row, flag, argument } of entries) {
          const takes = row ? row.takesArgument ?? flagTakesArgument(row.flags) : null;
          tokens.push({ ...base, kind: row ? 'option' : 'unknown', value: flag, page: row ? pageRef(currentPage) : null, anchor: row?.anchorId ?? null, excerpt: row?.excerpt ?? row?.flags ?? '', takesArgument: takes });
          if (argument !== null) tokens.push({ ...base, kind: token.replacement && argument.includes(token.replacement.marker) ? 'expansion' : 'optionArgument', value: argument, page: pageRef(currentPage), anchor: row?.anchorId ?? null, excerpt: token.replacement ? `${row?.excerpt ?? row?.flags ?? ''} ${base.excerpt}` : row?.excerpt ?? row?.flags ?? '' });
          else if (row && takes && !optionArgumentOptional(row,currentPage.name)) pending = row;
        }
      } else tokens.push({ ...base, kind: token.dynamic ? 'expansion' : token.kind === 'glob' ? 'glob' : 'argument' });
    }
    if (pending) parsed.diagnostics.push(`Missing argument for ${pending.flag}`);
    const uncertain = parsed.diagnostics.length > 0 || tokens.some(token => token.kind === 'unknown') || (stage.parent !== null && uncertainStages.has(stage.parent));
    if (uncertain) uncertainStages.add(stage.id);
    safetyContexts.set(stage.id, {stage,tokens,command: page?.name ?? ''});
    const ancestors = [];
    let parent = stage.parent;
    while (parent !== null) {
      const context = safetyContexts.get(parent);
      if (!context) break;
      ancestors.unshift(context); parent = context.stage.parent;
    }
    const appendedFind = page?.name==='find' && ancestors.some(context=>context.command==='xargs' && !context.tokens.some(token=>token.kind==='option' && ['-I','-i','--replace'].includes(token.value)));
    if(appendedFind) parsed.diagnostics.push('Unsupported find expression with runtime arguments appended by xargs');
    stages.push({ id: stage.id, parent: stage.parent, relation: stage.relation, tokens, destructive: uncertain || appendedFind ? [] : destructiveSignals(stage, tokens, page?.name ?? '', ancestors) });
  }
  const facts = new Set<string>();
  const unknown = parsed.diagnostics.length > 0 || stages.some(stage=>stage.tokens.some(token=>token.kind==='unknown'));
  for(const stage of stages) {
    stage.destructive = stage.destructive.filter(note=>{if(facts.has(note.description)) return false;facts.add(note.description);return true;});
    if(unknown) stage.destructive.forEach(note=>{note.dryRun=null;});
  }
  return { version: 1 as const, input: args.cmd, shareUrl: `/explain?cmd=${encodeURIComponent(args.cmd)}${args.distro === 'debian' ? '' : `&distro=${args.distro}`}`, diagnostics: parsed.diagnostics, stages };
}
