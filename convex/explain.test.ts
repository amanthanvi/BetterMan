/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import schema from './schema';
import reviewFixture from './fixtures/explain-review.json';
import symbolLayouts from '../ingestion/tests/fixtures/symbol-layouts.json';
import { optionFlagRows } from './_optionFlags';
import { insertSymbols, type SymbolInput } from './_symbols';
import { api } from './_generated/api';
const modules = import.meta.glob('./**/*.ts');
const reference = makeFunctionReference<'query'>('explain:explain');

const tar = [
  { flags: '-x, --extract', anchorId: 'extract', description: 'Extract files from an archive.' },
  { flags: '-z, --gzip', anchorId: 'gzip', description: 'Filter the archive through gzip.' },
  { flags: '-v, --verbose', anchorId: 'verbose', description: 'List processed files.' },
  { flags: '-f, --file', anchorId: 'file', argument: 'ARCHIVE', description: 'Use archive file ARCHIVE.' },
  { flags: '-C, --directory', anchorId: 'directory', argument: 'DIR', description: 'Change to directory DIR.' },
];
export async function explainFixture(documentsRead = 258, review = false) {
  const t = convexTest({ schema, modules, transactionLimits: { documentsRead } });
  await t.run(async ctx => {
    for (const distro of ['debian', 'freebsd'] as const) {
      const releaseId = await ctx.db.insert('datasetReleases', { distro, datasetReleaseId: distro, locale: 'en', imageRef: 'fixture', imageDigest: 'fixture', ingestedAt: '2026-10-28', pageCount: 10 });
      await ctx.db.insert('activeReleases', { stage: 'prod', locale: 'en', distro, releaseId, datasetReleaseId: distro, activatedAt: '2026-10-28' });
      const specs = [
        { name: 'tar', section: '1', options: tar },
        { name: 'find', section: '1', options: [
          {flags:'-L',anchorId:'follow'},{flags:'-P',anchorId:'nofollow'},{flags:'-H',anchorId:'commandfollow'}, { flags: '-name', anchorId: 'name', argument: 'PATTERN' }, { flags: '-mtime', anchorId: 'mtime', argument: 'N' },
          { flags: '-print0', anchorId: 'print0' }, { flags: '-delete', anchorId: 'delete' }, { flags: '-exec', anchorId: 'exec', argument: 'COMMAND' },
        ] },
        { name: 'xargs', section: '1', options: [{ flags: '-0', anchorId: 'null' },{flags:'-p, --interactive',anchorId:'prompt'},{flags:'-I',anchorId:'replace',argument:'REPLACE'}] },
        { name: 'rm', section: '1', options: [{ flags: '-f, --force', anchorId: 'force' }, { flags: '-r', anchorId: 'recursive' }, {flags:'-i',anchorId:'interactive'}, {flags:'--one-file-system',anchorId:'filesystem'},{flags:'-I',anchorId:'interactive-once'}, {flags:'--interactive[=WHEN]',anchorId:'interactive-long'}] },
        { name: 'git', section: '1', options: [{ flags: '-C', anchorId: 'chdir', argument: 'DIR' }] },
        { name: 'git-rebase', section: '1', options: [] },
        { name: 'git-commit', section: '1', options: [{ flags: '-m, --message', anchorId: 'message', argument: 'MESSAGE' }] },
        {name:'systemctl', section:'1', options:[]},
        { name: 'ip', section: '8', options: [] }, { name: 'ip-address', section: '8', options: [] }, {name:'ip-addrlabel', section:'8',options:[]},
        {name:'ssh', section:'1',options:[]}, {name:'ssh-add',section:'1',options:[]},
        {name:'openssl',section:'1ssl',options:[]}, {name:'openssl-x509',section:'1ossl',options:[]},
        {name:'cp',section:'1',options:[{flags:'-v',anchorId:'verbose'}]}, {name:'ls',section:'1',options:[{flags:'-n',anchorId:'numeric'}]},
        ...['timeout','nice','nohup','time','command','exec','doas','echo'].map(name=>({name,section:'1',options:[]})),
        {name:'dd',section:'1',options:[]},
        {name:'truncate',section:'1',options:[{flags:'-s, --size',argument:'SIZE',anchorId:'size'}]},
        {name:'mke2fs',section:'8',options:[{flags:'-n',anchorId:'dry-run'}, {flags:'-L',anchorId:'label',argument:'LABEL'}]},
        {name:'shred',section:'1',options:[]},
        {name:'rsync',section:'1',options:[{flags:'-a',anchorId:'archive'},{flags:'--delete',anchorId:'delete'}, {flags:'-n, --dry-run',anchorId:'dry-run'}]},
        {name:'git-clean',section:'1',options:[...['f','n','d','i','x','X'].map(f=>({flags:`-${f}`,anchorId:f})),{flags:'--dry-run',anchorId:'dry'},{flags:'-e',anchorId:'exclude',argument:'PATTERN'}]},
        { name: 'mysql', section: '1', options: [{ flags: '-u, --user', anchorId: 'user', argument: 'USER' }] },
        { name: 'bash', section: '1', options: [] },
        { name: 'sudo', section: '1', options: [{ flags: '-u', anchorId: 'user', argument: 'USER' },{flags:'-i',anchorId:'login'},...['l','v','k','K','e'].map(f=>({flags:`-${f}`,anchorId:`mode-${f}`}))] },
        { name: 'env', section: '1', options: [] },
        { name: 'ssh_config', section: '5', options: [] }, { name: 'systemd.service', section: '5', options: [] },
        { name: 'errno', section: '3', options: [] },
        { name: 'bounded', section: '1', options: Array.from({length: 100}, (_, i) => ({ flags: `--limit${i}`, anchorId: `limit${i}` })) },
      ];
      if(review) for(const page of reviewFixture.pages) {
        if(!specs.some(spec=>spec.name===page.name && spec.section===page.section)) specs.push({...page,options:page.options.map(row=>({...row,argument:row.argument ?? undefined}))});
      }
      const release = (await ctx.db.get(releaseId))!;
      for (const spec of specs) {
        const pageId = await ctx.db.insert('manPages', { name: spec.name, section: spec.section, releaseId, datasetReleaseId: distro, externalId: spec.name, locale: 'en', distro, sitemapPage: 1, title: `${spec.name}(${spec.section})`, description: `Manual for ${spec.name}`, sourcePath: spec.name, contentSha256: spec.name, hasParseWarnings: false });
        await ctx.db.insert('manPageSearchDocuments', { pageId, releaseId, datasetReleaseId: distro, name: spec.name, nameNorm: spec.name, section: spec.section, title: `${spec.name}(${spec.section})`, description: `Manual for ${spec.name}`, descNorm: '', searchText: '', snippetText: '' });
        for (const row of optionFlagRows((review ? reviewFixture.pages.find(page=>page.name===spec.name && page.section===spec.section)?.options : null) ?? spec.options)) await ctx.db.insert('manPageOptionFlags', { ...row, releaseId, pageId, nameNorm: spec.name, section: spec.section, anchorId: `${distro}-${row.anchorId}` });
        const symbols: SymbolInput[] = [];
        if (/^(git|ip|openssl)-/.test(spec.name)) symbols.push({ term: spec.name.replace('-', ' '), anchorId: '', excerpt: `Subcommand ${spec.name}`, kind: 'subcommand' });
        if(spec.name==='git') symbols.push({term:'git commit',anchorId:'commands',excerpt:'Parent command definition',kind:'subcommand'});
        if(spec.name==='systemctl') symbols.push(...symbolLayouts.find(layout=>layout.name==='systemctl')!.symbols.map(row=>({...row,kind:'subcommand' as const})));
        if (spec.name === 'ssh_config') symbols.push({ term: 'ForwardAgent', anchorId: 'ForwardAgent', excerpt: 'Forward authentication agent connections.', kind: 'config' });
        if (spec.name === 'systemd.service') symbols.push({ term: 'ExecStart=', anchorId: 'ExecStart', excerpt: 'Commands executed when this service starts.', kind: 'config' });
        if (spec.name === 'errno') symbols.push({ term: 'ENOSPC', anchorId: 'enospc', excerpt: 'No space left on device.', kind: 'errors' });
        if (spec.name === 'bash') for (const kind of ['pipeline', 'redirect', 'quoting', 'glob', 'substitution', 'subshell', 'list', 'assignment', 'expansion', 'processSubstitution']) symbols.push({ term: `shell:${kind}`, anchorId: `real-${kind}`, excerpt: `Shell ${kind}`, kind: 'shell' });
        if(spec.name==='mke2fs') await ctx.db.insert('manPageAliases',{releaseId,datasetReleaseId:distro,name:'mkfs.ext4',section:'8',targetName:'mke2fs',targetSection:'8'});
        await insertSymbols(ctx, release, pageId, { ...spec, title: `${spec.name}(${spec.section})`, description: `Manual for ${spec.name}` }, symbols);
      }
    }
  });
  return t;
}
const explain = (t: Awaited<ReturnType<typeof explainFixture>>, cmd: string, distro = 'debian') => t.query(reference, { distro, cmd });
describe('bounded explain resolution', () => {
  it('resolves both bake-off commands with argument boundaries, exact anchors and excerpts', async () => {
    const t = await explainFixture(40);
    const archive = await explain(t, 'tar -xzvf backup.tar.gz -C /srv/www');
    expect(archive.stages[0].tokens.filter((t: {kind: string}) => t.kind === 'option').map((t: {anchor: string}) => t.anchor)).toEqual(['debian-extract', 'debian-gzip', 'debian-verbose', 'debian-file', 'debian-directory']);
    expect(archive.stages[0].tokens.filter((t: {kind: string}) => t.kind === 'optionArgument').map((t: {value: string}) => t.value)).toEqual(['backup.tar.gz', '/srv/www']);
    expect(archive.stages[0].tokens[1].excerpt).toBe('Extract files from an archive.');
    const pipeline = await explain(t, "find . -name '*.log' -mtime +7 -print0 | xargs -0 rm -f");
    expect(pipeline.stages.map((s: {tokens: {kind: string;value: string}[]}) => s.tokens.find(t => t.kind === 'command')?.value)).toEqual(['find', 'xargs', 'rm']);
    expect(pipeline.stages[0].tokens.find((t: {value: string}) => t.value === '|').shell.anchor).toBe('real-pipeline');
    expect(pipeline.stages[2].destructive[0].description).toContain('rm deletes files.');
    expect(pipeline.shareUrl).toBe(`/explain?cmd=${encodeURIComponent(pipeline.input)}`);
    expect(pipeline.diagnostics).toEqual([]);
  });
  it('resolves subcommands, distro variants, attached values and real find flags', async () => {
    const t = await explainFixture(30);
    for (const [cmd, name] of [['git commit -m "message"', 'git-commit'], ['ip addr', 'ip-address'], ['openssl x509', 'openssl-x509']]) {
      const result = await explain(t, cmd);
      expect(result.stages[0].tokens.find((t: {kind: string}) => t.kind === 'subcommand').page.name).toBe(name);
    }
    await t.run(async ctx => {
      const active = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q => q.eq('stage', 'prod').eq('locale', 'en').eq('distro', 'debian')).unique();
      await ctx.db.insert('manPageAliases', {releaseId: active!.releaseId, datasetReleaseId: 'debian', name: 'gcommit', section: '1', targetName: 'git-commit', targetSection: '1'});
    });
    expect((await explain(t, 'gcommit -m message')).stages[0].tokens[0].page.name).toBe('git-commit');
    const global = await explain(t, 'git -C /repo commit -m message');
    expect(global.stages[0].tokens.find((t: {value: string}) => t.value === '-C')).toMatchObject({ page: {name: 'git'}, anchor: 'debian-chdir' });
    expect(global.stages[0].tokens.find((t: {kind: string}) => t.kind === 'subcommand').page.name).toBe('git-commit');
    for (const cmd of ['mysql -uroot', 'mysql --user=root']) {
      const result = await explain(t, cmd, 'freebsd');
      expect(result.stages[0].tokens[1]).toMatchObject({ kind: 'option', anchor: 'freebsd-user', takesArgument: true, page: { distro: 'freebsd' } });
      expect(result.stages[0].tokens[2]).toMatchObject({ kind: 'optionArgument', value: 'root' });
    }
    expect((await explain(t, 'find . -name "*.log"')).stages[0].tokens.find((t: {value: string}) => t.value === '-name').anchor).toBe('debian-name');
  });
  it('resolves subcommand manuals in old releases without symbol rows', async () => {
    const t = await explainFixture();
    await t.run(async ctx => { for (const row of await ctx.db.query('manPageSymbols').take(100)) await ctx.db.delete(row._id); });
    for (const cmd of ['git commit -m message', 'ip addr']) {
      expect((await explain(t, cmd)).stages[0].tokens.some((token: {kind: string}) => token.kind === 'subcommand')).toBe(true);
    }
  });
  it('leaves unknowns and unsupported syntax honest, never consumes option-like operands after --', async () => {
    const t = await explainFixture();
    const result = await explain(t, 'missing -f | tar -- -x');
    expect(result.stages[0].tokens[0]).toMatchObject({ kind: 'unknown', page: null });
    expect(result.stages[1].tokens.at(-1)).toMatchObject({ kind: 'argument', value: '-x', anchor: null });
    for (const cmd of ['rm -f=invalid', 'find . -name -delete', 'tar -f --remove-files', 'rm -f --help']) {
      expect((await explain(t, cmd)).stages.flatMap((s: {destructive: unknown[]}) => s.destructive), cmd).toEqual([]);
    }
    const unknown = await explain(t, 'tar -Qxf');
    expect(unknown.stages[0].tokens.filter((t: {kind: string}) => t.kind === 'option')).toEqual([]);
    expect((await explain(t, "rm -rf 'unfinished")).stages[0].destructive).toEqual([]);
  });
  it('bounds long adversarial lines and only uses the production distro pointer', async () => {
    const t = await explainFixture(66);
    const result = await explain(t, 'bounded ' + Array.from({length: 100}, (_, i) => `--limit${i}`).join(' '));
    expect(result.diagnostics).toContain('Resolution lookup limit reached');
    expect(result.stages[0].tokens).toHaveLength(101);
    expect(result.stages[0].tokens.filter((token: {kind: string}) => token.kind === 'option')).toHaveLength(63);
    await expect(t.query(reference, { distro: 'debian', cmd: 'ls', stage: 'staging' })).rejects.toThrow();
    await expect(explain(t, 'x'.repeat(4097))).rejects.toThrow('EXPLAIN_INPUT_TOO_LONG');
  });
});
describe('symbol search and ranking', () => {
  it('returns exact definition anchors without content reads and respects distro and section', async () => {
    const t = await explainFixture(12);
    await t.run(async ctx => {
      const active = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q => q.eq('stage', 'prod').eq('locale', 'en').eq('distro', 'freebsd')).unique();
      const doc = await ctx.db.query('manPageSearchDocuments').withIndex('by_releaseId_and_nameNorm', q => q.eq('releaseId', active!.releaseId).eq('nameNorm', 'errno')).first();
      await ctx.db.patch(doc!._id, {descNorm: 'enospc'});
    });
    for (const [q, name, anchor] of [['ForwardAgent', 'ssh_config', 'ForwardAgent'], ['ExecStart=', 'systemd.service', 'ExecStart'], ['ENOSPC', 'errno', 'enospc'], ['git commit', 'git-commit', '']]) {
      const result = await t.query(api.queries.search, { distro: 'freebsd', q, section: null, limit: 20, offset: 0 });
      expect(result.results[0]).toMatchObject({ name, ...(anchor ? {anchorId: anchor} : {}) });
      expect(result.suggestions).toEqual([]);
    }
    expect((await t.query(api.queries.search, { distro: 'debian', q: 'ForwardAgent', section: '1', limit: 20, offset: 0 })).results).toEqual([]);
  });
  it('caps dense symbol hits at eight rows', async () => {
    const t = await explainFixture(10);
    await t.run(async ctx => {
      const source = await ctx.db.query('manPageSymbols').first();
      const { _id, _creationTime, ...row } = source!; void _id; void _creationTime;
      const page = await ctx.db.get(row.pageId);
      const {_id: id, _creationTime: created, ...fields} = page!; void id; void created;
      for (let i = 0; i < 30; i++) {
        const pageId = await ctx.db.insert('manPages', {...fields, name: `dense${i}`, externalId: `dense${i}`});
        await ctx.db.insert('manPageSymbols', { ...row, pageId, term: 'DENSE', termNorm: 'dense', name: `dense${i}` });
      }
    });
    const result = await t.query(api.queries.search, { distro: 'debian', q: 'DENSE', section: null, limit: 20, offset: 0 });
    expect(result.results).toHaveLength(8);
  });
  it('puts commands before library sections on ties and exact names before their long tail', async () => {
    const t = await explainFixture();
    await t.run(async ctx => {
      const original = await ctx.db.query('manPageSearchDocuments').first();
      const {_id, _creationTime, ...row} = original!;void _id;void _creationTime;
      const originalPage = await ctx.db.get(row.pageId);
      const { _id: pageId, _creationTime: created, ...pageFields } = originalPage!; void pageId; void created;
      for (const [name, section] of [['lookup', '3'], ['lookup', '8'], ['lookup', '1'], ['lookup_tail', '1'], ['lookup-long', '1']]) {
        const pageId = await ctx.db.insert('manPages', { ...pageFields, name, section, externalId: `${name}-${section}` });
        await ctx.db.insert('manPageSearchDocuments', { ...row, pageId, name, nameNorm: name, section, descNorm: '' });
      }
    });
    const result = await t.query(api.queries.search, { distro: 'debian', q: 'lookup', section: null, limit: 20, offset: 0 });
    expect(result.results.slice(0,3).map(t => t.section)).toEqual(['1', '8', '3']);
    expect(result.results.slice(0,3).every(t => t.name === 'lookup')).toBe(true);
  });
});

