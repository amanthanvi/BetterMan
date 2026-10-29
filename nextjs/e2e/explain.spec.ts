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
