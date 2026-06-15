import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { datasetStageValidator, distroValidator } from "./schema";
import {
  deterministicSnippet,
  type DatasetStage,
  DISTRO_ORDER,
  DISTROS,
  type Distro,
  type ManPageContentPayload,
  normalizeName,
  normalizeSection,
  pageResponse,
  prefixUpperBound,
  releasePackageManifest,
  sectionLabel,
  sectionSortKey,
} from "./lib";

const SITEMAP_URLS_PER_FILE = 10_000;
const MAX_SEARCH_LIMIT = 50;
const MAX_SEARCH_OFFSET = 200;
const MAX_SECTION_LIMIT = 500;
const MAX_SECTION_OFFSET = 5_000;
const SITEMAP_CHUNK_ITEMS = 5_000;
type ContentJsonKind = keyof ManPageContentPayload;

function boundedInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.floor(value), max));
}

async function activeRelease(
  ctx: QueryCtx,
  args: { stage: DatasetStage; distro: Distro; locale?: string },
): Promise<Doc<"datasetReleases"> | null> {
  const active = await ctx.db
    .query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", args.stage).eq("locale", args.locale ?? "en").eq("distro", args.distro),
    )
    .unique();
  if (!active) return null;
  return await ctx.db.get(active.releaseId);
}

async function requireActiveRelease(
  ctx: QueryCtx,
  args: { stage: DatasetStage; distro: Distro; locale?: string },
): Promise<Doc<"datasetReleases">> {
  const release = await activeRelease(ctx, args);
  if (!release) throw new Error("ACTIVE_RELEASE_NOT_FOUND");
  return release;
}

async function pageContent(
  ctx: QueryCtx,
  pageId: Id<"manPages">,
): Promise<ManPageContentPayload | null> {
  const content = await ctx.db
    .query("manPageContents")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
  if (!content) return null;

  return {
    docJson: await contentJsonField(ctx, content, "docJson"),
    synopsisJson: await contentJsonField(ctx, content, "synopsisJson"),
    optionsJson: await contentJsonField(ctx, content, "optionsJson"),
    seeAlsoJson: await contentJsonField(ctx, content, "seeAlsoJson"),
  };
}

async function contentJsonField(
  ctx: QueryCtx,
  content: Doc<"manPageContents">,
  kind: ContentJsonKind,
): Promise<string | undefined> {
  if (content.blobId) {
    const blob = await ctx.db.get(content.blobId);
    if (blob) return await contentBlobJsonField(ctx, blob, kind);
  }

  const inline = content[kind];
  if (typeof inline === "string") return inline;

  const chunks = await ctx.db
    .query("manPageContentChunks")
    .withIndex("by_contentId_and_kind_and_chunkIndex", (q) =>
      q.eq("contentId", content._id).eq("kind", kind),
    )
    .collect();
  if (!chunks.length) return undefined;
  return chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => chunk.chunk)
    .join("");
}

async function contentBlobJsonField(
  ctx: QueryCtx,
  blob: Doc<"manPageContentBlobs">,
  kind: ContentJsonKind,
): Promise<string | undefined> {
  const inline = blob[kind];
  if (typeof inline === "string") return inline;

  const chunks = await ctx.db
    .query("manPageContentBlobChunks")
    .withIndex("by_blobId_and_kind_and_chunkIndex", (q) =>
      q.eq("blobId", blob._id).eq("kind", kind),
    )
    .collect();
  if (!chunks.length) return undefined;
  return chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => chunk.chunk)
    .join("");
}

async function pageByNameAndSection(
  ctx: QueryCtx,
  args: { releaseId: Id<"datasetReleases">; name: string; section: string },
): Promise<Doc<"manPages"> | null> {
  return await ctx.db
    .query("manPages")
    .withIndex("by_releaseId_and_name_and_section", (q) =>
      q.eq("releaseId", args.releaseId).eq("name", args.name).eq("section", args.section),
    )
    .unique();
}

async function variantsForPage(
  ctx: QueryCtx,
  args: {
    stage: DatasetStage;
    locale: string;
    name: string;
    section: string;
  },
): Promise<Array<{ distro: string; datasetReleaseId: string; contentSha256: string }>> {
  const active = await ctx.db
    .query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", args.stage).eq("locale", args.locale),
    )
    .take(20);

  const variants: Array<{ distro: string; datasetReleaseId: string; contentSha256: string }> = [];
  for (const item of active) {
    const page = await pageByNameAndSection(ctx, {
      releaseId: item.releaseId,
      name: args.name,
      section: args.section,
    });
    if (!page) continue;
    variants.push({
      distro: item.distro,
      datasetReleaseId: item.datasetReleaseId,
      contentSha256: page.contentSha256,
    });
  }

  variants.sort((a, b) => {
    const order = (DISTRO_ORDER[a.distro] ?? 99) - (DISTRO_ORDER[b.distro] ?? 99);
    return order || a.distro.localeCompare(b.distro);
  });
  return variants;
}

