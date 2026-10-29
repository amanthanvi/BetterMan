import { describe, expect, it } from 'vitest'

// Copies of docs/examples/explain-*.json: the container build copies only convex/ and nextjs/.
import archive from './__fixtures__/explain-archive.json'
import pipeline from './__fixtures__/explain-pipeline.json'
import type { Explanation } from '../../convex/explain'
import { codeSpans, explainFacts, looksLikeCommandLine, numberTokens, optionAnchorsByPage, readingLines, tokenCells } from './explain'

const tar = archive as Explanation
const findXargs = pipeline as Explanation

describe('explain view model', () => {
  it('numbers tokens in input order and splits a cluster into individually linked flags', () => {
    const tokens = numberTokens(tar, null)
    expect(tokens.map((t) => t.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const cells = tokenCells(tokens)
    expect(cells.map((c) => c.text)).toEqual(['tar', '-xzvf', 'backup.tar.gz', '-C', '/srv/www'])
    const cluster = cells[1]
    expect(cluster.tokens.map((t) => t.value)).toEqual(['-x', '-z', '-v', '-f'])
    expect(cluster.tokens.map((t) => t.href)).toEqual(['/man/tar/1#extract', '/man/tar/1#gzip', '/man/tar/1#verbose', '/man/tar/1#file'])
    expect(cluster.tokens[1].source).toBe('tar(1) · -z')
  })

  it('names an option argument by the flag that takes it', () => {
    const tokens = numberTokens(tar, null)
    expect(tokens.find((t) => t.value === 'backup.tar.gz')?.label).toBe('argument of -f')
    expect(tokens.find((t) => t.value === '/srv/www')?.label).toBe('argument of -C')
  })

  it('keeps the URL distro on every manual link', () => {
    expect(numberTokens(tar, 'fedora')[0].href).toBe('/man/tar/1?distro=fedora')
  })

  it('reads one NAME line per command, wrappers and children in order', () => {
    const lines = readingLines(numberTokens(findXargs, null))
    expect(lines.map((l) => l.name)).toEqual(['find', 'xargs', 'rm'])
  })

  it('links shell syntax to its bash(1) section and keeps engine facts verbatim', () => {
    const pipe = numberTokens(findXargs, null).find((t) => t.value === '|')!
    expect(pipe.source).toBe('bash(1)')
    expect(pipe.href).toMatch(/^\/man\/bash\/1/)
    expect(explainFacts(findXargs)).toEqual([
      { description: 'rm deletes files.', dryRun: 'Run it with `ls -d` in place of `rm` first to see what it would act on.' },
    ])
  })

  it('never joins tokens across stages or into the next word', () => {
    const cells = tokenCells(numberTokens(findXargs, null))
    expect(cells.map((c) => c.text)).toContain('|')
    expect(cells.every((c) => c.tokens.every((t) => t.stage === c.tokens[0].stage))).toBe(true)
  })

  it('collects option anchors per manual for the portability lookup', () => {
    expect(optionAnchorsByPage(numberTokens(findXargs, null))).toEqual([
      { name: 'find', section: '1', anchors: ['name', 'mtime', 'print0'] },
      { name: 'xargs', section: '1', anchors: ['null'] },
      { name: 'rm', section: '1', anchors: ['force'] },
    ])
  })

  it('splits hint code spans as text, never markup', () => {
    expect(codeSpans('Run `git clean -n` first.')).toEqual([
      { code: false, text: 'Run ' },
      { code: true, text: 'git clean -n' },
      { code: false, text: ' first.' },
    ])
    expect(codeSpans('<img src=x>')).toEqual([{ code: false, text: '<img src=x>' }])
  })

  it('recognizes a pasted command line, not a phrase', () => {
    expect(looksLikeCommandLine('tar -xzvf a.tgz')).toBe(true)
    expect(looksLikeCommandLine('ps aux | grep ssh')).toBe(true)
    expect(looksLikeCommandLine('extract a tarball')).toBe(false)
    expect(looksLikeCommandLine('--gzip')).toBe(false)
    expect(looksLikeCommandLine('tar')).toBe(false)
    expect(looksLikeCommandLine('how do I use tar -x')).toBe(false)
  })
})
