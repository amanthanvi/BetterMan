import { v } from "convex/values";
import { persistOptionSignature, persistPackedSignature } from "./_derivedInputs";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { contentChunks, splitContentFields, type ContentField, type ContentJsonKind } from "./_legacyContent";
import { datasetStageValidator, distroValidator } from "./schema";
import { scheduleRelatedMetadataBackfill } from "./related";
import { scheduleDerivedBuild } from "./derived";
import { recordOtherUploads, recordPageUploads, validateReleaseDeclaration, validateManifestSections, validManifestCount, verifyDeclaredManifest } from "./_releaseManifest";
import { insertProvider, recordProviderUploads } from "./_providers";
import { serializeStoredPayload, storedPayloadDigest } from "./_storedPayload";
import { MAX_OPTION_FLAG_ROWS_PER_PAGE, optionFlagRows, type OptionFlagRow } from "./_optionFlags";
import { insertSymbols, symbolInput } from './_symbols';
import {
  compactManPageSearchText,
  DATASET_STAGES,
  MAX_SNIPPET_TEXT_CHARS,
  sectionLabel,
  truncateText,
} from "./lib";

const sectionStatInput = v.object({
  section: v.string(),
  total: v.number(),
});

const licensePackageInput = v.object({
  name: v.string(),
  version: v.string(),
  hasLicenseText: v.boolean(),
});

const pageLinkInput = v.object({
  toExternalId: v.union(v.string(), v.null()),
  toName: v.string(),
  toSection: v.string(),
  linkType: v.union(v.literal("see_also"), v.literal("xref")),
});

const pageInput = v.object({
  externalId: v.string(),
  name: v.string(),
  section: v.string(),
  sitemapPage: v.number(),
  title: v.string(),
  description: v.string(),
  sourcePath: v.string(),
  sourcePackage: v.union(v.string(), v.null()),
  sourcePackageVersion: v.union(v.string(), v.null()),
  contentSha256: v.string(),
  hasParseWarnings: v.boolean(),
  extractorVersion: v.optional(v.number()),
  doc: v.any(),
  synopsis: v.any(),
  options: v.any(),
  seeAlso: v.any(),
  searchText: v.string(),
  snippetText: v.string(),
  links: v.array(pageLinkInput),
  symbols: v.optional(v.array(symbolInput)),
});

// Derived by the /ingest/pages/storage action from page.options, which the
// stored payload keeps out of this mutation. Not part of the ingest contract.
const optionFlagInput = v.object({
  flag: v.string(),
  anchorId: v.string(),
  flags: v.string(),
  takesArgument: v.optional(v.boolean()),
  argumentOptional: v.optional(v.boolean()),
  excerpt: v.optional(v.string()),
});

const storedPageInput = v.object({
  providerOnly: v.optional(v.boolean()),
  externalId: v.string(),
  name: v.string(),
  section: v.string(),
  sitemapPage: v.number(),
  title: v.string(),
  description: v.string(),
  sourcePath: v.string(),
  sourcePackage: v.union(v.string(), v.null()),
  sourcePackageVersion: v.union(v.string(), v.null()),
  contentSha256: v.string(),
  hasParseWarnings: v.boolean(),
  extractorVersion: v.optional(v.number()),
  contentStorageId: v.id("_storage"),
  optionFlags: v.optional(v.array(optionFlagInput)),
  optionsSignature: v.optional(v.string()),
  symbols: v.optional(v.array(symbolInput)),
  searchText: v.string(),
  snippetText: v.string(),
  links: v.array(pageLinkInput),
});

const aliasInput = v.object({
  sourcePackage: v.optional(v.string()), sourcePath: v.optional(v.string()),
  targetPackage: v.optional(v.string()), providerOnly: v.optional(v.boolean()),
  name: v.string(),
  section: v.string(),
  targetName: v.string(),
  targetSection: v.string(),
});

const licenseInput = v.object({
  packageName: v.string(),
  licenseId: v.string(),
  licenseName: v.string(),
  licenseText: v.string(),
  sourceUrl: v.union(v.string(), v.null()),
});

async function releaseIsImmutable(ctx: MutationCtx, release: Doc<"datasetReleases">): Promise<boolean> {
  if (release.pruning) throw new Error("RELEASE_PRUNING");
  if (release.sealed) return true;
  // Legacy active releases are protected immediately, before the deployment
  // migration persists their seal. These reads also serialize with promotion.
  for (const stage of DATASET_STAGES) {
    const pointer = await ctx.db
      .query("activeReleases")
      .withIndex("by_stage_and_locale_and_distro", (q) =>
        q.eq("stage", stage).eq("locale", release.locale).eq("distro", release.distro),
      )
      .unique();
    if (pointer?.releaseId === release._id) return true;
  }
  return false;
}