describe('stable prefix pagination', () => {
  it('returns every page once, matching a full sort for mixed sections, lengths and descriptions', async () => {
    const t = await explainFixture();
    await t.run(async ctx => {
      const original = await ctx.db.query('manPageSearchDocuments').first();
      const {_id, _creationTime, ...row} = original!; void _id; void _creationTime;
      const page = await ctx.db.get(row.pageId);
      const {_id: id, _creationTime: created, ...fields} = page!; void id; void created;
      for (let i = 0; i < 40; i++) {
        const name = `lx${String(i).padStart(2,'0')}${i % 3 ? '_long_tail' : ''}`, section = ['3','8','1'][i % 3];
        const pageId = await ctx.db.insert('manPages', {...fields, name, section, externalId: name});
        await ctx.db.insert('manPageSearchDocuments', {...row, pageId, name, nameNorm: name, section, descNorm: i % 2 ? 'lx' : ''});
      }
    });
    const query = (limit: number, offset: number) => t.query(api.queries.search, {distro:'debian',q:'lx',section:null,limit,offset});
    const full = (await query(50,0)).results.map(r => `${r.name}(${r.section})`);
    expect(full).toHaveLength(40);
    for (const size of [10,7,13]) {
      const pages: string[] = [];
      for (let offset=0; offset<40; offset+=size) pages.push(...(await query(size,offset)).results.map(r => `${r.name}(${r.section})`));
      expect(pages).toEqual(full);
      expect(new Set(pages).size).toBe(40);
    }
  });
});

