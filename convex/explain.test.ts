/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import schema from './schema';
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
export async function explainFixture(documentsRead = 258) {
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
      const release = (await ctx.db.get(releaseId))!;
      for (const spec of specs) {
        const pageId = await ctx.db.insert('manPages', { name: spec.name, section: spec.section, releaseId, datasetReleaseId: distro, externalId: spec.name, locale: 'en', distro, sitemapPage: 1, title: `${spec.name}(${spec.section})`, description: `Manual for ${spec.name}`, sourcePath: spec.name, contentSha256: spec.name, hasParseWarnings: false });
        await ctx.db.insert('manPageSearchDocuments', { pageId, releaseId, datasetReleaseId: distro, name: spec.name, nameNorm: spec.name, section: spec.section, title: `${spec.name}(${spec.section})`, description: `Manual for ${spec.name}`, descNorm: '', searchText: '', snippetText: '' });
        for (const row of optionFlagRows(spec.options)) await ctx.db.insert('manPageOptionFlags', { ...row, releaseId, pageId, nameNorm: spec.name, section: spec.section, anchorId: `${distro}-${row.anchorId}` });
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
    expect(pipeline.stages[2].destructive[0].description).toContain('requests removal of the paths supplied by xargs without prompting');
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
  it.each([
    ['rm -rf build/','requests removal of build/ with recursive directory traversal without prompting','ls -d'],
    ['rm -i -f x','requests removal of x without prompting','ls -d'], ['rm f','requests removal of f.','ls -d'], ['find . | xargs rm','paths supplied by xargs','ls -d'],
    ['find . -exec rm {} +','each path substituted for {}','ls -d'],
    ['git -C dir clean -fd','in dir.','-n'], ['git clean -fX','ignored files','-n'],['git clean -fx','including ignored','-n'],
    ['rm {}','removal of {}.', 'ls -d'],['xargs rm {}','{} and the paths supplied by xargs','ls -d'], ['xargs -I % rm %','each input line substituted for %','ls -d'],
    ['find -L /srv -name x -delete','tree rooted at /srv.','-print'], ['find -P /data -delete','tree rooted at /data.','-print'],
    ['find . -delete','requests deletion of matching files','-print'],
    ['truncate -s 0 f','zero bytes',null],
    ['mkfs.ext4 /dev/sdb1','creation of a filesystem on /dev/sdb1','add `-n`'],
    ['git clean -fd','non-ignored untracked files and directories','-n'],
    ['echo text &> f','requests output to f with truncation',null],
    ['echo text >| f','requests output to f with truncation',null],
    ['echo text >& f','requests output to f with truncation',null],
  ])('describes literal operation %s accurately',async(cmd,wording,dryRun)=>{
    const result=await explain(await explainFixture(),cmd);
    const notes=result.stages.flatMap((s:{destructive:{description:string;dryRun:string|null}[]})=>s.destructive);
    expect(notes.some((n:{description:string})=>n.description.includes(wording))).toBe(true);
    expect(notes.every((n:{description:string})=>!(/\bmay\b|\bcan\b/.test(n.description)))).toBe(true);
    if(dryRun) expect(notes.some((n:{dryRun:string|null})=>n.dryRun?.includes(dryRun))).toBe(true);
  });
  it.each([
    'dd if=a of=b','dd if=a of=b count=0','dd if=a of=b seek=1','dd if=a of=b conv=notrunc','shred f','tar --remove-files f','rsync -a --delete a b','rsync --delete a b',
    'rm -rf --one-file-system build/','rm -rf a{b,c}','mkfs.ext4 -L label /dev/sdb1','sudo -l rm -rf /','sudo -v rm -rf /','sudo -k rm -rf /','sudo -K rm -rf /','sudo -e rm -rf /',
    'env - rm -f f','xargs -p rm -f','find . -delete -name x','git clean -fe pattern','rm -rf /','rm -rf .','rm -rf ..','rm -rf folder/.','echo > /dev/sda',
    'dd if=/dev/zero of=/dev/null','dd if=input of=/dev/stdout','dd if=input of=/dev/fd/2',
    'rm -rfi x','rm -f -i x','rm -f -I x','rm -f --interactive=always x',
    'truncate -s 0 -s +1G f','truncate -s +1G f',"truncate -s '>1G' f",'mkfs.ext4 -n /dev/sdb1','mkfs.ext4 -L label',
    'rsync --delete --dry-run source/ dest/','git clean -fn',
    'echo x &> /dev/null','echo x >| /dev/tty','echo x >& 2',
    'echo \\$(rm -rf /)','"FOO=bar" rm -rf /',
  ])('makes no destructive assertion for %s',async cmd=>{
    const result=await explain(await explainFixture(),cmd);
    expect(result.stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([]);
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

it.each([
 ['git clean -fd','git clean requests removal of non-ignored untracked files and directories in the current directory.'],
 ['git clean -fX','git clean requests removal of ignored files in the current directory.'],
 ['git clean -fx','git clean requests removal of untracked, including ignored files in the current directory.'],
 ['git -C dir clean -fd','git clean requests removal of non-ignored untracked files and directories in dir.'],
 ['find . -delete','find -delete requests deletion of matching files and empty directories in the tree rooted at the current directory.'],
])('pins modeled wording exactly: %s',async(cmd,description)=>{
 const result=await explain(await explainFixture(),cmd);
 expect(result.stages.flatMap((s:{destructive:{description:string}[]})=>s.destructive).map((n:{description:string})=>n.description)).toEqual([description]);
});