function optionalString(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function jsonField(value: unknown): string | undefined {
  if (value === null || typeof value === "undefined") return undefined;
  return JSON.stringify(value);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) return nested;
    return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  });
}

async function validateNewPageRoute(ctx: MutationCtx, releaseId: Id<"datasetReleases">, page: { name: string; section: string; externalId: string }) {
  if (!page.externalId.trim() || !page.name || page.name !== page.name.trim().toLowerCase() ||
      !page.section || page.section !== page.section.trim().toLowerCase()) throw new Error("INVALID_MAN_PAGE_ROUTE");
  const existing = await ctx.db.query("manPages")
    .withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId).eq("name", page.name).eq("section", page.section)).unique();
  const alias = await ctx.db.query("manPageAliases")
    .withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", releaseId).eq("name", page.name).eq("section", page.section)).unique();
  if (existing || alias) throw new Error("DUPLICATE_MAN_PAGE_ROUTE");
}

async function insertOptionFlags(
  ctx: MutationCtx,
  args: {
    releaseId: Id<"datasetReleases">;
    pageId: Id<"manPages">;
    page: { name: string; section: string };
    rows: OptionFlagRow[];
  },
) {
  for (const row of args.rows.slice(0, MAX_OPTION_FLAG_ROWS_PER_PAGE)) {
    await ctx.db.insert("manPageOptionFlags", {
      releaseId: args.releaseId,
      pageId: args.pageId,
      nameNorm: args.page.name.toLowerCase(),
      section: args.page.section,
      flag: row.flag,
      anchorId: row.anchorId,
      flags: row.flags,
      ...(row.takesArgument ? { takesArgument: true } : {}),
      ...(row.argumentOptional ? {argumentOptional:true} : {}),
      ...(row.excerpt ? { excerpt: row.excerpt } : {}),
    });
  }
}

async function insertContentBlobChunks(
  ctx: MutationCtx,
  args: {
    blobId: Id<"manPageContentBlobs">;
    contentSha256: string;
    kind: ContentJsonKind;
    value: string;
  },
) {
  const chunks = contentChunks(args.value);
  for (const [chunkIndex, chunk] of chunks.entries()) {
    await ctx.db.insert("manPageContentBlobChunks", {
      blobId: args.blobId,
      contentSha256: args.contentSha256,
      kind: args.kind,
      chunkIndex,
      chunk,
    });
  }
}

async function findOrCreateContentBlob(
  ctx: MutationCtx,
  args: {
    contentSha256: string;
    contentFields: ContentField[];
  },
): Promise<Id<"manPageContentBlobs">> {
  const fields = Object.fromEntries(args.contentFields.map(({ kind, value }) => [kind, value]));
  const contentDigest = await storedPayloadDigest(serializeStoredPayload(args.contentSha256, fields));
  const existing = await ctx.db
    .query("manPageContentBlobs")
    .withIndex("by_contentDigest", (q) => q.eq("contentDigest", contentDigest))
    .unique();
  if (existing) return existing._id;

  const { inlinePayload, chunkedFields } = splitContentFields(args.contentFields);
  const blobId = await ctx.db.insert("manPageContentBlobs", {
    contentSha256: args.contentSha256,
    contentDigest,
    ...inlinePayload,
  });

  for (const field of chunkedFields) {
    await insertContentBlobChunks(ctx, {
      blobId,
      contentSha256: args.contentSha256,
      kind: field.kind,
      value: field.value,
    });
  }

  return blobId;
}

async function findOrCreateStoredContentBlob(
  ctx: MutationCtx,
  args: {
    contentSha256: string;
    storageId: Id<"_storage">;
  },
): Promise<Id<"manPageContentBlobs">> {
  const metadata = await ctx.db.system.get(args.storageId);
  if (!metadata || metadata.size <= 0) throw new Error("CONTENT_STORAGE_MISSING");
  const contentDigest = metadata.sha256;
  const existing = await ctx.db
    .query("manPageContentBlobs")
    .withIndex("by_contentDigest", (q) => q.eq("contentDigest", contentDigest))
    .unique();
  if (existing) {
    return existing._id;
  }

  return await ctx.db.insert("manPageContentBlobs", {
    contentSha256: args.contentSha256,
    contentDigest,
    storageId: args.storageId,
  });
}

