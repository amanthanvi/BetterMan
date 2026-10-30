import type { Doc } from "./_generated/dataModel";
import type { PageDerivedResponse } from "./_derivedEncoding";
import type { ManPageBrief } from "./_generatedLayer";

export const DISTROS = [
  "debian",
  "ubuntu",
  "fedora",
  "arch",
  "alpine",
  "freebsd",
  "macos",
] as const;

export const DATASET_STAGES = ["staging", "prod"] as const;

export type Distro = (typeof DISTROS)[number];
export type DatasetStage = (typeof DATASET_STAGES)[number];
export const PUBLIC_DATASET_STAGE: DatasetStage = "prod";
export type ManPageContentPayload = {
  docJson?: string;
  synopsisJson?: string;
  optionsJson?: string;
  seeAlsoJson?: string;
};

export const MAX_SEARCH_TEXT_CHARS = 800;
export const MAX_SNIPPET_TEXT_CHARS = 240;
const MAX_SNIPPET_IN_SEARCH_TEXT_CHARS = 160;

export const DISTRO_ORDER: Record<string, number> = Object.fromEntries(
  DISTROS.map((distro, index) => [distro, index]),
);

const SECTION_LABELS: Record<string, string> = {
  "1": "User Commands",
  "2": "System Calls",
  "3": "Library Functions",
  "4": "Special Files",
  "5": "File Formats",
  "6": "Games",
  "7": "Miscellany",
  "8": "System Administration",
  "9": "Kernel Routines",
};

const SECTION_SUFFIX_LABELS: Record<string, string> = {
  p: "POSIX",
  ssl: "OpenSSL",
};

export function normalizeDistro(value: string | null): Distro {
  const raw = value?.trim().toLowerCase() || "debian";
  if ((DISTROS as readonly string[]).includes(raw)) return raw as Distro;
  throw new Error("INVALID_DISTRO");
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeSection(value: string): string {
  return value.trim().toLowerCase();
}

export function sectionLabel(section: string): string {
  const sectionNorm = normalizeSection(section);
  const direct = SECTION_LABELS[sectionNorm];
  if (direct) return direct;

  const base = SECTION_LABELS[sectionNorm.charAt(0)];
  if (!base) return sectionNorm;

  const suffix = sectionNorm.slice(1);
  if (!suffix) return base;
  return `${base} (${SECTION_SUFFIX_LABELS[suffix] || suffix})`;
}

export function sectionSortKey(section: string): string {
  const first = section.charAt(0);
  if (first >= "0" && first <= "9") {
    return `0:${first.padStart(2, "0")}:${section.slice(1)}`;
  }
  return `1:00:${section}`;
}

export function parseJsonField(value: string | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function releasePackageManifest(release: Doc<"datasetReleases">): unknown {
  return parseJsonField(release.packageManifestJson);
}

export type ManProviders = { packages: string[]; defaultPackage: string | null; policy: 'debian' | 'curated' };

export function pageResponse(
  release: Doc<"datasetReleases">,
  page: Pick<Doc<"manPages">, "externalId" | "name" | "section" | "title" | "description" | "sourcePackage" | "sourcePackageVersion" | "hasParseWarnings">,
  content: ManPageContentPayload,
  variants: Array<{ distro: string; datasetReleaseId: string; contentSha256: string }>,
  // Enrichment beside the upstream content, each part optional and independent.
  extras: { derived?: PageDerivedResponse | null; brief?: ManPageBrief | null; providers?: ManProviders | null } = {},
) {
  const doc = parseJsonField(content.docJson);
  const contentPayload: Record<string, unknown> =
    doc && typeof doc === "object" && !Array.isArray(doc)
      ? { ...(doc as Record<string, unknown>) }
      : { toc: [], blocks: [] };

  contentPayload.synopsis = parseJsonField(content.synopsisJson);
  contentPayload.options = parseJsonField(content.optionsJson);
  contentPayload.seeAlso = parseJsonField(content.seeAlsoJson);

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
      hasParseWarnings: page.hasParseWarnings,
    },
    content: contentPayload,
    variants,
    ...(extras.derived ? { derived: extras.derived } : {}),
    brief: extras.brief ?? null,
    providers: extras.providers ?? null,
  };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function deterministicSnippet(text: string, query: string): string {
  const source = normalizeText(text);
  const q = normalizeText(query);
  if (!source || !q) return "";

  const sourceLower = source.toLowerCase();
  const queryLower = q.toLowerCase();
  const terms = queryLower.split(" ").filter(Boolean);
  const firstMatch =
    sourceLower.indexOf(queryLower) >= 0
      ? { index: sourceLower.indexOf(queryLower), needle: q }
      : terms
          .map((term) => ({ index: sourceLower.indexOf(term), needle: term }))
          .filter((hit) => hit.index >= 0)
          .sort((a, b) => a.index - b.index)[0];

  if (!firstMatch) {
    return source.length > 180 ? `${source.slice(0, 180)}...` : source;
  }

  const radius = 90;
  const start = Math.max(0, firstMatch.index - radius);
  const end = Math.min(source.length, firstMatch.index + firstMatch.needle.length + radius);
  let snippet = source.slice(start, end).trim();
  if (start > 0) snippet = `...${snippet}`;
  if (end < source.length) snippet = `${snippet}...`;

  const marker = new RegExp(escapeRegExp(firstMatch.needle), "ig");
  return snippet.replace(marker, (match) => `⟪${match}⟫`);
}

export function prefixUpperBound(prefix: string): string {
  return `${prefix}\uffff`;
}

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  // Do not leave half of a surrogate pair at the cut.
  const high = value.charCodeAt(maxChars - 1);
  return value.slice(0, high >= 0xd800 && high <= 0xdbff ? maxChars - 1 : maxChars);
}

export function normalizeSearchDocumentText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function searchMetadataFields(page: {
  name: string;
  section: string;
  title: string;
  description: string;
  snippetText: string;
}): string[] {
  return [
    page.name,
    `${page.name}(${page.section})`,
    page.title,
    page.description,
    truncateText(page.snippetText, MAX_SNIPPET_IN_SEARCH_TEXT_CHARS),
  ];
}

/** Compact search-doc text for prefix/suggest metadata only (FTS body retired). */
export function compactManPageSearchText(page: {
  name: string;
  section: string;
  title: string;
  description: string;
  searchText?: string;
  snippetText: string;
}): string {
  void page.searchText;
  const seen = new Set<string>();
  const parts = [];
  for (const field of searchMetadataFields(page)) {
    const normalized = normalizeSearchDocumentText(field);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    parts.push(normalized);
  }
  return truncateText(parts.join("\n"), MAX_SEARCH_TEXT_CHARS);
}

// Compare two secrets without leaking their contents through timing. Both
// sides are hashed first so the comparison always runs over a fixed 32 bytes
// and reveals nothing about the length or prefix of the configured secret.
export async function secretsMatch(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);

  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);

  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}
