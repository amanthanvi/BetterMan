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

test('explain: unsupported grammar suppresses facts for the whole line over HTTP', async ({ request }) => {
  for (const cmd of ['((rm))', '; > out', '> out ;; echo ok', '> out |', 'echo $((1+2)); > out', 'echo\r text > out']) {
    const response = await request.get('/api/v1/explain', {params:{cmd}})
    expect(response.status()).toBe(200)
    const result=await response.json()
    expect(result.diagnostics.length,cmd).toBeGreaterThan(0)
    expect(result.stages.flatMap((s:{destructive:unknown[]})=>s.destructive),cmd).toEqual([])
  }
})

test('explain: decoded cluster and serialized byte limits survive HTTP transport', async ({ request }) => {
  for(const cmd of ['tar -'+'c'.repeat(4089)+' x', "tar '"+'\u0001'.repeat(4090)+"'"]) {
    const response=await request.get('/api/v1/explain',{params:{cmd}})
    expect(response.status()).toBe(200)
    const result=await response.json()
    expect(Buffer.byteLength(JSON.stringify(result),'utf8')).toBeLessThanOrEqual(65536)
    expect(result.diagnostics.join(' ').toLowerCase()).toContain('truncated')
    expect(result.stages.reduce((n:number,s:{tokens:unknown[]})=>n+s.tokens.length,0)).toBeLessThanOrEqual(256)
    expect(result.stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([])
  }
})

test('explain: comment-only boundaries, partly quoted braces and invalid wrapper values fail closed', async ({request})=>{
  for(const cmd of ['tar item | # hi','tar item && # hi','tar item || # hi',"tar x{,''}",'timeout invalid tar item','nice -n invalid tar item']) {
    const response=await request.get('/api/v1/explain',{params:{cmd}})
    expect(response.status()).toBe(200)
    const result=await response.json()
    expect(result.diagnostics.length,cmd).toBeGreaterThan(0)
    expect(result.stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([])
  }
})

test('explain: interleaved wrapper redirects preserve the child option anchor', async ({request})=>{
  const response=await request.get('/api/v1/explain',{params:{cmd:'env >out tar -c item'}})
  expect(response.status()).toBe(200)
  const result=await response.json()
  expect(result.diagnostics).toEqual([])
  expect(result.stages[0].tokens.some((t:{kind:string})=>t.kind==='redirect')).toBe(true)
  expect(result.stages[1].tokens[0]).toMatchObject({kind:'command',page:{name:'tar'}})
  expect(result.stages[1].tokens.find((t:{kind:string})=>t.kind==='option').anchor).toBe('opt-create')
})


test('explain: wrapper assignment and delimiter admission survives HTTP',async({request})=>{
 for(const cmd of ['timeout 1 VAR=value rm x','nice VAR=value rm x','nohup VAR=value rm x','command VAR=value rm x','exec VAR=value rm x','doas VAR=value rm x','/usr/bin/time VAR=value rm x','xargs VAR=value rm x','env VAR=value -- rm x','env VAR=value -u VAR rm x',"xargs -d '\\400' rm x","xargs --delimiter='\\777' rm x"]) {
  const response=await request.get('/api/v1/explain',{params:{cmd}});
  expect(response.status()).toBe(200);
  const result=await response.json();
  expect(result.diagnostics.length,cmd).toBeGreaterThan(0);
  expect(result.stages.flatMap((s:{destructive:unknown[]})=>s.destructive)).toEqual([]);
 }
 const valid=await request.get('/api/v1/explain',{params:{cmd:'env VAR=value tar -c item'}});
 const result=await valid.json();
 expect(result.diagnostics).toEqual([]);
 expect(result.stages[1].tokens[0]).toMatchObject({kind:'command',page:{name:'tar'}});
 expect(result.stages[1].tokens.find((t:{kind:string})=>t.kind==='option').anchor).toBe('opt-create');
});