export const listContentBlobStorageByDigest = internalQuery({
  args: {
    contentDigests: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = [];
    const seen = new Set<string>();
    for (const contentDigest of args.contentDigests) {
      if (seen.has(contentDigest)) continue;
      seen.add(contentDigest);
      const blob = await ctx.db
        .query("manPageContentBlobs")
        .withIndex("by_contentDigest", (q) => q.eq("contentDigest", contentDigest))
        .unique();
      results.push({
        contentDigest,
        blobId: blob?._id ?? null,
        storageId: blob?.storageId ?? null,
      });
    }
    return results;
  },
});

export const createRelease = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    locale: v.string(),
    distro: distroValidator,
    imageRef: v.string(),
    imageDigest: v.string(),
    ingestedAt: v.string(),
    packageManifest: v.optional(v.any()),
    packageManifestStorageId: v.optional(v.id("_storage")),
    packageManifestDigest: v.optional(v.string()),
    packageBatches: v.optional(v.array(v.object({ digest: v.string(), count: v.number(), licenseCount: v.number() }))),
    providerCount: v.optional(v.number()),
    pageCount: v.number(),
    aliasCount: v.number(),
    licenseCount: v.number(),
    sectionTotals: v.array(sectionStatInput),
    licensePackages: v.optional(v.array(licensePackageInput)),
  },
  handler: async (ctx, args) => {
    const packages = args.licensePackages ?? [];
    if (args.providerCount !== undefined && (!validManifestCount(args.providerCount) || args.packageBatches === undefined)) throw new Error("INVALID_RELEASE_MANIFEST");
    if (args.packageBatches !== undefined) {
      validateManifestSections(args.pageCount, args.sectionTotals);
      if (packages.length || !validManifestCount(args.aliasCount) || !validManifestCount(args.licenseCount) ||
          args.packageBatches.length > 2048 || args.packageBatches.some((batch) =>
            !/^[A-Za-z0-9+/]{43}=$/.test(batch.digest) || !validManifestCount(batch.count) || batch.count < 1 || batch.count > 200 ||
            !validManifestCount(batch.licenseCount) || batch.licenseCount > batch.count) ||
          args.packageBatches.reduce((sum, batch) => sum + batch.licenseCount, 0) !== args.licenseCount) {
        throw new Error("INVALID_RELEASE_MANIFEST");
      }
    } else {
      // Retain the small legacy mutation API for queued jobs and local fixtures.
      validateReleaseDeclaration({ ...args, licensePackages: packages });
      if (packages.length > 200) throw new Error("INVALID_RELEASE_MANIFEST");
    }
    if (args.packageManifestStorageId && (!args.packageManifestDigest || args.packageManifest !== undefined)) {
      throw new Error("INVALID_RELEASE_MANIFEST");
    }
    const { packageManifestStorageId, ...declaration } = args;
    const manifestDeclarationDigest = await storedPayloadDigest(canonicalJson({
      ...declaration,
      sectionTotals: [...args.sectionTotals].sort((a, b) => a.section.localeCompare(b.section)),
      licensePackages: packages.map((pkg) => ({ ...pkg, name: pkg.name.trim().toLowerCase() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    const existing = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    if (existing) {
      if (existing.pruning) throw new Error("RELEASE_PRUNING");
      if (existing.manifestDeclarationDigest !== manifestDeclarationDigest) throw new Error("RELEASE_MANIFEST_CONFLICT");
      return { releaseId: existing._id, existed: true };
    }

    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: args.datasetReleaseId,
      locale: args.locale,
      distro: args.distro,
      imageRef: args.imageRef,
      imageDigest: args.imageDigest,
      ingestedAt: args.ingestedAt,
      ...(args.packageBatches !== undefined ? { shardedPageUploads: true, relatedMetadataVersion: 1 } : {}),
      packageBatchCount: args.packageBatches?.length ?? 0,
      uploadedPackageBatchCount: 0,
      pageCount: args.pageCount,
      ...(args.providerCount !== undefined ? { providerCount: args.providerCount } : {}),
      aliasCount: args.aliasCount,
      licenseCount: args.licenseCount,
      uploadedPageCount: 0,
      uploadedAliasCount: 0,
      uploadedLicenseCount: 0,
      manifestBasis: "declared",
      manifestDeclarationDigest,
    });

    if (packageManifestStorageId || args.packageManifest !== undefined) {
      await ctx.db.insert("releaseManifests", { releaseId, storageId: packageManifestStorageId, json: jsonField(args.packageManifest) });
    }
    for (const [batchIndex, batch] of (args.packageBatches ?? []).entries()) {
      await ctx.db.insert("releasePackageBatches", { releaseId, batchIndex, ...batch, uploaded: false });
    }
    for (const stat of args.sectionTotals) {
      await ctx.db.insert("releaseSectionStats", {
        releaseId,
        datasetReleaseId: args.datasetReleaseId,
        section: stat.section,
        label: sectionLabel(stat.section),
        total: stat.total,
        uploaded: 0,
      });
    }

    for (const pkg of packages) {
      await ctx.db.insert("licensePackages", {
        releaseId,
        datasetReleaseId: args.datasetReleaseId,
        packageName: pkg.name.trim().toLowerCase(),
        version: pkg.version,
        hasLicenseText: pkg.hasLicenseText,
      });
    }

    return { releaseId, existed: false };
  },
});

// A batch's digest is committed at release creation. Replays cannot change
// package identities or pretend a partial declaration was complete.
export const insertLicensePackages = internalMutation({
  args: { datasetReleaseId: v.string(), batchIndex: v.number(), packages: v.array(licensePackageInput) },
  returns: v.object({ inserted: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const release = await ctx.db.query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId)).unique();
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    const immutable = await releaseIsImmutable(ctx, release);
    const batch = await ctx.db.query("releasePackageBatches")
      .withIndex("by_releaseId_and_batchIndex", (q) => q.eq("releaseId", release._id).eq("batchIndex", args.batchIndex)).unique();
    if (!batch || args.packages.length !== batch.count ||
        args.packages.filter((pkg) => pkg.hasLicenseText).length !== batch.licenseCount ||
        await storedPayloadDigest(canonicalJson(args.packages)) !== batch.digest) throw new Error("RELEASE_MANIFEST_CONFLICT");
    if (batch.uploaded) return { inserted: 0, skipped: batch.count };
    if (immutable) throw new Error("RELEASE_SEALED");
    for (const pkg of args.packages) {
      const packageName = pkg.name.trim().toLowerCase();
      if (!packageName || !pkg.version.trim()) throw new Error("INVALID_RELEASE_MANIFEST");
      const existing = await ctx.db.query("licensePackages")
        .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", release._id).eq("packageName", packageName)).unique();
      if (existing) throw new Error("INVALID_RELEASE_MANIFEST");
      await ctx.db.insert("licensePackages", { releaseId: release._id, datasetReleaseId: release.datasetReleaseId,
        packageName, version: pkg.version, hasLicenseText: pkg.hasLicenseText });
    }
    await ctx.db.patch(batch._id, { uploaded: true });
    await ctx.db.patch(release._id, { uploadedPackageBatchCount: (release.uploadedPackageBatchCount ?? 0) + 1 });
    return { inserted: batch.count, skipped: 0 };
  },
});

export const insertPages = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    pages: v.array(pageInput),
  },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    const immutable = await releaseIsImmutable(ctx, release);

    let inserted = 0;
    let skipped = 0;
    const bySection = new Map<string, number>();
    for (const page of args.pages) {
      const existing = await ctx.db
        .query("manPages")
        .withIndex("by_releaseId_and_externalId", (q) =>
          q.eq("releaseId", release._id).eq("externalId", page.externalId),
        )
        .unique();
      if (existing) {
        skipped += 1;
        continue;
      }
      if (immutable) throw new Error("RELEASE_SEALED");

      await validateNewPageRoute(ctx, release._id, page);

      const pageId = await ctx.db.insert("manPages", {
        releaseId: release._id,
        datasetReleaseId: release.datasetReleaseId,
        externalId: page.externalId,
        locale: release.locale,
        distro: release.distro,
        name: page.name,
        section: page.section,
        sitemapPage: page.sitemapPage,
        title: page.title,
        description: page.description,
        sourcePath: page.sourcePath,
        sourcePackage: optionalString(page.sourcePackage),
        sourcePackageVersion: optionalString(page.sourcePackageVersion),
        contentSha256: page.contentSha256,
        hasParseWarnings: page.hasParseWarnings,
      });

      const contentFields: ContentField[] = [
        { kind: "docJson", value: JSON.stringify(page.doc) },
        { kind: "synopsisJson", value: jsonField(page.synopsis) },
        { kind: "optionsJson", value: jsonField(page.options) },
        { kind: "seeAlsoJson", value: jsonField(page.seeAlso) },
      ];
      const blobId = await findOrCreateContentBlob(ctx, {
        contentSha256: page.contentSha256,
        contentFields,
      });
      await ctx.db.insert("manPageContents", {
        pageId,
        contentSha256: page.contentSha256,
        blobId,
      });

      await ctx.db.insert("manPageSearchDocuments", {
        pageId,
        releaseId: release._id,
        datasetReleaseId: release.datasetReleaseId,
        name: page.name,
        nameNorm: page.name.toLowerCase(),
        section: page.section,
        title: page.title,
        description: page.description,
        descNorm: page.description.toLowerCase(),
        searchText: compactManPageSearchText(page),
        snippetText: truncateText(page.snippetText, MAX_SNIPPET_TEXT_CHARS),
      });
      await persistOptionSignature(ctx, pageId, page.options, page.extractorVersion ?? null);
      await insertOptionFlags(ctx, { releaseId: release._id, pageId, page, rows: optionFlagRows(page.options) });
      await insertSymbols(ctx, release, pageId, page, page.symbols ?? []);

      for (const link of page.links) {
        await ctx.db.insert("manPageLinks", {
          releaseId: release._id,
          fromPageId: pageId,
          fromExternalId: page.externalId,
          toExternalId: optionalString(link.toExternalId),
          toName: link.toName,
          toSection: link.toSection,
          linkType: link.linkType,
        });
      }

      inserted += 1;
      bySection.set(page.section, (bySection.get(page.section) ?? 0) + 1);
    }

    if (inserted > 0) {
      await recordPageUploads(ctx, release, bySection, args.pages[0].externalId);
      if (!release.shardedPageUploads) await ctx.db.patch(release._id, { relatedMetadataVersion: (release.relatedMetadataVersion ?? 0) + 1 });
    }
    return { inserted, skipped };
  },
});

