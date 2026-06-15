import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    pageCount: v.number(),
  })
    .index("by_datasetReleaseId", ["datasetReleaseId"])
    .index("by_locale_and_distro_and_datasetReleaseId", [
      "locale",
      "distro",
      "datasetReleaseId",
    ]),

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
  }).index("by_releaseId_and_section", ["releaseId", "section"]),

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
    hasParseWarnings: v.boolean(),
  })
    .index("by_contentSha256", ["contentSha256"])
    .index("by_releaseId_and_externalId", ["releaseId", "externalId"])
    .index("by_releaseId_and_name", ["releaseId", "name"])
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
    .index("by_blobId", ["blobId"]),

  manPageContentBlobs: defineTable({
    contentSha256: v.string(),
    storageId: v.optional(v.id("_storage")),
    docJson: v.optional(v.string()),
    synopsisJson: v.optional(v.string()),
    optionsJson: v.optional(v.string()),
    seeAlsoJson: v.optional(v.string()),
  }).index("by_contentSha256", ["contentSha256"]),

  manPageContentBlobChunks: defineTable({
    blobId: v.id("manPageContentBlobs"),
    contentSha256: v.string(),
    kind: contentJsonKindValidator,
    chunkIndex: v.number(),
    chunk: v.string(),
  })
    .index("by_blobId_and_kind_and_chunkIndex", ["blobId", "kind", "chunkIndex"])
    .index("by_contentSha256_and_kind_and_chunkIndex", [
      "contentSha256",
      "kind",
      "chunkIndex",
    ]),

  manPageContentChunks: defineTable({
    contentId: v.id("manPageContents"),
    pageId: v.id("manPages"),
    kind: contentJsonKindValidator,
    chunkIndex: v.number(),
    chunk: v.string(),
  })
    .index("by_contentId_and_kind_and_chunkIndex", ["contentId", "kind", "chunkIndex"])
    .index("by_pageId_and_kind_and_chunkIndex", ["pageId", "kind", "chunkIndex"]),

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
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["releaseId", "section"],
    }),

  manPageLinks: defineTable({
    releaseId: v.id("datasetReleases"),
    fromPageId: v.id("manPages"),
    fromExternalId: v.string(),
    toExternalId: v.optional(v.string()),
    toName: v.string(),
    toSection: v.string(),
    linkType: v.union(v.literal("see_also"), v.literal("xref")),
  })
    .index("by_releaseId", ["releaseId"])
    .index("by_fromPageId_and_linkType", ["fromPageId", "linkType"]),

  licensePackages: defineTable({
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    packageName: v.string(),
    version: v.string(),
    hasLicenseText: v.boolean(),
  })
    .index("by_releaseId_and_packageName", ["releaseId", "packageName"])
    .index("by_releaseId_and_hasLicenseText", ["releaseId", "hasLicenseText"]),

  licenses: defineTable({
    releaseId: v.id("datasetReleases"),
    datasetReleaseId: v.string(),
    packageName: v.string(),
    licenseId: v.string(),
    licenseName: v.string(),
    licenseText: v.string(),
    sourceUrl: v.optional(v.string()),
  }).index("by_releaseId_and_packageName", ["releaseId", "packageName"]),

  rateLimitBuckets: defineTable({
    key: v.string(),
    count: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
});
