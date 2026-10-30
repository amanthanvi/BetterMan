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
  expect(await t.action(api.content.getManByNameAndSection,{distro:'debian',name:'acosf',section:'3'})).toEqual({kind:'alias',name:'acos',section:'3',datasetReleaseId:expect.any(String)});
  expect(await t.action(api.content.getManByNameAndSection,{distro:'debian',name:'acosf',section:'3',pkg:'other-doc'})).toEqual({kind:'alias',name:'acos',section:'3',pkg:'math-doc',datasetReleaseId:expect.any(String)});
  expect(await t.query(internal.maintenance.measureReleaseBatch, { datasetReleaseId:'stub-providers', table:'manPageAliases', cursor:null })).toMatchObject({documents:1,isDone:true});
  expect(await t.query(internal.maintenance.measureReleaseBatch, { datasetReleaseId:'stub-providers', table:'datasetReleases', cursor:null })).toMatchObject({documents:1,isDone:true});
  expect(await t.run(ctx=>ctx.db.query('manPages').take(5))).toHaveLength(1);
  expect(await t.run(ctx=>ctx.db.query('manPageSearchDocuments').take(5))).toHaveLength(1);
  expect(await t.run(ctx=>ctx.db.query('manPageAliasProviders').take(5))).toHaveLength(2);
  await expect(t.mutation(internal.ingest.insertAliases,{datasetReleaseId:'stub-providers',aliases:[{...alias,sourcePackage:'late',providerOnly:true}]})).rejects.toThrow('RELEASE_SEALED');
  // Retire through a real replacement build so B7 releases durable pins/rows;
  // deleting a prod pointer alone is intentionally insufficient for pruning.
  await t.mutation(internal.ingest.createRelease, { datasetReleaseId: "stub-providers-replacement", locale: "en", distro: "debian",
    imageRef: "fixture", imageDigest: "fixture", ingestedAt: "2026-10-29T00:00:00Z", packageManifest: null,
    pageCount: 1, aliasCount: 0, licenseCount: 0, sectionTotals: [{section: "1", total: 1}], packageBatches: [],
  });
  await t.mutation(internal.ingest.insertPages, { datasetReleaseId: "stub-providers-replacement", pages: [{
    externalId: "replacement", name: "replacement", section: "1", sitemapPage: 0, title: "replacement", description: "replacement",
    sourcePath: "replacement.1", sourcePackage: null, sourcePackageVersion: null, contentSha256: "replacement", hasParseWarnings: false,
    extractorVersion: 1, doc: {toc: [], blocks: []}, synopsis: null, options: [], seeAlso: null, searchText: "", snippetText: "", links: [],
  }] });
  const replace = () => t.mutation(internal.ingest.activateRelease, { datasetReleaseId: "stub-providers-replacement", stage: "prod", activatedAt: "now" });
  await replace();
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await replace();
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  while (!(await t.mutation(internal.maintenance.deleteInactiveReleaseBatch,{datasetReleaseId:'stub-providers',confirmDatasetReleaseId:'stub-providers',maxDocs:5})).deletedRelease) { /* resumable batches */ }
  expect(await t.run(ctx=>ctx.db.query('manPageAliasProviders').take(1))).toHaveLength(0);
});

it('selects an exact-case real provider ahead of a normalized alternative alias', async () => {
  vi.useFakeTimers(); vi.stubEnv('CONVEX_INGEST_SECRET', 'local');
  const t = convexTest(schema, modules);
  await t.mutation(internal.ingest.createRelease, { datasetReleaseId:'case-providers',locale:'en',distro:'debian',imageRef:'pinned',imageDigest:'sha',ingestedAt:'now',packageManifest:null,
    pageCount:1,aliasCount:1,providerCount:3,licenseCount:0,packageBatches:[],sectionTotals:[{section:'1',total:1}] });
  const metadata = { section:'1',sourcePackageVersion:'1',sitemapPage:1,hasParseWarnings:false,doc:{blocks:[],toc:[]},synopsis:null,options:null,seeAlso:null,searchText:'fixture',snippetText:'fixture',links:[] };
  const response = await t.fetch('/ingest/pages/storage', { method:'POST',headers:{authorization:'Bearer local','content-type':'application/json'},body:JSON.stringify({datasetReleaseId:'case-providers',pages:[
    {...metadata,externalId:'tnftp',name:'tnftp',title:'tnftp(1)',description:'terminal FTP',sourcePackage:'tnftp',sourcePath:'usr/share/man/man1/tnftp.1.gz',contentSha256:'terminal'},
    {...metadata,externalId:'FTP-same',name:'ftp',title:'FTP(1)',description:'Same FTP',sourcePackage:'same-ftp',sourcePath:'usr/share/man/man1/FTP.1.gz',contentSha256:'terminal',providerOnly:true},
    {...metadata,externalId:'FTP',name:'ftp',title:'FTP(1)',description:'GNUstep FTP',sourcePackage:'ftp.app',sourcePath:'usr/share/man/man1/FTP.1.gz',contentSha256:'gui',providerOnly:true},
  ]}) });
  expect(response.status).toBe(200);
  await t.mutation(internal.ingest.insertAliases,{datasetReleaseId:'case-providers',aliases:[{name:'ftp',section:'1',targetName:'tnftp',targetSection:'1',sourcePackage:'tnftp',sourcePath:'usr/share/man/man1/tnftp.1.gz',targetPackage:'tnftp',providerOnly:false}]});
  await t.mutation(internal.ingest.activateRelease,{datasetReleaseId:'case-providers',stage:'prod',activatedAt:'now'});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await t.mutation(internal.ingest.activateRelease,{datasetReleaseId:'case-providers',stage:'prod',activatedAt:'now'});
  const args = { distro:'debian' as const, section:'1' };
  expect(await t.action(api.content.getManByNameAndSection,{...args,name:'ftp'})).toEqual({kind:'alias',name:'tnftp',section:'1',datasetReleaseId:expect.any(String)});
  expect(await t.action(api.content.getManByNameAndSection,{...args,name:'ftp',pkg:'same-ftp'}))
    .toMatchObject({kind:'page',data:{page:{indexable:false},providers:{defaultPackage:null,sameAsDefault:true}}});
  for (const lookup of [{name:'FTP'}, {name:'ftp',pkg:'ftp.app'}]) {
    expect(await t.action(api.content.getManByNameAndSection,{...args,...lookup})).toMatchObject({kind:'page',data:{page:{sourcePackage:'ftp.app',description:'GNUstep FTP',indexable:false},providers:{sameAsDefault:false}}});
  }
});