export const insertStoredPages = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    pages: v.array(storedPageInput),
  },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    const immutable = await releaseIsImmutable(ctx, release);

    let inserted = 0;
    let skipped = 0;
    let providerInserted = 0;
    const bySection = new Map<string, number>();
    for (const page of args.pages) {
      if (page.providerOnly) {
        const added = await insertProvider(ctx, release, page, immutable, () => findOrCreateStoredContentBlob(ctx, {
          contentSha256: page.contentSha256, storageId: page.contentStorageId,
        }));
        if (added) { inserted++; providerInserted++; } else skipped++;
        continue;
      }
      const existing = await ctx.db
        .query("manPages")
        .withIndex("by_releaseId_and_externalId", (q) =>
          q.eq("releaseId", release._id).eq("externalId", page.externalId),
        )
        .unique();
      if (existing) {
        skipped += 1;
        continue;
      }
      if (immutable) throw new Error("RELEASE_SEALED");

      await validateNewPageRoute(ctx, release._id, page);

      const pageId = await ctx.db.insert("manPages", {
        releaseId: release._id,
        datasetReleaseId: release.datasetReleaseId,
        externalId: page.externalId,
        locale: release.locale,
        distro: release.distro,
        name: page.name,
        section: page.section,
        sitemapPage: page.sitemapPage,
        title: page.title,
        description: page.description,
        sourcePath: page.sourcePath,
        sourcePackage: optionalString(page.sourcePackage),
        sourcePackageVersion: optionalString(page.sourcePackageVersion),
        contentSha256: page.contentSha256,
        hasParseWarnings: page.hasParseWarnings,
      });

      const blobId = await findOrCreateStoredContentBlob(ctx, {
        contentSha256: page.contentSha256,
        storageId: page.contentStorageId,
      });
      await ctx.db.insert("manPageContents", {
        pageId,
        contentSha256: page.contentSha256,
        blobId,
      });

      await ctx.db.insert("manPageSearchDocuments", {
        pageId,
        releaseId: release._id,
        datasetReleaseId: release.datasetReleaseId,
        name: page.name,
        nameNorm: page.name.toLowerCase(),
        section: page.section,
        title: page.title,
        description: page.description,
        descNorm: page.description.toLowerCase(),
        searchText: compactManPageSearchText(page),
        snippetText: truncateText(page.snippetText, MAX_SNIPPET_TEXT_CHARS),
      });
      if (page.optionsSignature !== undefined) await persistPackedSignature(ctx, pageId, page.optionsSignature, page.extractorVersion ?? null);
      await insertOptionFlags(ctx, { releaseId: release._id, pageId, page, rows: page.optionFlags ?? [] });
      await insertSymbols(ctx, release, pageId, page, page.symbols ?? []);

      for (const link of page.links) {
        await ctx.db.insert("manPageLinks", {
          releaseId: release._id,
          fromPageId: pageId,
          fromExternalId: page.externalId,
          toExternalId: optionalString(link.toExternalId),
          toName: link.toName,
          toSection: link.toSection,
          linkType: link.linkType,
        });
      }

      inserted += 1;
      bySection.set(page.section, (bySection.get(page.section) ?? 0) + 1);
    }

    if (providerInserted > 0) await recordProviderUploads(ctx, release, providerInserted, args.pages[0].externalId);
    if (bySection.size > 0) {
      await recordPageUploads(ctx, release, bySection, args.pages[0].externalId);
      if (!release.shardedPageUploads) await ctx.db.patch(release._id, { relatedMetadataVersion: (release.relatedMetadataVersion ?? 0) + 1 });
    }
    const unusedStorageIds: Id<"_storage">[] = [];
    for (const storageId of new Set(args.pages.map((page) => page.contentStorageId))) {
      const used = await ctx.db.query("manPageContentBlobs")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId)).first();
      if (!used) unusedStorageIds.push(storageId);
    }
    return { inserted, skipped, unusedStorageIds };
  },
});

