// Option flags are indexed one row per (page, flag) in manPageOptionFlags so a
// query such as `--create`, `tar -c`, or `-C` is one exact index lookup.

// Python derives a ten-page cap from a 7,000-derived-write allowance:
// 400 flags + 256 symbols per page leaves room for existing metadata writes.
export const MAX_OPTION_FLAG_ROWS_PER_PAGE = 400;
const MAX_FLAG_CHARS = 80;

// `-c`, `--no-seek`, `+F`, `-?`, `-#`, `-@`, `-%`, `-:`, `--http1.1`. Bare
// keyword terms (ssh_config ForwardAgent) are not indexed: the parser emits
// no options for those pages today, so there is nothing real to match.
const FLAG_RE = /^(?:-{1,2}|\+)[A-Za-z0-9?#@%:!][A-Za-z0-9_.+:#-]*$/;
// grep writes `-ANUM` and `-ePATTERNS`: a short flag with a placeholder
// attached. Only these placeholders split, so gcc's `-fPIC` stays whole.
const ATTACHED_PLACEHOLDER_RE =
  /^(-[A-Za-z])(?:NUM|N|FILE|FILES|PATTERN|PATTERNS|ACTION|DIR|DIRECTORY|STRING|COMMAND|TYPE|LEVEL|SIZE|LIST|GLOB|FORMAT|WHEN|MODE|NAME|ARG|ARGS|VALUE|KEY|PATH|COUNT|WIDTH|SEP|SECS|SECONDS|TIME|DATE|CHARS|LINES|BYTES|DEPTH)$/;

export type OptionFlagRow = { flag: string; anchorId: string; flags: string; takesArgument?: boolean; argumentOptional?: boolean; excerpt?: string };

export function flagTakesArgument(flags: string): boolean {
  return /[=<]|(?:^|[\s,|])\[?[A-Z][A-Z_]*\b/.test(flags) ||
    flags.split(/[\s,|/]+/).some((part) => ATTACHED_PLACEHOLDER_RE.test(part));
}

/** Optional arguments are never taken from the following word. */
export function flagArgumentOptional(flags: string): boolean {
  return /\[(?:=[A-Za-z_][A-Za-z0-9_-]*|[A-Z][A-Z0-9_]*|<[^>]+>)\]/.test(flags);
}
// Legacy index rows lack the argument-column metadata. These exact GNU forms
// are optional independently of how the old ingest rendered their flag text.
export function optionArgumentOptional(row: {flag:string; flags:string; argumentOptional?:boolean}, command: string): boolean {
  return row.argumentOptional ?? (flagArgumentOptional(row.flags) || (command==='rm' && row.flag==='--interactive') || (command==='xargs' && ['-i','--replace','-l','--max-lines','-e','--eof'].includes(row.flag)));
}
export function flagAllowsShortEquals(flags: string, flag: string): boolean {
  return flags.split(/[\s,|]+/).some(form => form.startsWith(`${flag}=`) || form.startsWith(`${flag}[=`));
}

/** `--sort=ORDER` and `--color[=WHEN]` key as `--sort` and `--color`; case is kept. */
export function flagKey(token: string): string | null {
  const key = token.split(/[=[<]/, 1)[0].replace(/[.,;:]+$/, "");
  return key.length <= MAX_FLAG_CHARS && FLAG_RE.test(key) ? key : null;
}

/** `--[no-]color` spells two flags; the bracket group is read both ways. */
function bracketVariants(part: string): string[] {
  const group = /\[([^\]=]*)\]/.exec(part);
  if (!group || group.index === 0) return [part];
  const without = part.slice(0, group.index) + part.slice(group.index + group[0].length);
  const withGroup = part.slice(0, group.index) + group[1] + part.slice(group.index + group[0].length);
  return [without, withGroup];
}

export function optionKeys(flags: string): string[] {
  const keys: string[] = [];
  for (const part of flags.trim().split(/[\s,|/]+/)) {
    for (const variant of bracketVariants(part)) {
      const key = flagKey(variant);
      if (!key) continue;
      keys.push(ATTACHED_PLACEHOLDER_RE.exec(key)?.[1] ?? key);
    }
  }
  return keys;
}

/** Derive index rows from parsed OPTIONS; the first option to define a flag owns it. */
export function optionFlagRows(options: unknown): OptionFlagRow[] {
  if (!Array.isArray(options)) return [];
  const rows: OptionFlagRow[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    if (!option || typeof option !== "object") continue;
    const { flags, anchorId, argument, description } = option as { flags?: unknown; anchorId?: unknown; argument?: unknown; description?: unknown };
    if (typeof flags !== "string" || typeof anchorId !== "string" || !anchorId) continue;
    for (const flag of optionKeys(flags)) {
      if (seen.has(flag)) continue;
      seen.add(flag);
      const takesArgument = (typeof argument === "string" && argument.trim().length > 0) || flagTakesArgument(flags);
      const argumentOptional = flagArgumentOptional(flags) || (typeof argument === 'string' && /^\[.*\]$/.test(argument.trim()));
      rows.push({ flag, anchorId, ...(argumentOptional ? {argumentOptional:true} : {}), flags: flags.trim().slice(0, MAX_FLAG_CHARS), ...(takesArgument ? { takesArgument: true } : {}), ...(typeof description === 'string' && description ? { excerpt: description.slice(0, 160) } : {}) });
      if (rows.length >= MAX_OPTION_FLAG_ROWS_PER_PAGE) return rows;
    }
  }
  return rows;
}

/** Split a search query into flag keys and the remaining words. */
export function parseOptionQuery(queryText: string): { flags: string[]; words: string[] } {
  const flags: string[] = [];
  const words: string[] = [];
  for (const token of queryText.split(" ")) {
    const flag = flagKey(token);
    if (!flag) words.push(token);
    else if (!flags.includes(flag)) flags.push(flag);
  }
  return { flags, words };
}
