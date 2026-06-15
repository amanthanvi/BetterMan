import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { datasetStageValidator, distroValidator } from "./schema";
import {
  compactManPageSearchText,
  MAX_SNIPPET_TEXT_CHARS,
  sectionLabel,
  truncateText,
} from "./lib";

const MAX_INLINE_CONTENT_CHARS = 500_000;
const CONTENT_CHUNK_CHARS = 400_000;

type ContentJsonKind = "docJson" | "synopsisJson" | "optionsJson" | "seeAlsoJson";
type ContentField = { kind: ContentJsonKind; value: string | undefined };

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
  doc: v.any(),
  synopsis: v.any(),
  options: v.any(),
  seeAlso: v.any(),
  searchText: v.string(),
  snippetText: v.string(),
  links: v.array(pageLinkInput),
});

const storedPageInput = v.object({
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
  contentStorageId: v.id("_storage"),
  searchText: v.string(),
  snippetText: v.string(),
  links: v.array(pageLinkInput),
});

const licenseInput = v.object({
  packageName: v.string(),
  licenseId: v.string(),
  licenseName: v.string(),
  licenseText: v.string(),
  sourceUrl: v.union(v.string(), v.null()),
});

function optionalString(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function jsonField(value: unknown): string | undefined {
  if (value === null || typeof value === "undefined") return undefined;
  return JSON.stringify(value);
}

function shouldChunkContent(value: string): boolean {
  return value.length > MAX_INLINE_CONTENT_CHARS;
}

function contentChunks(value: string): string[] {
  const chunks = [];
  for (let index = 0; index < value.length; index += CONTENT_CHUNK_CHARS) {
    chunks.push(value.slice(index, index + CONTENT_CHUNK_CHARS));
  }
  return chunks;
}

function splitContentFields(contentFields: ContentField[]): {
  inlinePayload: Partial<Record<ContentJsonKind, string>>;
  chunkedFields: Array<{ kind: ContentJsonKind; value: string }>;
} {
  const inlinePayload: Partial<Record<ContentJsonKind, string>> = {};
  const chunkedFields: Array<{ kind: ContentJsonKind; value: string }> = [];

  for (const field of contentFields) {
    if (typeof field.value !== "string") continue;
    if (shouldChunkContent(field.value)) {
      chunkedFields.push({ kind: field.kind, value: field.value });
    } else {
      inlinePayload[field.kind] = field.value;
    }
  }

  return { inlinePayload, chunkedFields };
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
  const existing = await ctx.db
    .query("manPageContentBlobs")
    .withIndex("by_contentSha256", (q) => q.eq("contentSha256", args.contentSha256))
    .unique();
  if (existing) return existing._id;

  const { inlinePayload, chunkedFields } = splitContentFields(args.contentFields);
  const blobId = await ctx.db.insert("manPageContentBlobs", {
    contentSha256: args.contentSha256,
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
  const existing = await ctx.db
    .query("manPageContentBlobs")
    .withIndex("by_contentSha256", (q) => q.eq("contentSha256", args.contentSha256))
    .unique();
  if (existing) {
    if (!existing.storageId) {
      await ctx.db.patch(existing._id, { storageId: args.storageId });
    }
    return existing._id;
  }

  return await ctx.db.insert("manPageContentBlobs", {
    contentSha256: args.contentSha256,
    storageId: args.storageId,
  });
}

export const listContentBlobStorageBySha = internalQuery({
  args: {
    contentSha256s: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = [];
    const seen = new Set<string>();
    for (const contentSha256 of args.contentSha256s) {
      if (seen.has(contentSha256)) continue;
      seen.add(contentSha256);
      const blob = await ctx.db
        .query("manPageContentBlobs")
        .withIndex("by_contentSha256", (q) => q.eq("contentSha256", contentSha256))
        .unique();
      results.push({
        contentSha256,
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
    packageManifest: v.any(),
    pageCount: v.number(),
    sectionTotals: v.array(sectionStatInput),
    licensePackages: v.array(licensePackageInput),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    if (existing) return { releaseId: existing._id, existed: true };

    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId: args.datasetReleaseId,
      locale: args.locale,
      distro: args.distro,
      imageRef: args.imageRef,
      imageDigest: args.imageDigest,
      ingestedAt: args.ingestedAt,
      packageManifestJson: jsonField(args.packageManifest),
      pageCount: args.pageCount,
    });

    for (const stat of args.sectionTotals) {
      await ctx.db.insert("releaseSectionStats", {
        releaseId,
        datasetReleaseId: args.datasetReleaseId,
        section: stat.section,
        label: sectionLabel(stat.section),
        total: stat.total,
      });
    }

    for (const pkg of args.licensePackages) {
      await ctx.db.insert("licensePackages", {
        releaseId,
        datasetReleaseId: args.datasetReleaseId,
        packageName: pkg.name,
        version: pkg.version,
        hasLicenseText: pkg.hasLicenseText,
      });
    }

    return { releaseId, existed: false };
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

    let inserted = 0;
    let skipped = 0;
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

    let inserted = 0;
    let skipped = 0;
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
    }

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

    return { inserted, skipped };
  },
});

export const activateRelease = internalMutation({
  args: {
    stage: datasetStageValidator,
    datasetReleaseId: v.string(),
    activatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("datasetReleases")
      .withIndex("by_datasetReleaseId", (q) => q.eq("datasetReleaseId", args.datasetReleaseId))
      .unique();
    if (!release) throw new Error("RELEASE_NOT_FOUND");

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
      await ctx.db.replace(existing._id, payload);
    } else {
      await ctx.db.insert("activeReleases", payload);
    }

    return {
      stage: args.stage,
      distro: release.distro,
      datasetReleaseId: release.datasetReleaseId,
    };
  },
});

export const promoteActiveReleases = internalMutation({
  args: {
    fromStage: datasetStageValidator,
    toStage: datasetStageValidator,
    distros: v.array(distroValidator),
    activatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const promoted = [];
    for (const distro of args.distros) {
      const source = await ctx.db
        .query("activeReleases")
        .withIndex("by_stage_and_locale_and_distro", (q) =>
          q.eq("stage", args.fromStage).eq("locale", "en").eq("distro", distro),
        )
        .unique();
      if (!source) continue;

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
        await ctx.db.replace(target._id, payload);
      } else {
        await ctx.db.insert("activeReleases", payload);
      }

      promoted.push({ distro, datasetReleaseId: source.datasetReleaseId });
    }

    return { promoted };
  },
});