export const insertAliases = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    aliases: v.array(aliasInput),
  },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    const immutable = await releaseIsImmutable(ctx, release);

    let inserted = 0;
    let skipped = 0;
    let providerInserted = 0;
    for (const alias of args.aliases) {
      const name = alias.name.trim().toLowerCase();
      const section = alias.section.trim().toLowerCase();
      if (alias.sourcePackage !== undefined) {
        if (!release.providerCount || !alias.sourcePath || !alias.targetPackage) throw new Error("INVALID_ALIAS_PROVIDER");
        const owner = await ctx.db.query("manPageAliasProviders").withIndex("by_releaseId_and_route_and_package_and_path", q =>
          q.eq("releaseId", release._id).eq("name", name).eq("section", section).eq("sourcePackage", alias.sourcePackage!).eq("sourcePath", alias.sourcePath!)).unique();
        if (owner) {
          if (owner.targetName !== alias.targetName || owner.targetSection !== alias.targetSection || owner.targetPackage !== alias.targetPackage) throw new Error("RELEASE_MANIFEST_CONFLICT");
        } else {
          if (immutable) throw new Error("RELEASE_SEALED");
        const canonicalTarget = await ctx.db.query("manPages").withIndex("by_releaseId_and_name_and_section", q => q.eq("releaseId", release._id).eq("name", alias.targetName).eq("section", alias.targetSection)).unique();
        const alternateTarget = canonicalTarget?.sourcePackage === alias.targetPackage ? null : await ctx.db.query("manPageProviders")
          .withIndex("by_releaseId_and_route_and_package_and_path", q => q.eq("releaseId", release._id).eq("name", alias.targetName).eq("section", alias.targetSection).eq("sourcePackage", alias.targetPackage!)).first();
        if (canonicalTarget?.sourcePackage !== alias.targetPackage && !alternateTarget) throw new Error("ALIAS_TARGET_NOT_FOUND");
          await ctx.db.insert("manPageAliasProviders", { releaseId: release._id, name, section, sourcePackage: alias.sourcePackage, sourcePath: alias.sourcePath, targetName: alias.targetName, targetSection: alias.targetSection, targetPackage: alias.targetPackage });
          providerInserted++;
        }
        if (alias.providerOnly) { skipped++; continue; }
      } else if (alias.providerOnly) throw new Error("INVALID_ALIAS_PROVIDER");
      const existing = await ctx.db
        .query("manPageAliases")
        .withIndex("by_releaseId_and_name_and_section", (q) =>
          q.eq("releaseId", release._id).eq("name", name).eq("section", section),
        )
        .unique();
      if (existing) {
        skipped += 1;
        continue;
      }
      if (immutable) throw new Error("RELEASE_SEALED");
      const targetName = alias.targetName.trim().toLowerCase();
      const targetSection = alias.targetSection.trim().toLowerCase();
      if (!name || !section || !targetName || !targetSection) throw new Error("INVALID_ALIAS_ROUTE");
      const canonical = await ctx.db.query("manPages")
        .withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", release._id).eq("name", name).eq("section", section)).unique();
      if (canonical) throw new Error("DUPLICATE_MAN_PAGE_ROUTE");
      const target = await ctx.db.query("manPages")
        .withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", release._id).eq("name", targetName).eq("section", targetSection)).unique();
      const providerTarget = !target && alias.targetPackage ? await ctx.db.query("manPageProviders")
        .withIndex("by_releaseId_and_route_and_package_and_path", q => q.eq("releaseId", release._id).eq("name", targetName).eq("section", targetSection).eq("sourcePackage", alias.targetPackage!)).first() : null;
      if (!target && !providerTarget) throw new Error("ALIAS_TARGET_NOT_FOUND");
      await ctx.db.insert("manPageAliases", {
        releaseId: release._id,
        datasetReleaseId: release.datasetReleaseId,
        name,
        section,
        targetName,
        targetSection,
        ...(alias.targetPackage && target?.sourcePackage !== alias.targetPackage ? { targetPackage: alias.targetPackage } : {}),
      });
      inserted += 1;
    }
    if (providerInserted > 0) await recordProviderUploads(ctx, release, providerInserted, args.aliases[0].name);
    if (inserted > 0) await recordOtherUploads(ctx, release, "aliases", inserted);
    return { inserted, skipped };
  },
});

