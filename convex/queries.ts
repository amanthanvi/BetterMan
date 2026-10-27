import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { resolveRelatedItems } from "./_relatedLinks";
import { flagTakesArgument, parseOptionQuery } from "./_optionFlags";
import { nameEditDistance } from "./_searchTypos";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { distroValidator, publicStageCompatibilityValidator } from "./schema";
import {
  deterministicSnippet,
  DISTRO_ORDER,
  DISTROS,
  type Distro,
  normalizeName,
  normalizeSection,
  prefixUpperBound,
  PUBLIC_DATASET_STAGE,
  releasePackageManifest,
  sectionLabel,
  sectionSortKey,
} from "./lib";
import {
  activeRelease,
  pageByNameAndSection,
  requireActiveRelease,
  resolvePageByName,
} from "./_releaseLookups";

const SITEMAP_URLS_PER_FILE = 10_000;
const MAX_SEARCH_LIMIT = 50;
const MAX_SEARCH_OFFSET = 200;
const MAX_SECTION_LIMIT = 500;
const MAX_SECTION_OFFSET = 5_000;
const SITEMAP_CHUNK_ITEMS = 5_000;
const MAX_RELATED = 50;
const MAX_DESCRIPTION_HITS = 24;
const SEARCH_STOP_WORDS = new Set("a an and are as at be by can do does for from how i in is it of on or the to what when where which with".split(" "));

function boundedInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.floor(value), max));
}

async function searchDocsByNamePrefix(
  ctx: QueryCtx,
  args: {
    releaseId: Id<"datasetReleases">;
    section: string | null;
    prefix: string;
    takeCount: number;
  },
): Promise<Array<Doc<"manPageSearchDocuments">>> {
  const upper = prefixUpperBound(args.prefix);
  if (args.section !== null) {
    const section = args.section;
    return await ctx.db
      .query("manPageSearchDocuments")
      .withIndex("by_releaseId_and_section_and_nameNorm", (q) =>
        q
          .eq("releaseId", args.releaseId)
          .eq("section", section)
          .gte("nameNorm", args.prefix)
          .lt("nameNorm", upper),
      )
      .take(args.takeCount);
  }
  return await ctx.db
    .query("manPageSearchDocuments")
    .withIndex("by_releaseId_and_nameNorm", (q) =>
      q.eq("releaseId", args.releaseId).gte("nameNorm", args.prefix).lt("nameNorm", upper),
    )
    .take(args.takeCount);
}