export const getInfo = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
  },
  handler: async (ctx, args) => {
    const release = await activeRelease(ctx, args);
    if (!release) {
      return {
        datasetReleaseId: "uninitialized",
        locale: "en",
        distro: args.distro,
        pageCount: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    return {
      datasetReleaseId: release.datasetReleaseId,
      locale: release.locale,
      distro: release.distro,
      pageCount: release.pageCount,
      lastUpdated: release.ingestedAt,
    };
  },
});

export const listSections = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
  },
  handler: async (ctx, args) => {
    const release = await requireActiveRelease(ctx, args);
    const stats = await ctx.db
      .query("releaseSectionStats")
      .withIndex("by_releaseId_and_section", (q) => q.eq("releaseId", release._id))
      .take(100);

    return stats
      .map((stat) => ({
        section: stat.section,
        label: stat.label || sectionLabel(stat.section),
      }))
      .sort((a, b) => sectionSortKey(a.section).localeCompare(sectionSortKey(b.section)));
  },
});

export const listSection = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    section: v.string(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    const section = normalizeSection(args.section);
    const limit = boundedInt(args.limit, 1, MAX_SECTION_LIMIT);
    const offset = boundedInt(args.offset, 0, MAX_SECTION_OFFSET);
    const release = await requireActiveRelease(ctx, args);
    const stat = await ctx.db
      .query("releaseSectionStats")
      .withIndex("by_releaseId_and_section", (q) =>
        q.eq("releaseId", release._id).eq("section", section),
      )
      .unique();
    if (!stat) return null;

    const pages = await ctx.db
      .query("manPages")
      .withIndex("by_releaseId_and_section_and_name", (q) =>
        q.eq("releaseId", release._id).eq("section", section),
      )
      .take(offset + limit);

    return {
      section,
      label: stat.label || sectionLabel(section),
      limit,
      offset,
      total: stat.total,
      results: pages.slice(offset).map((page) => ({
        name: page.name,
        section: page.section,
        title: page.title,
        description: page.description,
      })),
    };
  },
});

export const getManByName = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const release = await requireActiveRelease(ctx, args);
    const pages = await ctx.db
      .query("manPages")
      .withIndex("by_releaseId_and_name_and_section", (q) =>
        q.eq("releaseId", release._id).eq("name", name),
      )
      .take(20);

    if (!pages.length) return { kind: "not_found" as const };
    if (pages.length > 1) {
      return {
        kind: "ambiguous" as const,
        options: pages.map((page) => ({
          section: page.section,
          title: page.title,
          description: page.description,
        })),
      };
    }

    const page = pages[0];
    const content = await pageContent(ctx, page._id);
    if (!content) return { kind: "not_found" as const };
    const variants = await variantsForPage(ctx, {
      stage: args.stage,
      locale: release.locale,
      name: page.name,
      section: page.section,
    });

    return { kind: "page" as const, data: pageResponse(release, page, content, variants) };
  },
});

export const getManByNameAndSection = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    name: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const section = normalizeSection(args.section);
    const release = await requireActiveRelease(ctx, args);
    const page = await pageByNameAndSection(ctx, {
      releaseId: release._id,
      name,
      section,
    });
    if (!page) return null;

    const content = await pageContent(ctx, page._id);
    if (!content) return null;
    const variants = await variantsForPage(ctx, {
      stage: args.stage,
      locale: release.locale,
      name: page.name,
      section: page.section,
    });

    return pageResponse(release, page, content, variants);
  },
});