export const insertLicenses = internalMutation({
  args: {
    datasetReleaseId: v.string(),
    licenses: v.array(licenseInput),
  },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    const immutable = await releaseIsImmutable(ctx, release);

    let inserted = 0;
    let skipped = 0;
    for (const license of args.licenses) {
      const pkg = license.packageName.trim().toLowerCase();
      const existing = await ctx.db
        .query("licenses")
        .withIndex("by_releaseId_and_packageName", (q) =>
          q.eq("releaseId", release._id).eq("packageName", pkg),
        )
        .unique();
      if (existing) {
        skipped += 1;
        continue;
      }
      if (immutable) throw new Error("RELEASE_SEALED");
      if (!license.licenseText.trim()) throw new Error("EMPTY_LICENSE_TEXT");
      const declaration = await ctx.db.query("licensePackages")
        .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", release._id).eq("packageName", pkg)).unique();
      if (!declaration?.hasLicenseText) throw new Error("UNDECLARED_LICENSE_PACKAGE");

      await ctx.db.insert("licenses", {
        releaseId: release._id,
        datasetReleaseId: release.datasetReleaseId,
        packageName: pkg,
        licenseId: license.licenseId,
        licenseName: license.licenseName,
        licenseText: license.licenseText,
        sourceUrl: optionalString(license.sourceUrl),
      });
      inserted += 1;
    }

    if (inserted > 0) await recordOtherUploads(ctx, release, "licenses", inserted);
    return { inserted, skipped };
  },
});