export const getInfo = query({
  args: {
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
  },
  handler: async (ctx, args) => {
    const release = await activeRelease(ctx, { stage: PUBLIC_DATASET_STAGE, distro: args.distro });
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
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
  },
  handler: async (ctx, args) => {
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
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

export const getManMetaByNameAndSection = query({
  args: {
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
    name: v.string(),
    section: v.string(),
  },
  returns: v.union(
    v.object({
      page: v.object({
        id: v.string(),
        locale: v.string(),
        distro: v.string(),
        name: v.string(),
        section: v.string(),
        title: v.string(),
        description: v.string(),
        sourcePackage: v.union(v.string(), v.null()),
        sourcePackageVersion: v.union(v.string(), v.null()),
        datasetReleaseId: v.string(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const section = normalizeSection(args.section);
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
    const page = await pageByNameAndSection(ctx, {
      releaseId: release._id,
      name,
      section,
    });
    if (!page) return null;

    return {
      page: {
        id: page.externalId,
        locale: release.locale,
        distro: release.distro,
        name: page.name,
        section: page.section,
        title: page.title,
        description: page.description,
        sourcePackage: page.sourcePackage ?? null,
        sourcePackageVersion: page.sourcePackageVersion ?? null,
        datasetReleaseId: release.datasetReleaseId,
      },
    };
  },
});

// Name-only routes only redirect or list sections, so they skip document content.
export const resolveManByName = query({
  args: {
    distro: distroValidator,
    name: v.string(),
  },
  returns: v.union(
    v.object({
      kind: v.literal("page"),
      name: v.string(),
      section: v.string(),
      title: v.string(),
      description: v.string(),
    }),
    v.object({
      kind: v.literal("ambiguous"),
      options: v.array(v.object({ section: v.string(), title: v.string(), description: v.string() })),
    }),
    v.object({ kind: v.literal("alias"), name: v.string(), section: v.string() }),
    v.object({ kind: v.literal("not_found") }),
  ),
  handler: async (ctx, args) => {
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
    const result = await resolvePageByName(ctx, { releaseId: release._id, name: normalizeName(args.name) });
    if (result.kind !== "page") return result;
    const { name, section, title, description } = result.page;
    return { kind: "page" as const, name, section, title, description };
  },
});

export const listSection = query({
  args: {
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
    section: v.string(),
    limit: v.number(),
    offset: v.optional(v.number()),
    cursor: v.optional(v.string()),
    before: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.object({
    section: v.string(),
    label: v.string(),
    limit: v.number(),
    offset: v.number(),
    total: v.number(),
    hasMore: v.boolean(),
    nextCursor: v.union(v.string(), v.null()),
    prevCursor: v.union(v.string(), v.null()),
    results: v.array(v.object({
      name: v.string(), section: v.string(), title: v.string(), description: v.string(),
    })),
  })),
  handler: async (ctx, args) => {
    const section = normalizeSection(args.section);
    const limit = boundedInt(args.limit, 1, MAX_SECTION_LIMIT);
    if (args.cursor !== undefined && args.before !== undefined) {
      throw new Error("Use either cursor or before, not both");
    }
    const hasCursor = args.cursor !== undefined || args.before !== undefined;
    const offset = boundedInt(args.offset ?? 0, 0, hasCursor ? Number.MAX_SAFE_INTEGER : MAX_SECTION_OFFSET);
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
    const stat = await ctx.db
      .query("releaseSectionStats")
      .withIndex("by_releaseId_and_section", (q) =>
        q.eq("releaseId", release._id).eq("section", section),
      )
      .unique();
    if (!stat) return null;

    // Prefer manPages over search docs: search rows carry searchText/snippetText
    // payloads that are larger than the list fields this endpoint returns.
    const pages = await ctx.db
      .query("manPages")
      .withIndex("by_releaseId_and_section_and_name", (q) => {
        const range = q.eq("releaseId", release._id).eq("section", section);
        if (args.cursor !== undefined) return range.gt("name", args.cursor);
        if (args.before !== undefined) return range.lt("name", args.before);
        return range;
      })
      .order(args.before !== undefined ? "desc" : "asc")
      .take((hasCursor ? 0 : offset) + limit + 1);
    const visible = pages.slice(hasCursor ? 0 : offset, (hasCursor ? 0 : offset) + limit);
    if (args.before !== undefined) visible.reverse();

    let hasPrevious = offset > 0;
    let hasNext = pages.length > (hasCursor ? 0 : offset) + limit;
    // Probe only the opposite edge; name cursors read at most limit + 2 rows,
    // regardless of the display offset or position within the section.
    if (hasCursor && visible.length > 0) {
      const backward = args.before !== undefined;
      const edgeName = backward ? visible[visible.length - 1].name : visible[0].name;
      const opposite = await ctx.db
        .query("manPages")
        .withIndex("by_releaseId_and_section_and_name", (q) => {
          const range = q.eq("releaseId", release._id).eq("section", section);
          return backward ? range.gt("name", edgeName) : range.lt("name", edgeName);
        })
        .order(backward ? "asc" : "desc")
        .take(1);
      if (backward) {
        hasPrevious = hasNext;
        hasNext = opposite.length > 0;
      } else {
        hasPrevious = opposite.length > 0;
      }
    }
    const nextCursor = hasNext && visible.length > 0 ? visible[visible.length - 1].name : null;
    const prevCursor = hasPrevious && visible.length > 0 ? visible[0].name : null;

    return {
      section,
      label: stat.label || sectionLabel(section),
      limit,
      offset,
      total: stat.total,
      hasMore: nextCursor !== null,
      nextCursor,
      prevCursor,
      results: visible.map((page) => ({
        name: page.name,
        section: page.section,
        title: page.title,
        description: page.description,
      })),
    };
  },
});

export const getRelated = query({
  args: {
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
    name: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const section = normalizeSection(args.section);
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
    const page = await pageByNameAndSection(ctx, {
      releaseId: release._id,
      name,
      section,
    });
    if (!page) return null;

    const [seeAlso, xrefs] = await Promise.all([
      ctx.db
        .query("manPageLinks")
        .withIndex("by_fromPageId_and_linkType", (q) =>
          q.eq("fromPageId", page._id).eq("linkType", "see_also"),
        )
        .take(MAX_RELATED),
      ctx.db
        .query("manPageLinks")
        .withIndex("by_fromPageId_and_linkType", (q) =>
          q.eq("fromPageId", page._id).eq("linkType", "xref"),
        )
        .take(MAX_RELATED),
    ]);

    // The page renders SEE ALSO itself, so RELATED is only what the body cites beyond it.
    const listed = new Set(seeAlso.map((link) => JSON.stringify([link.toName, link.toSection])));
    const items = await resolveRelatedItems(
      xrefs.filter((link) => !listed.has(JSON.stringify([link.toName, link.toSection]))),
      (targetName, targetSection) =>
        pageByNameAndSection(ctx, {
          releaseId: release._id,
          name: targetName,
          section: targetSection,
        }),
      MAX_RELATED,
    );

    return { items };
  },
});

/** Distros whose active release has this page or a `.so` alias for it, in picker order. */
export const listManDistros = query({
  args: {
    name: v.string(),
    // Without a section, any section of the name counts.
    section: v.optional(v.string()),
  },
  returns: v.object({ distros: v.array(distroValidator) }),
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const section = args.section === undefined ? null : normalizeSection(args.section);
    const active = await ctx.db
      .query("activeReleases")
      .withIndex("by_stage_and_locale_and_distro", (q) =>
        q.eq("stage", PUBLIC_DATASET_STAGE).eq("locale", "en"),
      )
      .take(DISTROS.length);

    const found = await Promise.all(
      active.map(async (item) => {
        const page = await ctx.db
          .query("manPages")
          .withIndex("by_releaseId_and_name_and_section", (q) => {
            const byName = q.eq("releaseId", item.releaseId).eq("name", name);
            return section === null ? byName : byName.eq("section", section);
          })
          .first();
        if (page) return item.distro;
        const alias = await ctx.db
          .query("manPageAliases")
          .withIndex("by_releaseId_and_name_and_section", (q) => {
            const byName = q.eq("releaseId", item.releaseId).eq("name", name);
            return section === null ? byName : byName.eq("section", section);
          })
          .first();
        return alias ? item.distro : null;
      }),
    );
    const distros = found.filter((distro): distro is Distro => distro !== null);
    distros.sort((a, b) => DISTRO_ORDER[a] - DISTRO_ORDER[b]);
    return { distros };
  },
});

type SearchHit = {
  name: string;
  section: string;
  title: string;
  description: string;
  highlights: string[];
  match?: "option";
  anchorId?: string;
};

type RankedHit = SearchHit & { rank: number };

function searchDocumentHit(doc: Doc<"manPageSearchDocuments">, queryText: string, rank: number): RankedHit {
  return {
    name: doc.name,
    section: doc.section,
    title: doc.title,
    description: doc.description,
    highlights: [deterministicSnippet(doc.snippetText, queryText)].filter(Boolean),
    rank,
  };
}

function compareHits(a: RankedHit, b: RankedHit): number {
  const rank = b.rank - a.rank;
  if (rank) return rank;
  const len = a.name.length - b.name.length;
  if (len) return len;
  const name = a.name.localeCompare(b.name);
  if (name) return name;
  return a.section.localeCompare(b.section);
}

/** Option rows in name order, optionally scoped to an exact name or prefix. */
async function optionFlagRowsFor(
  ctx: QueryCtx,
  args: {
    releaseId: Id<"datasetReleases">;
    section: string | null;
    flag: string;
    namePrefix: string | null;
    exactName?: boolean;
    take: number;
  },
): Promise<Array<Doc<"manPageOptionFlags">>> {
  const { releaseId, section, flag, namePrefix } = args;
  const upper = namePrefix === null ? null : prefixUpperBound(namePrefix);
  const exactName = namePrefix !== null && args.exactName;
  if (section !== null) {
    return await ctx.db
      .query("manPageOptionFlags")
      .withIndex("by_releaseId_and_section_and_flag_and_nameNorm", (q) => {
        const range = q.eq("releaseId", releaseId).eq("section", section).eq("flag", flag);
        if (exactName) return range.eq("nameNorm", namePrefix!);
        return namePrefix === null || upper === null ? range : range.gte("nameNorm", namePrefix).lt("nameNorm", upper);
      })
      .take(args.take);
  }
  return await ctx.db
    .query("manPageOptionFlags")
    .withIndex("by_releaseId_and_flag_and_nameNorm", (q) => {
      const range = q.eq("releaseId", releaseId).eq("flag", flag);
      if (exactName) return range.eq("nameNorm", namePrefix!);
      return namePrefix === null || upper === null ? range : range.gte("nameNorm", namePrefix).lt("nameNorm", upper);
    })
    .take(args.take);
}

async function optionHit(ctx: QueryCtx, row: Doc<"manPageOptionFlags">, rank: number): Promise<RankedHit | null> {
  const page = await ctx.db.get(row.pageId);
  if (!page) return null;
  return {
    name: page.name,
    section: page.section,
    title: page.title,
    description: page.description,
    highlights: [row.flags],
    match: "option",
    anchorId: row.anchorId,
    rank,
  };
}

/** At most eight flag ranges of three rows; group sections by page, never mix them. */
async function clusterHits(ctx: QueryCtx, releaseId: Id<"datasetReleases">, name: string, flag: string, section: string | null): Promise<RankedHit[]> {
  const groups = new Map<Id<"manPages">, { rows: Array<Doc<"manPageOptionFlags">>; done: boolean }>();
  const cached = new Map<string, Array<Doc<"manPageOptionFlags">>>();
  for (const [index, letter] of [...flag.slice(1)].entries()) {
    if (index > 0 && [...groups.values()].every((group) => group.done)) break;
    const part = `-${letter}`;
    let rows = cached.get(part);
    if (!rows) {
      rows = await optionFlagRowsFor(ctx, { releaseId, section, flag: part, namePrefix: name, exactName: true, take: 3 });
      cached.set(part, rows);
    }
    if (index === 0) for (const row of rows) groups.set(row.pageId, { rows: [], done: false });
    for (const [pageId, group] of groups) {
      if (group.done) continue;
      const row = rows.find((candidate) => candidate.pageId === pageId);
      if (!row) { groups.delete(pageId); continue; }
      group.rows.push(row);
      group.done = row.takesArgument ?? flagTakesArgument(row.flags);
    }
  }
  const hits: RankedHit[] = [];
  for (const { rows } of groups.values()) {
    const hit = await optionHit(ctx, rows[0], 0);
    if (hit) { hit.highlights = [...new Set(rows.map((row) => row.flags))]; hits.push(hit); }
  }
  return hits;
}

function rankSearchDocument(
  doc: Pick<Doc<"manPageSearchDocuments">, "nameNorm" | "descNorm">,
  queryNorm: string,
  index: number,
): number {
  let rank = 1000 - index;
  if (doc.nameNorm === queryNorm) rank += 10_000;
  if (doc.nameNorm.startsWith(queryNorm)) rank += 2_000;
  if (doc.descNorm.includes(queryNorm)) rank += 500;
  return rank;
}

/** Description hits rank below every name-prefix hit; whole-phrase matches first. */
function rankDescriptionDocument(
  doc: Pick<Doc<"manPageSearchDocuments">, "nameNorm" | "descNorm">,
  queryNorm: string,
  index: number,
): number {
  let rank = 400 - index;
  if (doc.descNorm.includes(queryNorm)) rank += 300;
  if (doc.descNorm.startsWith(queryNorm)) rank += 100;
  return rank;
}

async function searchDocsByDescription(
  ctx: QueryCtx,
  args: {
    releaseId: Id<"datasetReleases">;
    section: string | null;
    queryNorm: string;
  },
): Promise<Array<Doc<"manPageSearchDocuments">>> {
  return await ctx.db
    .query("manPageSearchDocuments")
    .withSearchIndex("search_desc", (q) => {
      const base = q.search("descNorm", args.queryNorm).eq("releaseId", args.releaseId);
      return args.section === null ? base : base.eq("section", args.section);
    })
    .take(MAX_DESCRIPTION_HITS);
}

async function textHits(
  ctx: QueryCtx,
  args: {
    releaseId: Id<"datasetReleases">;
    section: string | null;
    queryText: string;
    takeCount: number;
  },
): Promise<RankedHit[]> {
  const { releaseId, section, queryText } = args;
  const queryNorm = queryText.toLowerCase();
  // Name prefix first, then the description search index (one line per page).
  const prefixDocs = await searchDocsByNamePrefix(ctx, {
    releaseId, section, prefix: queryNorm, takeCount: args.takeCount,
  });

  // Always merge the same description candidates so every offset slices one
  // stable ranked set. The index read is bounded by MAX_DESCRIPTION_HITS.
  const descriptionDocs = await searchDocsByDescription(ctx, { releaseId, section, queryNorm });
  const contentWords = queryNorm.split(/[^a-z0-9_]+/).filter((word) => word && !SEARCH_STOP_WORDS.has(word));

  const ranked = new Map<Id<"manPages">, RankedHit>();
  prefixDocs.forEach((doc, index) => {
    const current = ranked.get(doc.pageId);
    const rank = rankSearchDocument(doc, queryNorm, index);
    if (!current || rank > current.rank) ranked.set(doc.pageId, searchDocumentHit(doc, queryText, rank));
  });
  descriptionDocs.forEach((doc, index) => {
    if (ranked.has(doc.pageId)) return;
    // Convex returns ranked any-term matches. Keep content-word overlap, not
    // stop-word-only answers such as true(1) for "how do I extract a tarball".
    const words = `${doc.nameNorm} ${doc.descNorm}`.split(/[^a-z0-9_]+/);
    const overlap = contentWords.filter((word) => words.some((candidate) => candidate.startsWith(word))).length;
    if (queryNorm.includes(" ") && overlap === 0) return;
    ranked.set(doc.pageId, searchDocumentHit(doc, queryText, rankDescriptionDocument(doc, queryNorm, index) + overlap * 50));
  });
  return [...ranked.values()].sort(compareHits);
}

// Names within two edits of `queryText`, for a lookup that found nothing.
// shortcut: 64 total reads across focused, transposed and first-letter
// buckets; use an ingest-time deletion index if recall beyond this cap is needed.
async function typoHits(
  ctx: QueryCtx,
  args: { releaseId: Id<"datasetReleases">; section: string | null; queryText: string },
): Promise<RankedHit[]> {
  const textNorm = args.queryText.toLowerCase();
  if (!/^[a-z0-9_.+-]{3,64}$/.test(textNorm)) return [];
  const prefixes = [...new Set([
    textNorm.slice(0, Math.max(2, textNorm.length - 4)), textNorm.slice(0, 2),
    textNorm[1] + textNorm[0], textNorm[0] + textNorm[2], textNorm[0],
  ])];
  const candidates = new Map<Id<"manPageSearchDocuments">, Doc<"manPageSearchDocuments">>();
  let remaining = 64;
  for (const prefix of prefixes) {
    if (remaining === 0) break;
    const docs = await searchDocsByNamePrefix(ctx, {
      releaseId: args.releaseId, section: args.section, prefix, takeCount: Math.min(16, remaining),
    });
    remaining -= docs.length;
    for (const doc of docs) candidates.set(doc._id, doc);
  }
  return [...candidates.values()]
    .filter((doc) => doc.nameNorm.length <= 64)
    .map((doc) => ({ doc, distance: nameEditDistance(textNorm, doc.nameNorm) }))
    .filter(({ distance }) => distance > 0 && distance <= 2)
    .map(({ doc, distance }) => searchDocumentHit(doc, args.queryText, 100 - distance))
    .sort(compareHits);
}

export const search = query({
  args: {
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
    q: v.string(),
    section: v.union(v.string(), v.null()),
    limit: v.number(),
    offset: v.number(),
  },
  returns: v.object({
    query: v.string(),
    results: v.array(v.object({
      name: v.string(), section: v.string(), title: v.string(), description: v.string(),
      highlights: v.array(v.string()),
      match: v.optional(v.literal("option")), anchorId: v.optional(v.string()),
    })),
    suggestions: v.array(v.string()),
    correctedQuery: v.optional(v.string()),
    hasMore: v.boolean(), nextOffset: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const queryText = args.q.trim().replace(/\s+/g, " ").slice(0, 120).trim();
    if (!queryText) {
      return { query: queryText, results: [], suggestions: [], hasMore: false, nextOffset: null };
    }
    const citation = /^([^\s()]+)\(([0-9][a-z0-9]*)\)$/i.exec(queryText);
    const section = citation ? normalizeSection(citation[2]) : args.section ? normalizeSection(args.section) : null;
    const limit = boundedInt(args.limit, 1, MAX_SEARCH_LIMIT);
    const offset = boundedInt(args.offset, 0, MAX_SEARCH_OFFSET);
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
    const takeCount = Math.min(offset + limit + 5, MAX_SEARCH_OFFSET + MAX_SEARCH_LIMIT);

    // Single flags retain the existing 43-read first page / 303-read maximum.
    // Missing clusters use at most 24 option rows and three pages across sections.
    const optionQuery = parseOptionQuery(queryText);
    const isOptionQuery = optionQuery.flags.length === 1 && optionQuery.words.length <= 1;
    let textQuery = citation ? citation[1] : queryText;
    let visible: RankedHit[] | null = null;
    let hasMore = false;
    if (isOptionQuery) {
      const [flag] = optionQuery.flags;
      const name = optionQuery.words.length ? normalizeName(optionQuery.words[0]) : null;
      const isNamedCluster = name !== null && /^-[a-zA-Z0-9]{2,8}$/.test(flag);
      const lookup = {
        releaseId: release._id, section, namePrefix: name,
        exactName: isNamedCluster, take: offset + limit + 1,
      };
      let rows = await optionFlagRowsFor(ctx, { ...lookup, flag });
      if (!rows.length && flag.startsWith("--") && flag !== flag.toLowerCase()) {
        rows = await optionFlagRowsFor(ctx, { ...lookup, flag: flag.toLowerCase() });
      }
      if (!rows.length && isNamedCluster) {
        const hits = await clusterHits(ctx, release._id, name!, flag, section);
        if (hits.length) {
          visible = hits.slice(offset, offset + limit);
          hasMore = hits.length > offset + limit;
        } else {
          const exactCommand = await ctx.db.query("manPages")
            .withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", release._id).eq("name", name!))
            .first();
          // A command prefix such as `fin -name` still finds find's real flag.
          if (!exactCommand) rows = await optionFlagRowsFor(ctx, { ...lookup, exactName: false, flag });
        }
      }
      if (rows.length) {
        visible = [];
        for (const row of rows.slice(offset, offset + limit)) {
          const hit = await optionHit(ctx, row, 0);
          if (hit) visible.push(hit);
        }
        hasMore = rows.length > offset + limit;
      } else if (visible === null) {
        if (!name) return { query: queryText, results: [], suggestions: [], hasMore: false, nextOffset: null };
        textQuery = name;
      }
    }
    let ordered: RankedHit[] = [];
    let suggestions: string[] = [];
    if (visible === null) {
      ordered = await textHits(ctx, {
        releaseId: release._id,
        section,
        queryText: textQuery,
        takeCount,
      });
      // man(7) is a .so alias to groff_man(7) in Linux releases. Keep the
      // citation's URL, which the reader already redirects to its target.
      if (citation && !ordered.some((hit) => normalizeName(hit.name) === normalizeName(textQuery))) {
        const alias = await ctx.db.query("manPageAliases")
          .withIndex("by_releaseId_and_name_and_section", (q) => q
            .eq("releaseId", release._id).eq("name", normalizeName(textQuery)).eq("section", section!))
          .unique();
        if (alias) {
          const target = await pageByNameAndSection(ctx, {
            releaseId: release._id, name: alias.targetName, section: alias.targetSection,
          });
          if (target) ordered.unshift({
            name: alias.name, section: alias.section, title: `${alias.name}(${alias.section})`,
            description: target.description, highlights: [], rank: 20_000,
          });
        }
      }
      if (citation && !ordered.some((hit) => normalizeName(hit.name) === normalizeName(textQuery))) {
        const name = normalizeName(textQuery);
        const pages = await ctx.db.query("manPages")
          .withIndex("by_releaseId_and_name_and_section", (q) => q.eq("releaseId", release._id).eq("name", name)
            .gte("section", section!).lt("section", prefixUpperBound(section!)))
          .take(8);
        if (pages.length) ordered = pages.map((page) => ({
          name: page.name, section: page.section, title: page.title,
          description: page.description, highlights: [], rank: 20_000,
        }));
      }
      if (!ordered.length && !optionQuery.flags.length) {
        ordered = await typoHits(ctx, { releaseId: release._id, section, queryText: textQuery });
        suggestions = [...new Set(ordered.map((hit) => hit.name))].slice(0, 5);
      }
      visible = ordered.slice(offset, offset + limit);
      hasMore = ordered.length > offset + visible.length;
    }
    // Never advertise an offset the handler will clamp backward (MAX_SEARCH_OFFSET).
    const nextOffset =
      hasMore && offset < MAX_SEARCH_OFFSET ? Math.min(offset + visible.length, MAX_SEARCH_OFFSET) : null;

    return {
      query: queryText,
      results: visible.map((hit) => ({
        name: hit.name,
        section: hit.section,
        title: hit.title,
        description: hit.description,
        highlights: hit.highlights,
        ...(hit.anchorId ? { match: "option" as const, anchorId: hit.anchorId } : {}),
      })),
      suggestions,
      ...(suggestions.length ? { correctedQuery: suggestions[0] } : {}),
      hasMore: nextOffset !== null,
      nextOffset,
    };
  },
});

export const suggest = query({
  args: {
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
    name: v.string(),
    // The man page 404 asks for spelling corrections when no name has this prefix.
    // Type-ahead callers leave it off, so a keystroke never pays for them.
    typos: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
    const docs = await searchDocsByNamePrefix(ctx, {
      releaseId: release._id,
      section: null,
      prefix: name,
      takeCount: 10,
    });
    const hits = docs.length || !args.typos
      ? docs
      : (await typoHits(ctx, { releaseId: release._id, section: null, queryText: name })).slice(0, 10);

    return {
      query: name,
      suggestions: hits.map((hit) => ({
        name: hit.name,
        section: hit.section,
        description: hit.description,
      })),
    };
  },
});

export const listLicenses = query({
  args: {
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
  },
  handler: async (ctx, args) => {
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
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
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
    packageName: v.string(),
  },
  handler: async (ctx, args) => {
    const pkg = args.packageName.trim().toLowerCase();
    const release = await requireActiveRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
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
    stage: publicStageCompatibilityValidator,
  },
  handler: async (ctx) => {
    const releases = await Promise.all(
      DISTROS.map(async (distro) => {
        const release = await activeRelease(ctx, { stage: PUBLIC_DATASET_STAGE, distro });
        if (!release) return null;
        return {
          distro,
          datasetReleaseId: release.datasetReleaseId,
          ingestedAt: release.ingestedAt,
          pageCount: release.pageCount,
        };
      }),
    );

    return {
      urlsPerFile: SITEMAP_URLS_PER_FILE,
      items: releases.filter((item): item is NonNullable<typeof item> => item !== null),
    };
  },
});

export const listSitemapPageChunk = query({
  args: {
    stage: publicStageCompatibilityValidator,
    distro: distroValidator,
    page: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const release = await activeRelease(ctx, {
      stage: PUBLIC_DATASET_STAGE,
      distro: args.distro,
    });
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
      datasetReleaseId: release.datasetReleaseId,
      items: result.page.map((page) => ({ name: page.name, section: page.section })),
      page: args.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
