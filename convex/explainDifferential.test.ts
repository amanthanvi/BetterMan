/// <reference types="vite/client" />
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {convexTest} from 'convex-test';
import {expect,it} from 'vitest';
import schema from './schema';
import {api} from './_generated/api';
import {SUPPORTED_SHELL_GRAMMAR} from './_shellGrammar';
import {EXECUTING_WRAPPER_SWITCHES} from './_shellWrappers';
import {SHELL_BUILTINS} from './_commandConventions';
import {generateCases,wrappers} from '../scripts/explain-differential/cases.mjs';
import truth from './fixtures/explain-differential.json';
const modules=import.meta.glob('./**/*.ts');

it('differential: target facts require actual GNU marker execution for every generated line',async()=>{
 const cases=generateCases();
 expect(cases.length).toBe(truth.count);
 expect(createHash('sha256').update(JSON.stringify(cases)).digest('hex')).toBe(truth.casesSha256);
 expect(createHash('sha256').update(readFileSync('scripts/explain-differential/cases.mjs')).digest('hex')).toBe(truth.generatorSha256);
 expect(wrappers.map(w=>w.name).filter(n=>n!=='external-time').sort()).toEqual(Object.keys(SUPPORTED_SHELL_GRAMMAR.wrappers).sort());
 const bits=Buffer.from(truth.ranBits,'base64');
 const t=convexTest({schema,modules,transactionLimits:{documentsRead:66}});
 // Every modeled option/builtin gets metadata: missing manuals must not hide
 // an admission error. The real query still resolves release pointers/indexes.
 await t.run(async ctx=>{
  const releaseId=await ctx.db.insert('datasetReleases',{datasetReleaseId:'differential',locale:'en',distro:'debian',imageRef:'fixture',imageDigest:'fixture',ingestedAt:'2026-10-29',pageCount:100});
  await ctx.db.insert('activeReleases',{releaseId,datasetReleaseId:'differential',locale:'en',distro:'debian',stage:'prod',activatedAt:'now'});
  for(const name of new Set([...Object.keys(SUPPORTED_SHELL_GRAMMAR.wrappers),...SHELL_BUILTINS,'bash','rm','truncate','find'])) {
   const pageId=await ctx.db.insert('manPages',{releaseId,datasetReleaseId:'differential',externalId:name,locale:'en',distro:'debian',name,section:'1',sitemapPage:0,title:name,description:`Manual for ${name}`,sourcePath:name,contentSha256:name,hasParseWarnings:false});
   const required=SUPPORTED_SHELL_GRAMMAR.wrappers[name]??[];
   const optional=SUPPORTED_SHELL_GRAMMAR.optionalWrapperArguments[name]??[];
   const switches=EXECUTING_WRAPPER_SWITCHES[name]??[];
   const extra=name==='truncate'?['-s']:name==='find'?['-maxdepth','-exec','-execdir','-ok','-okdir']:[];
   for(const flag of new Set([...required,...optional,...switches,...extra])) {
    const takesArgument=required.includes(flag)||optional.includes(flag)||extra.includes(flag);
    await ctx.db.insert('manPageOptionFlags',{releaseId,pageId,nameNorm:name,section:'1',flag,flags:flag+(takesArgument?' VALUE':''),anchorId:flag.slice(1),takesArgument,argumentOptional:optional.includes(flag)});
   }
   if(name==='bash') for(const syntax of ['assignment','redirect','quoting','list','pipeline']) await ctx.db.insert('manPageSymbols',{releaseId,pageId,name,section:'1',title:name,description:name,kind:'shell',term:`shell:${syntax}`,termNorm:`shell:${syntax}`,anchorId:syntax,excerpt:syntax});
  }
 });
 const counts={lines:cases.length,ran:0,targetFacts:0,truePositives:0,falsePositives:0,falseNegatives:0};
 const failures:Array<{cmd:string;ran:boolean;diagnostics:string[]}>=[];
 for(let i=0;i<cases.length;i++) {
  const c=cases[i],ran=(bits[i>>3]&(1<<(i&7)))!==0;
  const result=await t.query(api.explain.explain,{cmd:c.cmd,distro:'debian'});
  const targetFact=c.target==='rm'?'rm deletes files.':'truncate changes file sizes; a size of 0 empties a file.';
  // Overwrite facts concern shell redirection, not the target executable;
  // the differential oracle here specifically proves rm/truncate admission.
  const emitted=result.stages.some(stage=>stage.destructive.some(note=>note.description===targetFact));
  if(ran) counts.ran++;
  if(emitted) counts.targetFacts++;
  if(ran&&emitted) counts.truePositives++;
  if(ran&&!emitted) counts.falseNegatives++;
  if(!ran&&emitted) {counts.falsePositives++;failures.push({cmd:c.cmd,ran,diagnostics:result.diagnostics});}
 }
 if(process.env.BM_DIFFERENTIAL_REPORT) writeFileSync(process.env.BM_DIFFERENTIAL_REPORT,JSON.stringify({counts,failures},null,2));
 console.info('GNU differential:',JSON.stringify(counts));
 expect(failures.slice(0,40),JSON.stringify(failures.slice(0,40),null,2)).toEqual([]);
 expect(counts.falsePositives).toBe(0);
},600_000);
