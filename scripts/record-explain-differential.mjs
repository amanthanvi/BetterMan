#!/usr/bin/env node
// Manual regeneration only. CI consumes the recorded fixture, never Docker.
import {spawn,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {generateCases} from './explain-differential/cases.mjs'
const image='betterman-explain-differential:1'
const cases=generateCases()
const digest=createHash('sha256').update(JSON.stringify(cases)).digest('hex')
console.log(`Recording ${cases.length} generated lines; no host mounts or runtime network.`)
execFileSync('docker',['build','-t',image,'scripts/explain-differential'],{stdio:'inherit'})
const imageId=execFileSync('docker',['image','inspect',image,'--format','{{.Id}}'],{encoding:'utf8'}).trim()
const versionProbe="import json,subprocess;print(json.dumps({name:subprocess.check_output(args,stderr=subprocess.DEVNULL,text=True).splitlines()[0] for name,args in {'bash':['bash','--version'],'coreutils':['env','--version'],'findutils':['xargs','--version'],'sudo':['sudo','--version'],'time':['/usr/bin/time','--version'],'doasPackage':['dpkg-query','-W','-f=${Version}','opendoas']}.items()}))"
const gnu=JSON.parse(execFileSync('docker',['run','--rm','--network','none','--entrypoint','python3',image,'-c',versionProbe],{encoding:'utf8'}))
const workers=4
const ran=Buffer.alloc(Math.ceil(cases.length/8))
const statuses={}
let completed=0
async function run(worker) {
 const child=spawn('docker',['run','--rm','-i','--network','none','--read-only','--tmpfs','/scratch:rw,exec,size=8m','--tmpfs','/tmp:rw,size=8m','--tmpfs','/run:rw,size=8m','--pids-limit','128','--memory','256m',image],{stdio:['pipe','pipe','inherit']})
 let pending='',error
 child.stdin.on('error',err=>{error=err})
 child.stdout.setEncoding('utf8')
 child.stdout.on('data',data=>{
  pending+=data
  let nl
  while((nl=pending.indexOf('\n'))>=0) {
   const row=JSON.parse(pending.slice(0,nl));pending=pending.slice(nl+1)
   if(row.timeout) error=new Error(`GNU timeout for case ${row.id}: ${cases[row.id].cmd}`)
   if(row.ran) ran[row.id>>3]|=1<<(row.id&7)
   statuses[row.status]=(statuses[row.status]??0)+1
   if(++completed%5000===0) console.log(`${completed}/${cases.length}`)
  }
 })
 const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Docker worker exited ${code}`)))})
 for(let i=worker;i<cases.length;i+=workers) {
  if(!child.stdin.write(JSON.stringify({id:i,cmd:cases[i].cmd})+'\n')) await once(child.stdin,'drain')
 }
 child.stdin.end();await finished;if(error) throw error
}
await Promise.all(Array.from({length:workers},(_,i)=>run(i)))
if(completed!==cases.length) throw new Error('Incomplete GNU recording')
const generatorSha256=createHash('sha256').update(await readFile('scripts/explain-differential/cases.mjs')).digest('hex')
const result={version:1,image:'debian:trixie',imageId,generatorSha256,casesSha256:digest,count:cases.length,ranBits:ran.toString('base64'),statuses,
 gnu,
 scope:'Target executable admission only. rm/truncate are marker ELF binaries; no user targets are modified. Each container has isolated scratch, no host mounts and no runtime network. Redirect facts are distinct from target-command facts.'}
await writeFile('convex/fixtures/explain-differential.json',JSON.stringify(result,null,2)+'\n')
console.log(`Recorded ${completed} expectations.`)