async function recordProdPredecessor(
  ctx: MutationCtx,
  release: Doc<"datasetReleases">,
  previous: Doc<"datasetReleases"> | null,
) {
  if (release.previousProdReleaseRecorded || release.previousProdReleaseId !== undefined) return;
  const eligible = previous && previous._id !== release._id
    && previous.distro === release.distro && previous.locale === release.locale
    && Number.isFinite(Date.parse(previous.ingestedAt)) && Number.isFinite(Date.parse(release.ingestedAt))
    && Date.parse(previous.ingestedAt) < Date.parse(release.ingestedAt);
  await ctx.db.patch(release._id, {
    previousProdReleaseRecorded: true,
    ...(eligible ? { previousProdReleaseId: previous._id } : {}),
  });
}

export const activateRelease = internalMutation({
  args: {
    stage: datasetStageValidator,
    datasetReleaseId: v.string(),
    activatedAt: v.string(),
  },
  returns: v.object({
    stage: datasetStageValidator,
    distro: distroValidator,
    datasetReleaseId: v.string(),
    pending: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    if (!release) throw new Error("RELEASE_NOT_FOUND");
    if (release.pruning) throw new Error("RELEASE_PRUNING");

    await verifyDeclaredManifest(ctx, release);
    if (!release.sealed) await ctx.db.patch(release._id, { sealed: true });
    const pending = await scheduleRelatedMetadataBackfill(ctx, release);
    const result = {
      stage: args.stage,
      distro: release.distro,
      datasetReleaseId: release.datasetReleaseId,
      pending,
    };
    if (pending) return result;

    const existing = await ctx.db
      .query("activeReleases")
      .withIndex("by_stage_and_locale_and_distro", (q) =>
        q.eq("stage", args.stage).eq("locale", release.locale).eq("distro", release.distro),
      )
      .unique();

    const payload = {
      stage: args.stage,
      locale: release.locale,
      distro: release.distro,
      releaseId: release._id,
      datasetReleaseId: release.datasetReleaseId,
      activatedAt: args.activatedAt,
    };

    if (existing) {
      // Retiring a legacy active release must preserve its immutability too.
      const previousRelease = await ctx.db.get(existing.releaseId);
      if (previousRelease && !previousRelease.sealed) {
        await ctx.db.patch(previousRelease._id, { sealed: true });
      }
      if (args.stage === "prod" && existing.releaseId !== release._id) {
        await recordProdPredecessor(ctx, release, previousRelease);
      }
      await ctx.db.replace(existing._id, payload);
    } else {
      if (args.stage === "prod") await recordProdPredecessor(ctx, release, null);
      await ctx.db.insert("activeReleases", payload);
    }

    if (args.stage === "prod") await scheduleDerivedBuild(ctx, release.locale);

    return result;
  },
});

export const promoteActiveReleases = internalMutation({
  args: {
    fromStage: datasetStageValidator,
    toStage: datasetStageValidator,
    distros: v.array(distroValidator),
    activatedAt: v.string(),
    allowFullDebian: v.optional(v.boolean()),
  },
  returns: v.object({
    promoted: v.array(v.object({ distro: distroValidator, datasetReleaseId: v.string() })),
    skipped: v.optional(v.array(v.object({ distro: distroValidator, datasetReleaseId: v.string(), reason: v.string() }))),
  }),
  handler: async (ctx, args) => {
    const promoted = [];
    const skipped = [];
    for (const distro of new Set(args.distros)) {
      const source = await ctx.db
        .query("activeReleases")
        .withIndex("by_stage_and_locale_and_distro", (q) =>
          q.eq("stage", args.fromStage).eq("locale", "en").eq("distro", distro),
        )
        .unique();
      if (!source) throw new Error("ACTIVE_RELEASE_NOT_FOUND");
      const release = await ctx.db.get(source.releaseId);
      if (!release) throw new Error("RELEASE_NOT_FOUND");
      // Archive ingestion records its pinned mirror, unlike curated Docker images.
      // Check this in the pointer transaction: a preflight read could race activation.
      if (distro === "debian" && args.toStage === "prod"
        && release.imageRef.startsWith("https://snapshot.debian.org/archive/debian/")
        && !args.allowFullDebian) {
        skipped.push({ distro, datasetReleaseId: source.datasetReleaseId, reason: "FULL_DEBIAN_PROMOTION_HELD" });
        continue;
      }
      if (release.pruning) throw new Error("RELEASE_PRUNING");
      if (!release.sealed) throw new Error("RELEASE_NOT_SEALED");
      if (!release.manifestVerified) throw new Error("RELEASE_MANIFEST_UNVERIFIED");
      if (release.relatedMetadataCompletedVersion !== (release.relatedMetadataVersion ?? 0)) {
        throw new Error("RELATED_METADATA_INCOMPLETE");
      }

      const target = await ctx.db
        .query("activeReleases")
        .withIndex("by_stage_and_locale_and_distro", (q) =>
          q.eq("stage", args.toStage).eq("locale", source.locale).eq("distro", distro),
        )
        .unique();

      const payload = {
        stage: args.toStage,
        locale: source.locale,
        distro: source.distro,
        releaseId: source.releaseId,
        datasetReleaseId: source.datasetReleaseId,
        activatedAt: args.activatedAt,
      };

      if (target) {
        const previousRelease = await ctx.db.get(target.releaseId);
        if (previousRelease && !previousRelease.sealed) {
          await ctx.db.patch(previousRelease._id, { sealed: true });
        }
        if (args.toStage === "prod" && target.releaseId !== release._id) {
          await recordProdPredecessor(ctx, release, previousRelease);
        }
        await ctx.db.replace(target._id, payload);
      } else {
        if (args.toStage === "prod") await recordProdPredecessor(ctx, release, null);
        await ctx.db.insert("activeReleases", payload);
      }

      promoted.push({ distro, datasetReleaseId: source.datasetReleaseId });
    }

    if (args.toStage === "prod" && promoted.length) await scheduleDerivedBuild(ctx, "en");


    return skipped.length ? { promoted, skipped } : { promoted };
  },
});
