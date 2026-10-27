import { describe, expect, it } from 'vitest'

import { manPath, parseShortUrl } from './shortUrl'

const reserved = new Set(['api', 'man', 'search', 'section', 'fonts', 'robots.txt', '_next'])
const parse = (path: string) => parseShortUrl(path.split('/').slice(1), reserved)

describe('parseShortUrl', () => {
  it.each([
    ['/tar', { kind: 'name', name: 'tar' }],
    ['/TAR', { kind: 'name', name: 'tar' }],
    ['/git-commit', { kind: 'name', name: 'git-commit' }],
    ['/ld.so', { kind: 'name', name: 'ld.so' }],
    ['/python3.11', { kind: 'name', name: 'python3.11' }],
    ['/Foo::Bar', { kind: 'name', name: 'foo::bar' }],
    ['/[', { kind: 'name', name: '[' }],
    ['/_exit', { kind: 'name', name: '_exit' }],
    ['/tar.1', { kind: 'page', name: 'tar', section: '1' }],
    ['/ssh_config.5', { kind: 'page', name: 'ssh_config', section: '5' }],
    ['/ld.so.8', { kind: 'page', name: 'ld.so', section: '8' }],
    ['/openssl.1SSL', { kind: 'page', name: 'openssl', section: '1ssl' }],
    ['/c++.1', { kind: 'page', name: 'c++', section: '1' }],
    ['/File::Spec.3pm', { kind: 'page', name: 'file::spec', section: '3pm' }],
    ['/package.json.5', { kind: 'page', name: 'package.json', section: '5' }],
    ['/resolv.conf', { kind: 'name', name: 'resolv.conf' }],
    ['/systemd.unit', { kind: 'name', name: 'systemd.unit' }],
    ['/2/open', { kind: 'page', name: 'open', section: '2' }],
    ['/3p/printf', { kind: 'page', name: 'printf', section: '3p' }],
    ['/tar/-x', { kind: 'option', name: 'tar', section: null, flag: '-x' }],
    ['/tar/--extract', { kind: 'option', name: 'tar', section: null, flag: '--extract' }],
    ['/tar/--sort=', { kind: 'option', name: 'tar', section: null, flag: '--sort=' }],
    ['/tar.1/-C', { kind: 'option', name: 'tar', section: '1', flag: '-C' }],
    ['/7z/-x', { kind: 'option', name: '7z', section: null, flag: '-x' }],
  ])('reads %s', (path, expected) => {
    expect(parse(path)).toEqual(expected)
  })

  it.each([
    '/man',
    '/API',
    '/api/v2',
    '/search/-x',
    '/fonts/missing',
    '/robots.txt',
    '/_next/static',
    '/.well-known',
    '/-x',
    '/tar/x',
    '/tar/---x',
    '/tar/-',
    '/tar/--',
    '/open/2',
    '/a/b/c',
    '/tar/-x/extra',
    '/has space',
    `/${'a'.repeat(201)}`,
    '/tar.txt',
    '/tar.TXT',
    '/tar.txt/-x',
    '/1/tar.txt',
    '/1/tar.1',
    '/wp-login.php',
    '/favicon.png',
    '/apple-touch-icon-precomposed.png',
    '/config.json',
    '/index.html',
    '/main.js',
    '/style.css',
    '/feed.xml',
    '/backup.sql',
    '/site.tar.gz',
  ])('rejects %s', (path) => {
    expect(parse(path)).toBeNull()
  })

  it('rejects an empty path', () => {
    expect(parseShortUrl([], reserved)).toBeNull()
  })
})

describe('manPath', () => {
  it('encodes the name and section', () => {
    expect(manPath('c++')).toBe('/man/c%2B%2B')
    expect(manPath('foo::bar', '3pm')).toBe('/man/foo%3A%3Abar/3pm')
    expect(manPath('tar', null)).toBe('/man/tar')
  })
})