describe('review regressions: explanation semantics', () => {
  it.each([
    ['timeout 5 cp -v a b','cp','-v'],['nice ls -n dir','ls','-n'],['nohup cp -v a b','cp','-v'],
    ['time -f format cp -v a b','cp','-v'], ['timeout -s TERM -k 1 5 cp -v a b','cp','-v'], ['nice -n 5 cp -v a b','cp','-v'], ['exec -a name cp -v a b','cp','-v'], ['doas -u root cp -v a b','cp','-v'],['command cp -v a b','cp','-v'],['exec cp -v a b','cp','-v'],['doas cp -v a b','cp','-v'],
  ])('unwraps %s with wrapper-specific operands', async (cmd, name, flag) => {
    const result=await explain(await explainFixture(),cmd);
    const token=result.stages.flatMap((s: {tokens: {value:string;page:{name:string}}[]})=>s.tokens).find((t:{value:string})=>t.value===flag);
    expect(token.page.name).toBe(name);
  });
  it('guards combined sudo shell flags, rejects git abbreviations and unrelated hyphen pages', async()=>{
    const t=await explainFixture();
    const process = await explain(t,'echo <(ls)');
    expect(process.stages[0].tokens.find((token:{value:string})=>token.value==='<(ls)').shell.anchor).toBe('real-processSubstitution');
    const sudo=await explain(t,'sudo -iu root rm -rf /');
    expect(sudo.diagnostics.join(' ')).toContain('Cannot statically unwrap sudo');
    expect(sudo.stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([]);
    expect(sudo.stages[0].tokens.find((x:{value:string})=>x.value==='root').kind).toBe('optionArgument');
    expect((await explain(t,'git rebas')).stages[0].tokens.at(-1).kind).toBe('unknown');
    expect((await explain(t,'ssh add')).stages[0].tokens.at(-1)).toMatchObject({kind:'argument',page:null});
  });

});

it('clips astral symbol excerpts in UTF-16 without failing an ingest batch', async () => {
  const t = await explainFixture();
  await t.run(async ctx => {
    const active = await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro', q => q.eq('stage','prod').eq('locale','en').eq('distro','debian')).unique();
    const release = (await ctx.db.get(active!.releaseId))!;
    const page = (await ctx.db.query('manPages').withIndex('by_releaseId_and_name_and_section', q => q.eq('releaseId',release._id).eq('name','ssh_config')).first())!;
    await insertSymbols(ctx,release,page._id,page,[{term:'Unicode',anchorId:'unicode',excerpt:'a'.repeat(159)+'😀',kind:'config'}]);
    const row = await ctx.db.query('manPageSymbols').withIndex('by_releaseId_and_termNorm', q=>q.eq('releaseId',release._id).eq('termNorm','unicode')).first();
    expect(row!.excerpt).toBe('a'.repeat(159));
  });
});

it.each([
  ['x'.repeat(4097),'EXPLAIN_INPUT_TOO_LONG'],
  ['echo '+'a '.repeat(129),'EXPLAIN_TOO_MANY_TOKENS'],
  [Array(26).fill('echo').join(';'),'EXPLAIN_TOO_MANY_STAGES'],
  ['('.repeat(10)+'echo'+')'.repeat(10),'EXPLAIN_TOO_DEEP'],
])('returns structured Convex limit codes: %s', async (cmd,code) => {
  await expect(explain(await explainFixture(),cmd)).rejects.toMatchObject({data:{code}});
});

it('keeps wrapper children adjacent without moving list terminators, and preserves unknown kinds',async()=>{
 const t=await explainFixture();
 const result=await explain(t,'sudo rm f; echo done');
 expect(result.stages.map((stage:{tokens:{value:string}[]})=>stage.tokens[0].value)).toEqual(['sudo','rm','echo']);
 expect(result.stages[1].tokens.some((token:{value:string})=>token.value===';')).toBe(false);
 for(const input of ['echo <<EOF\nrm f\nEOF','echo \\$(rm -rf /)']) {
   const result=await explain(t,input);
   expect(result.stages[0].tokens.at(-1).kind).toBe('unknown');
 }
});

it('resolves parent-page COMMANDS definitions to their real section anchors', async()=>{
 const t=await explainFixture(20);
 const result=await explain(t,'systemctl restart nginx');
 expect(result.stages[0].tokens[1]).toMatchObject({kind:'subcommand',value:'restart',page:{name:'systemctl',section:'1'},anchor:'unit-commands-introspection-and-modification'});
 expect(result.stages[0].tokens[1].excerpt).toContain('Stop and then start');
 const search=await t.query(api.queries.search,{distro:'debian',q:'systemctl restart',section:null,limit:20,offset:0});
 expect(search.results[0]).toMatchObject({name:'systemctl',symbolKind:'subcommand',anchorId:'unit-commands-introspection-and-modification'});
});


const factDescriptions = new Set([
 'rm deletes files.', 'find -delete deletes the files it matches.',
 'git clean deletes files from the working tree.', 'mkfs creates a new filesystem, erasing what the device held.',
 'truncate changes file sizes; a size of 0 empties a file.', '> replaces the contents of the file it writes to.',
]);
const hints = new Set([
 'Run it with `ls -d` in place of `rm` first to see what it would act on.',
 'Run it with `-print` in place of `-delete` first.', 'Run `git clean -n` first.', 'Add `-n` to see what it would do.',
]);
let reviewHarness: ReturnType<typeof explainFixture> | undefined;
const reviewed = () => reviewHarness ??= explainFixture(66,true);
describe('round-3 real-metadata review corpus',()=>{
 it.each(reviewFixture.cases)('$distro: $cmd (previous note: $hadNote)',async({distro,cmd})=>{
  const result=await explain(await reviewed(),cmd,distro);
  const notes=result.stages.flatMap((stage:{destructive:{description:string;dryRun:string|null}[]})=>stage.destructive);
  expect(notes.every((note:{description:string})=>factDescriptions.has(note.description))).toBe(true);
  expect(new Set(notes.map((note:{description:string})=>note.description)).size).toBe(notes.length);
  expect(notes.every((note:{dryRun:string|null})=>note.dryRun===null || hints.has(note.dryRun))).toBe(true);
  if(result.diagnostics.length || result.stages.some((stage:{tokens:{kind:string}[]})=>stage.tokens.some(t=>t.kind==='unknown'))) expect(notes.every((note:{dryRun:string|null})=>note.dryRun===null)).toBe(true);
 });
 it.each([
  ['rm file','rm deletes files.','ls -d'],
  ['find . -delete','find -delete deletes the files it matches.','-print'],
  ['git clean -f','git clean deletes files from the working tree.','git clean -n'],
  ['mkfs.ext4 /dev/sdb1','mkfs creates a new filesystem, erasing what the device held.','Add `-n`'],
  ['truncate -s 0 file','truncate changes file sizes; a size of 0 empties a file.',null],
  ['echo new > file','> replaces the contents of the file it writes to.',null],
  ['find . -exec rm {} \\;','rm deletes files.','ls -d'],
  ['find . -execdir rm {} \\;','rm deletes files.','ls -d'],
  ['find . -exec truncate -s 0 {} \\;','truncate changes file sizes; a size of 0 empties a file.',null],
  ['find . -exec mkfs.ext4 {} \\;','mkfs creates a new filesystem, erasing what the device held.','Add `-n`'],
  ['find . -exec find {} -delete \\;','find -delete deletes the files it matches.',null],
  ['xargs -I % git -C % clean -f','git clean deletes files from the working tree.',null],
  ['xargs rm','rm deletes files.','ls -d'],
  ['xargs -I % rm %','rm deletes files.','ls -d'],
 ])('emits an exact command fact and supported hint: %s',async(cmd,description,hint)=>{
  const result=await explain(await reviewed(),cmd);
  const note=result.stages.flatMap((stage:{destructive:{description:string;dryRun:string|null}[]})=>stage.destructive).find((note:{description:string})=>note.description===description);
  expect(note).toBeDefined();
  if(hint) expect(note.dryRun).toContain(hint); else expect(note.dryRun).toBeNull();
 });
 it.each(['sudo rm file','doas rm file','env rm file','nice rm file','timeout 5 rm file','nohup rm file','time rm file','command rm file','exec rm file'])('recognizes real wrapper command positions: %s',async cmd=>{
  const result=await explain(await reviewed(),cmd);
  expect(result.stages.flatMap((s:{destructive:{description:string}[]})=>s.destructive).some((n:{description:string})=>n.description==='rm deletes files.')).toBe(true);
 });
 it.each(['sudo -l rm -f file','sudo -v rm file','command -v rm','command -V rm','type rm','which rm','echo "rm -f file"','printf "rm file"','# rm file','"rm file"','rm --help','rm --version','./rm -f file','./sudo rm file'])('does not infer execution from text or non-executing modes: %s',async cmd=>{
  expect((await explain(await reviewed(),cmd)).stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([]);
 });
 it('deduplicates command facts and suppresses hints on unknown lines',async()=>{
  const result=await explain(await reviewed(),'rm a; rm b; missing');
  expect(result.stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([{description:'rm deletes files.',dryRun:null}]);
 });
 it.each(['truncate -s=0 f','git -C=foo clean -f','find . -exec rm -f x +','find . -exec rm {} {} +','find . -exec rm {} ;'])('marks invalid or unsupported syntax: %s',async cmd=>{
  const result=await explain(await reviewed(),cmd);
  expect(result.diagnostics.length).toBeGreaterThan(0);
  expect(result.stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([]);
 });
 it('keeps optional values, replacement templates and redirect globs honest',async()=>{
  const optional=await explain(await reviewed(),'rm --interactive never -rf build');
  expect(optional.stages[0].tokens.find((t:{value:string})=>t.value==='never').kind).toBe('argument');
  for(const cmd of ['find . -exec truncate -s 0 {} \\;','find . -exec rm {}.bak \\;','find . -exec rm ./{} \\;','xargs -I % git -C % clean -f','find . -exec truncate -s{} f \\;','xargs -I={} rm ={}']) {
   const result=await explain(await reviewed(),cmd);
   expect(result.stages.flatMap((s:{tokens:{kind:string}[]})=>s.tokens).some((t:{kind:string})=>t.kind==='expansion')).toBe(true);
  }
  for(const cmd of ['git -Cfoo clean -f','find . -exec git -C{} clean -f \\;']) {
    const result=await explain(await reviewed(),cmd);
    expect(result.stages.flatMap((stage:{tokens:{kind:string;value:string}[]})=>stage.tokens).some((t:{kind:string;value:string})=>t.kind==='subcommand' && t.value==='clean')).toBe(true);
  }
  const marker=await explain(await reviewed(),'xargs -I={} rm ={}');
  expect(marker.stages[1].tokens.at(-1)).toMatchObject({kind:'expansion',page:{name:'xargs'},anchor:`debian-${reviewFixture.pages.find(page=>page.name==='xargs')!.options.find(row=>row.flags.startsWith('-I'))!.anchorId}`,shell:null});
  expect(marker.stages[0].tokens.find((t:{kind:string})=>t.kind==='optionArgument').value).toBe('={}');
  const option=await explain(await reviewed(),'xargs -I f rm -f f');
  expect(option.stages.at(-1).tokens.find((t:{text:string})=>t.text==='-f').kind).toBe('unknown');
  const redirect=await explain(await reviewed(),'echo new > *.txt');
  expect(redirect.stages[0].tokens.at(-1).kind).toBe('glob');
  expect(redirect.stages[0].destructive).toEqual([]);
 });
});

it('accepts short equals only when documented and preserves legacy optional metadata',async()=>{
 const t=await explainFixture(66);
 await t.run(async ctx=>{
  const active=await ctx.db.query('activeReleases').withIndex('by_stage_and_locale_and_distro',q=>q.eq('stage','prod').eq('locale','en').eq('distro','debian')).unique();
  const size=await ctx.db.query('manPageOptionFlags').withIndex('by_releaseId_and_flag_and_nameNorm',q=>q.eq('releaseId',active!.releaseId).eq('flag','-s').eq('nameNorm','truncate')).first();
  const interactive=await ctx.db.query('manPageOptionFlags').withIndex('by_releaseId_and_flag_and_nameNorm',q=>q.eq('releaseId',active!.releaseId).eq('flag','--interactive').eq('nameNorm','rm')).first();
  await ctx.db.patch(size!._id,{flags:'-s=SIZE'});
  await ctx.db.patch(interactive!._id,{flags:'--interactive',argumentOptional:undefined});
 });
 const documented=await explain(t,'truncate -s=0 file');
 expect(documented.diagnostics).toEqual([]);
 expect(documented.stages[0].tokens[2]).toMatchObject({kind:'optionArgument',value:'0'});
 const optional=await explain(t,'rm --interactive never -f file');
 expect(optional.stages[0].tokens.find((t:{value:string})=>t.value==='never').kind).toBe('argument');
});

it.each(['find . -mtime 7d -delete','find . -type q -delete','xargs -n nonsense rm file','xargs -I "" rm file','rm $UNKNOWN'])('does not offer a preview for an unmodeled or runtime form: %s',async cmd=>{
 const result=await explain(await reviewed(),cmd);
 expect(result.stages.flatMap((s:{destructive:{dryRun:string|null}[]})=>s.destructive).every((n:{dryRun:string|null})=>n.dryRun===null)).toBe(true);
});
