import { expect, test } from '@playwright/test'

test('explain: static seeded command resolves exact option anchors over HTTP', async ({ request }) => {
  const cmd = 'tar -c build/'
  const response = await request.get('/api/v1/explain', {params: {cmd}})
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  const result = await response.json()
  expect(result.input).toBe(cmd)
  expect(result.shareUrl).toBe(`/explain?cmd=${encodeURIComponent(cmd)}`)
  const options = result.stages.flatMap((s: {tokens: {kind:string;anchor:string|null}[]}) => s.tokens).filter((t: {kind:string}) => t.kind === 'option')
  expect(options.map((t: {anchor:string|null}) => t.anchor)).toEqual(['opt-create'])
  const share = await request.get(result.shareUrl)
  expect(share.status()).toBe(200)
  expect((await share.json()).input).toBe(cmd)
})

test('explain: production Convex limit codes survive redaction as HTTP 400', async ({ request }) => {
  for (const [cmd,code] of [
    ['echo ' + 'a '.repeat(129),'EXPLAIN_TOO_MANY_TOKENS'],
    [Array(26).fill('echo').join(';'),'EXPLAIN_TOO_MANY_STAGES'],
    ['('.repeat(10)+'echo'+')'.repeat(10),'EXPLAIN_TOO_DEEP'],
  ]) {
    const response=await request.get('/api/v1/explain',{params:{cmd}})
    expect(response.status()).toBe(400)
    expect((await response.json()).code).toBe(code)
  }
})

test('explain: wrapper order and unsupported lexical kinds survive HTTP resolution', async ({ request }) => {
  const ordered = await request.get('/api/v1/explain', {params:{cmd:'sudo rm f; echo done'}})
  expect(ordered.status()).toBe(200)
  const result = await ordered.json()
  expect(result.stages.map((s:{tokens:{value:string}[]})=>s.tokens[0].value)).toEqual(['sudo','rm','echo'])
  expect(result.stages[1].tokens.some((t:{value:string})=>t.value===';')).toBe(false)
  for(const cmd of ['echo <<EOF\nrm f\nEOF','echo \\$(rm -rf /)']) {
    const response = await request.get('/api/v1/explain',{params:{cmd}})
    expect(response.status()).toBe(200)
    expect((await response.json()).stages[0].tokens.at(-1).kind).toBe('unknown')
  }
})

test('explain: facts are target-free, deduplicated and omit redirect globs', async ({ request }) => {
  const response=await request.get('/api/v1/explain',{params:{cmd:'> first; > second'}})
  expect(response.status()).toBe(200)
  const result=await response.json()
  expect(result.stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([{description:'> replaces the contents of the file it writes to.',dryRun:null}])
  const glob=await request.get('/api/v1/explain',{params:{cmd:'> *.txt'}})
  expect(glob.status()).toBe(200)
  const expanded=await glob.json()
  expect(expanded.stages[0].tokens.at(-1).kind).toBe('glob')
  expect(expanded.stages[0].destructive).toEqual([])
  const local=await request.get('/api/v1/explain',{params:{cmd:'./sudo rm -rf /'}})
  expect((await local.json()).stages[0].tokens[0].kind).toBe('unknown')
})
