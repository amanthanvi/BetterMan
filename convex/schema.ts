import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  generatedPartNameValidator,
  generatedPartValidator,
  pageExamplesPartValidator,
  tldrPartValidator,
} from "./_generatedLayer";
import { symbolInput } from './_symbols';

export const distroValidator = v.union(
  v.literal("debian"),
  v.literal("ubuntu"),
  v.literal("fedora"),
  v.literal("arch"),
  v.literal("alpine"),
  v.literal("freebsd"),
  v.literal("macos"),
);

export const datasetStageValidator = v.union(
  v.literal("staging"),
  v.literal("prod"),
);

// Convex functions deploy before the frontend. Keep accepting the legacy field
// so the previous frontend and historical rollbacks remain compatible; public
// handlers ignore it and resolve PUBLIC_DATASET_STAGE instead.
export const publicStageCompatibilityValidator = v.optional(datasetStageValidator);

const contentJsonKindValidator = v.union(
  v.literal("docJson"),
  v.literal("synopsisJson"),
  v.literal("optionsJson"),
  v.literal("seeAlsoJson"),
);

export default defineSchema({
  datasetReleases: defineTable({
    datasetReleaseId: v.string(),
    locale: v.string(),
    distro: distroValidator,
    imageRef: v.string(),
    imageDigest: v.string(),
    ingestedAt: v.string(),
    packageManifestJson: v.optional(v.string()),
    shardedPageUploads: v.optional(v.boolean()),
    packageBatchCount: v.optional(v.number()),
    uploadedPackageBatchCount: v.optional(v.number()),
    pageCount: v.number(),
    providerCount: v.optional(v.number()),
    aliasCount: v.optional(v.number()),
    licenseCount: v.optional(v.number()),
    uploadedPageCount: v.optional(v.number()),
    uploadedAliasCount: v.optional(v.number()),
    uploadedLicenseCount: v.optional(v.number()),
    manifestVerified: v.optional(v.boolean()),
    manifestDeclarationDigest: v.optional(v.string()),
    manifestBasis: v.optional(v.union(v.literal("declared"), v.literal("legacy_unverified_aliases"))),
    manifestError: v.optional(v.string()),
    manifestVerification: v.optional(v.object({
      phase: v.union(v.literal("pages"), v.literal("aliases"), v.literal("packages"), v.literal("licenses"), v.literal("complete")),
      cursor: v.union(v.string(), v.null()),
      pageCount: v.number(),
      aliasCount: v.number(),
      licenseCount: v.number(),
      expectedLicenseCount: v.number(),
      sections: v.array(v.object({ section: v.string(), total: v.number(), uploaded: v.number() })),
      jobId: v.optional(v.id("_scheduled_functions")),
    })),
    sealed: v.optional(v.boolean()),
    previousProdReleaseId: v.optional(v.id("datasetReleases")),
    previousProdReleaseRecorded: v.optional(v.boolean()),
    derivedExpectedKey: v.optional(v.string()),
    derivedCompletedKey: v.optional(v.string()),
    derivedInitialized: v.optional(v.boolean()),
    derivedPointers: v.optional(v.array(v.object({ distro: distroValidator, datasetReleaseId: v.string() }))),
    derivedLeaseUntil: v.optional(v.number()),
    pruning: v.optional(v.boolean()),
    // Successful page batches invalidate completion, including resumed uploads.
    relatedMetadataVersion: v.optional(v.number()),
    relatedMetadataCompletedVersion: v.optional(v.number()),
    relatedMetadataBackfillAttempts: v.optional(v.number()),
    relatedMetadataBackfillJobId: v.optional(v.id("_scheduled_functions")),
    relatedMetadataBackfillCursor: v.optional(v.union(v.string(), v.null())),
    relatedMetadataBackfillVersion: v.optional(v.number()),
  })
    .index("by_datasetReleaseId", ["datasetReleaseId"]),

  // Large provenance is read only by the license/provenance surface, never
  // by ordinary release lookups. Legacy rows retain their old optional field.
  releaseManifests: defineTable({
    releaseId: v.id("datasetReleases"),
    json: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  }).index("by_releaseId", ["releaseId"]).index("by_storageId", ["storageId"]),

  // Upload writers touch one of 16 shards instead of every writer patching
  // the same release/stat row. Seal folds and verifies all shards atomically.
  releasePageUploadShards: defineTable({
    releaseId: v.id("datasetReleases"),
    bucket: v.number(),
    pageCount: v.number(),
    sections: v.array(v.object({ section: v.string(), uploaded: v.number() })),
  }).index("by_releaseId_and_bucket", ["releaseId", "bucket"]),

  releasePackageBatches: defineTable({
    releaseId: v.id("datasetReleases"),
    batchIndex: v.number(),
    digest: v.string(),
    count: v.number(),
    licenseCount: v.number(),
    uploaded: v.boolean(),
  }).index("by_releaseId_and_batchIndex", ["releaseId", "batchIndex"]),

  activeReleases: defineTable({
    stage: datasetStageValidator,
    locale: v.string(),
    distro: distroValidator,
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    activatedAt: v.string(),
  }).index("by_stage_and_locale_and_distro", ["stage", "locale", "distro"]),

  releaseSectionStats: defineTable({
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    section: v.string(),
    label: v.string(),
    total: v.number(),
    uploaded: v.optional(v.number()),
  }).index("by_releaseId_and_section", ["releaseId", "section"]),

  // Alternate providers are not search/browse/sitemap rows. Canonical routes
  // keep the existing unique lookup and page-view read budget.
  manPageProviders: defineTable({
    releaseId: v.id("datasetReleases"), datasetReleaseId: v.string(),
    externalId: v.string(), name: v.string(), section: v.string(),
    title: v.string(), description: v.string(), sourcePath: v.string(),
    sourcePackage: v.string(), sourcePackageVersion: v.optional(v.string()),
    contentSha256: v.string(), hasParseWarnings: v.boolean(), blobId: v.id("manPageContentBlobs"),
  }).index("by_releaseId_and_externalId", ["releaseId", "externalId"])
    .index("by_releaseId_and_route_and_package_and_path", ["releaseId", "name", "section", "sourcePackage", "sourcePath"])
    .index("by_blobId", ["blobId"]),

  releaseProviderUploadShards: defineTable({
    releaseId: v.id("datasetReleases"), bucket: v.number(), count: v.number(),
  }).index("by_releaseId_and_bucket", ["releaseId", "bucket"]),

  manPages: defineTable({
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    externalId: v.string(),
    locale: v.string(),
    distro: distroValidator,
    name: v.string(),
    section: v.string(),
    sitemapPage: v.number(),
    title: v.string(),
    description: v.string(),
    sourcePath: v.string(),
    sourcePackage: v.optional(v.string()),
    sourcePackageVersion: v.optional(v.string()),
    contentSha256: v.string(),
    optionSignatureHash: v.optional(v.string()),
    optionSignatureBytes: v.optional(v.number()),
    optionInputBytes: v.optional(v.number()),
    optionContentBytes: v.optional(v.number()),
    optionExtractorVersion: v.optional(v.number()),
    hasParseWarnings: v.boolean(),
    verifiedFlagUsage: v.optional(v.array(v.object({
      flag: v.string(), count: v.number(), source: v.union(v.literal("examples"), v.literal("tldr")),
    }))),
  })
    .index("by_releaseId_and_sourcePackage_and_name_and_section", ["releaseId", "sourcePackage", "name", "section"])
    .index("by_contentSha256", ["contentSha256"])
    .index("by_optionSignatureHash", ["optionSignatureHash"])
    .index("by_contentSha256_and_optionExtractorVersion", ["contentSha256", "optionExtractorVersion"])
    .index("by_releaseId_and_externalId", ["releaseId", "externalId"])
    // by_releaseId_and_name_and_section also covers releaseId+name lookups.
    .index("by_releaseId_and_name_and_section", ["releaseId", "name", "section"])
    .index("by_releaseId_and_section_and_name", ["releaseId", "section", "name"])
    .index("by_releaseId_and_sitemapPage_and_name", ["releaseId", "sitemapPage", "name"]),

  manPageContents: defineTable({
    pageId: v.id("manPages"),
    contentSha256: v.optional(v.string()),
    blobId: v.optional(v.id("manPageContentBlobs")),
    storageId: v.optional(v.id("_storage")),
    docJson: v.optional(v.string()),
    synopsisJson: v.optional(v.string()),
    optionsJson: v.optional(v.string()),
    seeAlsoJson: v.optional(v.string()),
  })
    .index("by_pageId", ["pageId"])
    .index("by_blobId", ["blobId"])
    .index("by_storageId", ["storageId"]),

  manPageContentBlobs: defineTable({
    contentSha256: v.string(),
    contentDigest: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    docJson: v.optional(v.string()),
    synopsisJson: v.optional(v.string()),
    optionsJson: v.optional(v.string()),
    seeAlsoJson: v.optional(v.string()),
  })
    .index("by_contentSha256", ["contentSha256"])
    .index("by_contentDigest", ["contentDigest"])
    .index("by_storageId", ["storageId"]),

  manPageContentBlobChunks: defineTable({
    blobId: v.id("manPageContentBlobs"),
    contentSha256: v.string(),
    kind: contentJsonKindValidator,
    chunkIndex: v.number(),
    chunk: v.string(),
  })
    .index("by_blobId_and_kind_and_chunkIndex", ["blobId", "kind", "chunkIndex"]),

  manPageContentChunks: defineTable({
    contentId: v.id("manPageContents"),
    pageId: v.id("manPages"),
    kind: contentJsonKindValidator,
    chunkIndex: v.number(),
    chunk: v.string(),
  })
    .index("by_contentId_and_kind_and_chunkIndex", ["contentId", "kind", "chunkIndex"])
    .index("by_pageId_and_kind_and_chunkIndex", ["pageId", "kind", "chunkIndex"]),

  // Name prefix indexes plus a search index over the one-line NAME description.
  // Body full-text search was retired: it read the whole corpus per query.
  // Descriptions are short, so this index stays cheap and lets "copy files"
  // find cp(1). searchText remains a compact metadata string for ops only.
  manPageSearchDocuments: defineTable({
    pageId: v.id("manPages"),
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    name: v.string(),
    nameNorm: v.string(),
    section: v.string(),
    title: v.string(),
    description: v.string(),
    descNorm: v.string(),
    searchText: v.string(),
    snippetText: v.string(),
  })
    .index("by_releaseId_and_nameNorm", ["releaseId", "nameNorm"])
    .index("by_releaseId_and_section_and_nameNorm", [
      "releaseId",
      "section",
      "nameNorm",
    ])
    .searchIndex("search_desc", {
      searchField: "descNorm",
      filterFields: ["releaseId", "section"],
    }),

  // One row per (page, flag) derived from parsed OPTIONS at ingest, so a flag
  // query is an exact, case-sensitive index lookup that can be scoped by a
  // page-name prefix. Releases ingested before this table have no rows.
  manPageOptionFlags: defineTable({
    releaseId: v.id("datasetReleases"),
    pageId: v.id("manPages"),
    nameNorm: v.string(),
    section: v.string(),
    flag: v.string(),
    anchorId: v.string(),
    // The option's flag text as written, for the result snippet.
    flags: v.string(),
    takesArgument: v.optional(v.boolean()),
    argumentOptional: v.optional(v.boolean()),
    excerpt: v.optional(v.string()),
  })
    .index("by_releaseId_and_flag_and_nameNorm", ["releaseId", "flag", "nameNorm"])
    .index("by_pageId_and_flag", ["pageId", "flag"])
    .index("by_releaseId_and_section_and_flag_and_nameNorm", [
      "releaseId",
      "section",
      "flag",
      "nameNorm",
    ]),

  manPageSymbols: defineTable({
    ...symbolInput.fields,
    releaseId: v.id('datasetReleases'), pageId: v.id('manPages'),
    termNorm: v.string(), name: v.string(), section: v.string(), title: v.string(), description: v.string(),
  }).index('by_releaseId_and_termNorm', ['releaseId', 'termNorm'])
    .index('by_releaseId_and_section_and_termNorm', ['releaseId', 'section', 'termNorm']),

  // `.so` include stubs: /man/<name>/<section> redirects to the target page.
  manPageAliasProviders: defineTable({
    releaseId: v.id("datasetReleases"), name: v.string(), section: v.string(),
    sourcePackage: v.string(), sourcePath: v.string(), targetName: v.string(), targetSection: v.string(), targetPackage: v.string(),
  }).index("by_releaseId_and_route_and_package_and_path", ["releaseId", "name", "section", "sourcePackage", "sourcePath"]),

  manPageAliases: defineTable({
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    name: v.string(),
    section: v.string(),
    targetName: v.string(),
    targetSection: v.string(),
    targetPackage: v.optional(v.string()),
  })
    .index("by_releaseId_and_name_and_section", ["releaseId", "name", "section"])
    .index("by_releaseId_and_name", ["releaseId", "name"])
    .index("by_releaseId_and_targetName_and_targetSection", ["releaseId", "targetName", "targetSection"]),

  manPageLinks: defineTable({
    releaseId: v.id("datasetReleases"),
    fromPageId: v.id("manPages"),
    fromExternalId: v.string(),
    toExternalId: v.optional(v.string()),
    toName: v.string(),
    toSection: v.string(),
    // The post-seal backfill caches the target or toMissing; older links fall back to a lookup.
    toMissing: v.optional(v.boolean()),
    toTitle: v.optional(v.string()),
    toDescription: v.optional(v.string()),
    linkType: v.union(v.literal("see_also"), v.literal("xref")),
  })
    .index("by_releaseId", ["releaseId"])
    .index("by_fromPageId_and_linkType", ["fromPageId", "linkType"])
    .index("by_releaseId_and_toName_and_toSection", ["releaseId", "toName", "toSection"]),

  licensePackages: defineTable({
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    packageName: v.string(),
    version: v.string(),
    hasLicenseText: v.boolean(),
  })
    .index("by_releaseId_and_packageName", ["releaseId", "packageName"]),

  licenses: defineTable({
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    packageName: v.string(),
    licenseId: v.string(),
    licenseName: v.string(),
    licenseText: v.string(),
    sourceUrl: v.optional(v.string()),
  }).index("by_releaseId_and_packageName", ["releaseId", "packageName"]),

  // Operational progress and pins are separate from frequently-read release records.
  derivedBuilds: defineTable({
    locale: v.string(), key: v.string(), fingerprint: v.string(), revision: v.number(),
    pointers: v.array(v.object({ distro: distroValidator, releaseId: v.id("datasetReleases"), datasetReleaseId: v.string() })),
    inputReleaseIds: v.array(v.id("datasetReleases")),
    phase: v.union(v.literal("inputs"), v.literal("summaries"), v.literal("complete"), v.literal("blocked"), v.literal("failed")),
    releaseIndex: v.number(), cursor: v.union(v.string(), v.null()),
    retrying: v.optional(v.boolean()), retryCursor: v.optional(v.union(v.string(), v.null())), failedPages: v.optional(v.number()),
    pendingJobs: v.optional(v.number()), scanned: v.optional(v.number()), recomputed: v.optional(v.number()),
    cacheHits: v.optional(v.number()), skipped: v.optional(v.number()), batches: v.optional(v.number()),
    lastProgressAt: v.optional(v.number()), startedAt: v.optional(v.number()),
    errorSamples: v.optional(v.array(v.object({ name: v.string(), section: v.string(), code: v.string() }))),
    jobId: v.optional(v.id("_scheduled_functions")), error: v.optional(v.string()),
    batchPageLimit: v.optional(v.number()), isolateNext: v.optional(v.boolean()),
  }).index("by_locale", ["locale"]),

  derivedScanJobs: defineTable({
    locale: v.string(), releaseId: v.id("datasetReleases"), cursor: v.union(v.string(), v.null()),
    createdForKey: v.string(), scanned: v.number(), kind: v.union(v.literal("pages"), v.literal("aliases")),
  }).index("by_locale", ["locale"])
    .index("by_locale_and_releaseId_and_kind", ["locale", "releaseId", "kind"])
    .index("by_releaseId", ["releaseId"]),

  derivedRetryPages: defineTable({
    locale: v.string(), key: v.string(), releaseId: v.id("datasetReleases"), distro: distroValidator,
    name: v.string(), section: v.string(), error: v.string(),
  }).index("by_locale_and_key", ["locale", "key"])
    .index("by_releaseId", ["releaseId"]),

  derivedReleaseStatus: defineTable({
    releaseId: v.id("datasetReleases"), locale: v.string(), required: v.boolean(),
    pendingRefs: v.number(), readyRows: v.number(), leaseUntil: v.number(), updatedAt: v.number(),
  }).index("by_releaseId", ["releaseId"]),

  derivedPortabilityChunks: defineTable({
    releaseId: v.id("datasetReleases"), derivedId: v.id("manPageDerived"), key: v.string(), chunkIndex: v.number(), json: v.string(),
  }).index("by_derivedId_and_chunkIndex", ["derivedId", "chunkIndex"])
    .index("by_releaseId", ["releaseId"]),

  derivedSignatureBackfills: defineTable({
    releaseId: v.id("datasetReleases"), locale: v.string(), cursor: v.union(v.string(), v.null()),
    state: v.union(v.literal("pending"), v.literal("complete"), v.literal("failed")),
    processed: v.number(), cacheHits: v.number(), failures: v.number(), error: v.optional(v.string()),
    jobId: v.optional(v.id("_scheduled_functions")), revision: v.number(), lastProgressAt: v.number(), migrationPin: v.optional(v.boolean()), refreshNeeded: v.optional(v.boolean()),
    phase: v.optional(v.union(v.literal("scan"), v.literal("retry"))),
  }).index("by_releaseId", ["releaseId"])
    .index("by_state_and_locale", ["state", "locale"]),

  derivedSignatureFailures: defineTable({ releaseId: v.id("datasetReleases"), pageId: v.id("manPages"), error: v.string() })
    .index("by_releaseId_and_pageId", ["releaseId", "pageId"]),

  derivedLegacySignatures: defineTable({ sourceKey: v.string(), optionsJson: v.string() }).index("by_sourceKey", ["sourceKey"]),

  derivedSignatureCache: defineTable({
    key: v.string(), contentSha256: v.string(), extractorVersion: v.union(v.number(), v.null()),
    signatureHash: v.string(), optionsJson: v.string(),
  }).index("by_key", ["key"])
    .index("by_contentSha256_and_extractorVersion", ["contentSha256", "extractorVersion"]),

  derivedPageInputs: defineTable({
    releaseId: v.id("datasetReleases"), pageId: v.id("manPages"),
    name: v.string(), section: v.string(), contentSha256: v.string(),
    optionsJson: v.string(), truncated: v.boolean(),
    signatureHash: v.optional(v.string()), extractorVersion: v.optional(v.union(v.number(), v.null())),
    status: v.optional(v.union(v.literal("ready"), v.literal("unavailable"))), error: v.optional(v.string()),
  }).index("by_releaseId_and_pageId", ["releaseId", "pageId"])
    .index("by_releaseId_and_name_and_section", ["releaseId", "name", "section"])
    .index("by_signatureHash", ["signatureHash"]),

  manPageDerived: defineTable({
    releaseId: v.id("datasetReleases"), pageId: v.id("manPages"), key: v.string(), summaryJson: v.string(),
    locale: v.optional(v.string()), distro: v.optional(distroValidator), name: v.optional(v.string()), section: v.optional(v.string()),
    sourceContentSha256: v.optional(v.string()), sourceSignatureHash: v.optional(v.string()), dependencyFingerprint: v.optional(v.string()),
    detailBytes: v.optional(v.number()), detailChunkCount: v.optional(v.number()), cleanupPending: v.optional(v.boolean()),
  }).index("by_releaseId_and_pageId", ["releaseId", "pageId"])
    .index("by_locale_and_distro_and_name_and_section", ["locale", "distro", "name", "section"]),

  // Generated layer (B6), one row per page content hash. Not owned by a
  // release: identical pages share it and pruning a release leaves it alone.
  manPageGenerated: defineTable({
    contentSha256: v.string(),
    updatedAt: v.string(),
    page: v.optional(pageExamplesPartValidator),
    tldr: v.optional(tldrPartValidator),
    tldrCommit: v.optional(v.string()),
    generated: v.optional(generatedPartValidator),
    // Parts an operator removed; uploads skip them until the page changes.
    suppressed: v.optional(v.array(generatedPartNameValidator)),
  }).index("by_contentSha256", ["contentSha256"]),

  rateLimitBuckets: defineTable({
    key: v.string(),
    count: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
});
