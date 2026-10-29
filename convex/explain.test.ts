/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import schema from './schema';
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
          { flags: '-name', anchorId: 'name', argument: 'PATTERN' }, { flags: '-mtime', anchorId: 'mtime', argument: 'N' },
          { flags: '-print0', anchorId: 'print0' }, { flags: '-delete', anchorId: 'delete' }, { flags: '-exec', anchorId: 'exec', argument: 'COMMAND' },
        ] },
        { name: 'xargs', section: '1', options: [{ flags: '-0', anchorId: 'null' }] },
        { name: 'rm', section: '1', options: [{ flags: '-f, --force', anchorId: 'force' }, { flags: '-r', anchorId: 'recursive' }] },
        { name: 'git', section: '1', options: [{ flags: '-C', anchorId: 'chdir', argument: 'DIR' }] },
        { name: 'git-commit', section: '1', options: [{ flags: '-m, --message', anchorId: 'message', argument: 'MESSAGE' }] },
        { name: 'ip', section: '8', options: [] }, { name: 'ip-address', section: '8', options: [] },
        { name: 'mysql', section: '1', options: [{ flags: '-u, --user', anchorId: 'user', argument: 'USER' }] },
        { name: 'bash', section: '1', options: [] },
        { name: 'sudo', section: '1', options: [{ flags: '-u', anchorId: 'user', argument: 'USER' }] },
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
        if (spec.name.includes('-')) symbols.push({ term: spec.name.replace('-', ' '), anchorId: '', excerpt: `Subcommand ${spec.name}`, kind: 'subcommand' });
        if (spec.name === 'ssh_config') symbols.push({ term: 'ForwardAgent', anchorId: 'ForwardAgent', excerpt: 'Forward authentication agent connections.', kind: 'config' });
        if (spec.name === 'systemd.service') symbols.push({ term: 'ExecStart=', anchorId: 'ExecStart', excerpt: 'Commands executed when this service starts.', kind: 'config' });
        if (spec.name === 'errno') symbols.push({ term: 'ENOSPC', anchorId: 'enospc', excerpt: 'No space left on device.', kind: 'errors' });
        if (spec.name === 'bash') for (const kind of ['pipeline', 'redirect', 'quoting', 'glob', 'substitution', 'subshell', 'list', 'assignment', 'expansion']) symbols.push({ term: `shell:${kind}`, anchorId: `real-${kind}`, excerpt: `Shell ${kind}`, kind: 'shell' });
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
    expect(pipeline.stages[2].destructive[0].description).toContain('rm requests file removal');
    expect(pipeline.shareUrl).toBe(`/explain?cmd=${encodeURIComponent(pipeline.input)}`);
    expect(pipeline.diagnostics).toEqual([]);
  });
  it('resolves subcommands, distro variants, attached values and real find flags', async () => {
    const t = await explainFixture(30);
    for (const [cmd, name] of [['git commit -m "message"', 'git-commit'], ['ip addr', 'ip-address']]) {
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
    for (const cmd of ['rm -f=invalid', 'rm -- -f', 'find . -name -delete', 'tar -f --remove-files', 'rm -f --help']) {
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