export const getRelated = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    name: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const section = normalizeSection(args.section);
    const release = await requireActiveRelease(ctx, args);
    const page = await pageByNameAndSection(ctx, {
      releaseId: release._id,
      name,
      section,
    });
    if (!page) return null;

    const seeAlso = await ctx.db
      .query("manPageLinks")
      .withIndex("by_fromPageId_and_linkType", (q) =>
        q.eq("fromPageId", page._id).eq("linkType", "see_also"),
      )
      .take(50);
    const xrefs = await ctx.db
      .query("manPageLinks")
      .withIndex("by_fromPageId_and_linkType", (q) =>
        q.eq("fromPageId", page._id).eq("linkType", "xref"),
      )
      .take(50);

    const items = [];
    const seen = new Set<string>();
    for (const link of [...seeAlso, ...xrefs]) {
      const key = `${link.toName}:${link.toSection}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const linkedPage = await pageByNameAndSection(ctx, {
        releaseId: release._id,
        name: link.toName,
        section: link.toSection,
      });
      if (!linkedPage) continue;
      items.push({
        name: linkedPage.name,
        section: linkedPage.section,
        title: linkedPage.title,
        description: linkedPage.description,
      });
      if (items.length >= 50) break;
    }

    return { items };
  },
});

type RankedSearchDocument = Doc<"manPageSearchDocuments"> & { rank: number };

function rankSearchDocument(doc: Doc<"manPageSearchDocuments">, queryNorm: string, index: number): number {
  let rank = 1000 - index;
  if (doc.nameNorm === queryNorm) rank += 10_000;
  if (doc.nameNorm.startsWith(queryNorm)) rank += 2_000;
  if (doc.descNorm.includes(queryNorm)) rank += 500;
  return rank;
}

function typoFallbackQuery(queryNorm: string): string | null {
  const collapsed = queryNorm.replace(/([a-z0-9])\1+$/i, "$1");
  return collapsed !== queryNorm && collapsed.length >= 2 ? collapsed : null;
}

export const search = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    q: v.string(),
    section: v.union(v.string(), v.null()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    const queryText = args.q.trim().replace(/\s+/g, " ");
    if (!queryText) {
      return { query: queryText, results: [], suggestions: [], hasMore: false, nextOffset: null };
    }
    const queryNorm = queryText.toLowerCase();
    const fallbackNorm = typoFallbackQuery(queryNorm);
    const section = args.section ? normalizeSection(args.section) : null;
    const limit = boundedInt(args.limit, 1, MAX_SEARCH_LIMIT);
    const offset = boundedInt(args.offset, 0, MAX_SEARCH_OFFSET);
    const release = await requireActiveRelease(ctx, args);
    const takeCount = Math.min(offset + limit + 5, MAX_SEARCH_OFFSET + MAX_SEARCH_LIMIT);

    const prefixDocs: Array<Doc<"manPageSearchDocuments">> = [];
    const prefixQueries = fallbackNorm ? [queryNorm, fallbackNorm] : [queryNorm];
    for (const prefix of prefixQueries) {
      const rows = section
        ? await ctx.db
            .query("manPageSearchDocuments")
            .withIndex("by_releaseId_and_section_and_nameNorm", (q) =>
              q
                .eq("releaseId", release._id)
                .eq("section", section)
                .gte("nameNorm", prefix)
                .lt("nameNorm", prefixUpperBound(prefix)),
            )
            .take(takeCount)
        : await ctx.db
            .query("manPageSearchDocuments")
            .withIndex("by_releaseId_and_nameNorm", (q) =>
              q
                .eq("releaseId", release._id)
                .gte("nameNorm", prefix)
                .lt("nameNorm", prefixUpperBound(prefix)),
            )
            .take(takeCount);
      prefixDocs.push(...rows);
    }

    const hasEnoughPrefixResults = prefixDocs.length >= offset + limit;
    const shouldSearchFullText = queryNorm.length >= 3 && !hasEnoughPrefixResults;
    const searchedDocs = shouldSearchFullText
      ? section
        ? await ctx.db
            .query("manPageSearchDocuments")
            .withSearchIndex("search_searchText", (q) =>
              q.search("searchText", queryText).eq("releaseId", release._id).eq("section", section),
            )
            .take(takeCount)
        : await ctx.db
            .query("manPageSearchDocuments")
            .withSearchIndex("search_searchText", (q) =>
              q.search("searchText", queryText).eq("releaseId", release._id),
            )
            .take(takeCount)
      : [];

    const ranked = new Map<string, RankedSearchDocument>();
    [...prefixDocs, ...searchedDocs].forEach((doc, index) => {
      const current = ranked.get(doc._id);
      const rank = rankSearchDocument(doc, queryNorm, index);
      if (!current || rank > current.rank) ranked.set(doc._id, { ...doc, rank });
    });

    const ordered = [...ranked.values()].sort((a, b) => {
      const rank = b.rank - a.rank;
      if (rank) return rank;
      const len = a.name.length - b.name.length;
      if (len) return len;
      const name = a.name.localeCompare(b.name);
      if (name) return name;
      return a.section.localeCompare(b.section);
    });
    const visible = ordered.slice(offset, offset + limit);

    const suggestions = [...new Set(ordered.map((doc) => doc.nameNorm))]
      .filter((name) => name !== queryNorm)
      .slice(0, 5);

    return {
      query: queryText,
      results: visible.map((doc) => ({
        name: doc.name,
        section: doc.section,
        title: doc.title,
        description: doc.description,
        highlights: [deterministicSnippet(doc.snippetText, queryText)].filter(Boolean),
      })),
      suggestions,
      hasMore: ordered.length > offset + limit,
      nextOffset:
        ordered.length > offset + limit ? offset + visible.length : null,
    };
  },
});

export const suggest = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const release = await requireActiveRelease(ctx, args);
    const docs = await ctx.db
      .query("manPageSearchDocuments")
      .withIndex("by_releaseId_and_nameNorm", (q) =>
        q.eq("releaseId", release._id).gte("nameNorm", name).lt("nameNorm", prefixUpperBound(name)),
      )
      .take(10);

    return {
      query: name,
      suggestions: docs.map((doc) => ({
        name: doc.name,
        section: doc.section,
        description: doc.description,
      })),
    };
  },
});

export const listLicenses = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
  },
  handler: async (ctx, args) => {
    const release = await requireActiveRelease(ctx, args);
    const packages = await ctx.db
      .query("licensePackages")
      .withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", release._id))
      .take(5000);

    return {
      datasetReleaseId: release.datasetReleaseId,
      ingestedAt: release.ingestedAt,
      imageRef: release.imageRef,
      imageDigest: release.imageDigest,
      packageManifest: releasePackageManifest(release),
      packages: packages.map((pkg) => ({
        name: pkg.packageName,
        version: pkg.version,
        hasLicenseText: pkg.hasLicenseText,
      })),
    };
  },
});

export const getLicense = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    packageName: v.string(),
  },
  handler: async (ctx, args) => {
    const pkg = args.packageName.trim().toLowerCase();
    const release = await requireActiveRelease(ctx, args);
    const license = await ctx.db
      .query("licenses")
      .withIndex("by_releaseId_and_packageName", (q) =>
        q.eq("releaseId", release._id).eq("packageName", pkg),
      )
      .unique();
    if (!license) return null;
    return {
      package: pkg,
      licenseId: license.licenseId,
      licenseName: license.licenseName,
      text: license.licenseText,
    };
  },
});

export const listSeoReleases = query({
  args: {
    stage: datasetStageValidator,
  },
  handler: async (ctx, args) => {
    const items = [];
    for (const distro of DISTROS) {
      const release = await activeRelease(ctx, { stage: args.stage, distro });
      if (!release) continue;
      items.push({
        distro,
        datasetReleaseId: release.datasetReleaseId,
        ingestedAt: release.ingestedAt,
        pageCount: release.pageCount,
      });
    }

    return { urlsPerFile: SITEMAP_URLS_PER_FILE, items };
  },
});

export const listSitemapPage = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    page: v.number(),
  },
  handler: async (ctx, args) => {
    const release = await activeRelease(ctx, args);
    if (!release) return null;
    const pages = await ctx.db
      .query("manPages")
      .withIndex("by_releaseId_and_sitemapPage_and_name", (q) =>
        q.eq("releaseId", release._id).eq("sitemapPage", args.page),
      )
      .take(SITEMAP_URLS_PER_FILE);
    if (!pages.length) return null;
    return {
      items: pages.map((page) => ({ name: page.name, section: page.section })),
      page: args.page,
    };
  },
});

export const listSitemapPageChunk = query({
  args: {
    stage: datasetStageValidator,
    distro: distroValidator,
    page: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const release = await activeRelease(ctx, args);
    if (!release) return null;
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: boundedInt(args.paginationOpts.numItems, 1, SITEMAP_CHUNK_ITEMS),
    };
    const result = await ctx.db
      .query("manPages")
      .withIndex("by_releaseId_and_sitemapPage_and_name", (q) =>
        q.eq("releaseId", release._id).eq("sitemapPage", args.page),
      )
      .paginate(paginationOpts);
    if (!result.page.length && args.paginationOpts.cursor === null) return null;
    return {
      items: result.page.map((page) => ({ name: page.name, section: page.section })),
      page: args.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
