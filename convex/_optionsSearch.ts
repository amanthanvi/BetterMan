// This single indexed field includes the anchor map in its UTF-8 byte budget.
// Keep the producer aligned with ingestion/options_search.py.
export const MAX_OPTIONS_SEARCH_BYTES = 2048;
type Entry = [anchorId: string, indexTerms: string, tokens: string];
const BARE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/;
const OPTION_DELIMITERS_RE = /[\s,|()[\]{}=]/;

function isOptionToken(token: string): boolean {
  return BARE_TOKEN_RE.test(token) ||
    (/^(?:-{1,2}|\+)[!-~]+$/.test(token) && !OPTION_DELIMITERS_RE.test(token));
}

function normalizeToken(token: string): string {
  const flag = token.startsWith("-") || token.startsWith("+");
  return flag ? token : token.toLowerCase();
}

// A fixed 17-character term avoids FTS tokenizer length limits for long flags.
// Raw tokens are verified after retrieval, so hash collisions cannot match.
function indexTerm(token: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of token) hash = BigInt.asUintN(64, (hash ^ BigInt(char.charCodeAt(0))) * 0x100000001b3n);
  return `t${hash.toString(16).padStart(16, "0")}`;
}

export function optionsIndexQuery(tokens: string[]): string {
  return tokens.map(indexTerm).join(" ");
}

/** Preserve leading signs and case for flags; bare spellings ignore case. */
export function optionsQueryTokens(query: string): string[] {
  const parts = query.trim().split(/\s+/);
  if (!parts.length || parts.some((part) => !isOptionToken(part))) return [];
  return [...new Set(parts.map(normalizeToken))];
}

/** Derive only from parsed OPTIONS flags, never caller-provided search text. */
export function deriveOptionsSearchText(options: unknown): string | undefined {
  if (!Array.isArray(options)) return undefined;
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    if (!option || typeof option !== "object" || typeof option.flags !== "string" ||
        typeof option.anchorId !== "string" || !option.anchorId) continue;
    const flags: string[] = option.flags.split(/[\s,|()[\]{}]+/)
      .map((part: string) => part.split("=")[0]).filter(isOptionToken);
    const tokens = [...new Set(flags.flatMap((flag: string) => {
      const bare = flag.replace(/^[-+]+/, "");
      return [normalizeToken(flag), ...(BARE_TOKEN_RE.test(bare) ? [normalizeToken(bare)] : [])];
    }))];
    if (!tokens.length) continue;
    // Whitespace delimits tokens from JSON punctuation in both real FTS and
    // convex-test's simpler whitespace tokenizer.
    const entry: Entry = [option.anchorId, ` ${optionsIndexQuery(tokens)} `, tokens.join(" ")];
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    const next = JSON.stringify([...entries, entry]);
    if (new TextEncoder().encode(next).byteLength > MAX_OPTIONS_SEARCH_BYTES) continue;
    entries.push(entry);
    seen.add(key);
  }
  return entries.length ? JSON.stringify(entries) : undefined;
}

/** Mutation boundary also validates the compact field from the storage action. */
export function validateOptionsSearchText(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  if (new TextEncoder().encode(text).byteLength > MAX_OPTIONS_SEARCH_BYTES) throw new Error("OPTIONS_SEARCH_TOO_LARGE");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("INVALID_OPTIONS_SEARCH"); }
  if (!Array.isArray(parsed) || parsed.some((entry) => !Array.isArray(entry) || entry.length !== 3 ||
    typeof entry[0] !== "string" || !entry[0] || typeof entry[1] !== "string" ||
    !/^ t[0-9a-f]{16}(?: t[0-9a-f]{16})* $/.test(entry[1]) || typeof entry[2] !== "string" ||
    optionsIndexQuery(optionsQueryTokens(entry[2])) !== entry[1].trim())) throw new Error("INVALID_OPTIONS_SEARCH");
  return parsed.length ? text : undefined;
}

export function matchingOptionAnchor(text: string | undefined, tokens: string[]): string | undefined {
  if (!text || !tokens.length) return undefined;
  // Historical rows simply omit this field; malformed legacy data also degrades.
  try {
    const entries = JSON.parse(text) as Entry[];
    return entries.find((entry) => tokens.every((token) => entry[2].split(" ").includes(token)))?.[0];
  } catch { return undefined; }
}
