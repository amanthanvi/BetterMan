/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, expect, it, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
const modules = import.meta.glob('./**/*.ts');
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it('stores stub providers without page/search duplicates, verifies counts and redirects to their owner', async () => {
  vi.useFakeTimers(); vi.stubEnv('CONVEX_INGEST_SECRET', 'local');
  const t = convexTest(schema, modules);
  await t.mutation(internal.ingest.createRelease, { datasetReleaseId:'stub-providers',locale:'en',distro:'debian',imageRef:'pinned',imageDigest:'sha',ingestedAt:'now',packageManifest:null,
    pageCount:1,aliasCount:1,providerCount:2,licenseCount:0,packageBatches:[],sectionTotals:[{section:'3',total:1}] });
  const res = await t.fetch('/ingest/pages/storage', { method:'POST',headers:{authorization:'Bearer local','content-type':'application/json'},body:JSON.stringify({datasetReleaseId:'stub-providers',pages:[{
    externalId:'acos',name:'acos',section:'3',sourcePackage:'math-doc',sourcePackageVersion:'1',sourcePath:'man3/acos.3',sitemapPage:1,title:'acos(3)',description:'inverse cosine',contentSha256:'abc',hasParseWarnings:false,
    doc:{blocks:[],toc:[]},synopsis:null,options:null,seeAlso:null,searchText:'acos',snippetText:'acos',links:[],
  }]}) });
  expect(res.status).toBe(200);
  const alias = {name:'acosf',section:'3',targetName:'acos',targetSection:'3',targetPackage:'math-doc',sourcePackage:'math-doc',sourcePath:'man3/acosf.3',providerOnly:false};
  await t.mutation(internal.ingest.insertAliases,{datasetReleaseId:'stub-providers',aliases:[alias]});
  await expect(t.mutation(internal.ingest.activateRelease,{datasetReleaseId:'stub-providers',stage:'prod',activatedAt:'now'})).rejects.toThrow('RELEASE_MANIFEST_INCOMPLETE');
  await t.mutation(internal.ingest.insertAliases,{datasetReleaseId:'stub-providers',aliases:[{...alias,sourcePackage:'other-doc',providerOnly:true}]});
  await t.mutation(internal.ingest.insertAliases,{datasetReleaseId:'stub-providers',aliases:[alias]});
  await expect(t.mutation(internal.ingest.insertAliases,{datasetReleaseId:'stub-providers',aliases:[{...alias,targetPackage:'changed'}]})).rejects.toThrow('RELEASE_MANIFEST_CONFLICT');
  await t.mutation(internal.ingest.activateRelease,{datasetReleaseId:'stub-providers',stage:'prod',activatedAt:'now'});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.mutation(internal.ingest.activateRelease,{datasetReleaseId:'stub-providers',stage:'prod',activatedAt:'now'});
  expect(await t.action(api.content.getManByNameAndSection,{distro:'debian',name:'acosf',section:'3'})).toEqual({kind:'alias',name:'acos',section:'3'});
  expect(await t.action(api.content.getManByNameAndSection,{distro:'debian',name:'acosf',section:'3',pkg:'other-doc'})).toEqual({kind:'alias',name:'acos',section:'3',pkg:'math-doc'});
  expect(await t.query(internal.maintenance.measureReleaseBatch, { datasetReleaseId:'stub-providers', table:'manPageAliases', cursor:null })).toMatchObject({documents:1,isDone:true});
  expect(await t.query(internal.maintenance.measureReleaseBatch, { datasetReleaseId:'stub-providers', table:'datasetReleases', cursor:null })).toMatchObject({documents:1,isDone:true});
  expect(await t.run(ctx=>ctx.db.query('manPages').take(5))).toHaveLength(1);
  expect(await t.run(ctx=>ctx.db.query('manPageSearchDocuments').take(5))).toHaveLength(1);
  expect(await t.run(ctx=>ctx.db.query('manPageAliasProviders').take(5))).toHaveLength(2);
  await expect(t.mutation(internal.ingest.insertAliases,{datasetReleaseId:'stub-providers',aliases:[{...alias,sourcePackage:'late',providerOnly:true}]})).rejects.toThrow('RELEASE_SEALED');
  await t.run(async ctx=>{for(const p of await ctx.db.query('activeReleases').take(5))await ctx.db.delete(p._id);});
  while (!(await t.mutation(internal.maintenance.deleteInactiveReleaseBatch,{datasetReleaseId:'stub-providers',confirmDatasetReleaseId:'stub-providers',maxDocs:5})).deletedRelease) { /* resumable batches */ }
  expect(await t.run(ctx=>ctx.db.query('manPageAliasProviders').take(1))).toHaveLength(0);
});
