import { describe, expect, it } from 'vitest'

import { findExternalUrls } from './externalUrls'

const linked = (text: string) => findExternalUrls(text).map((r) => [text.slice(r.start, r.end), r.href])

describe('findExternalUrls', () => {
  it('links http and https URLs without trailing sentence punctuation', () => {
    expect(linked('Report bugs at https://www.gnu.org/software/tar/. Mirror: http://ftp.gnu.org/gnu/tar, or not.')).toEqual([
      ['https://www.gnu.org/software/tar/', 'https://www.gnu.org/software/tar/'],
      ['http://ftp.gnu.org/gnu/tar', 'http://ftp.gnu.org/gnu/tar'],
    ])
  })

  it('keeps balanced parentheses and drops an unopened closing one', () => {
    expect(linked('(see https://en.wikipedia.org/wiki/Tar_(computing))')).toEqual([
      ['https://en.wikipedia.org/wiki/Tar_(computing)', 'https://en.wikipedia.org/wiki/Tar_(computing)'],
    ])
  })

  it('keeps ports, queries and fragments', () => {
    expect(linked('GET https://example.com:8443/a?b=1#c;')).toEqual([
      ['https://example.com:8443/a?b=1#c', 'https://example.com:8443/a?b=1#c'],
    ])
  })

  it('rejects templates, placeholders, numeric hosts and credentials', () => {
    expect(
      linked(
        'curl http://site.{one,two}.com/ http://example.com/file[1-100].txt http://host/ ' +
          'https://server:port/ http://127.0.0.1:8080/ https://user:pass@example.com/ http://',
      ),
    ).toEqual([])
  })

  it('ignores other schemes and URLs inside words', () => {
    expect(linked('ftp://ftp.gnu.org/ file:///etc/passwd xhttps://example.com')).toEqual([])
  })
})
