// Generated layer (B6): the page's own EXAMPLES, verified tldr-pages examples,
// and build-time model text, stored once per page content hash. Rows are not
// owned by a release: identical pages in any release or distro share one row,
// and a changed page gets a new hash and a new row. See docs/generated-layer.md.

import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";

// Advertised by GET /ingest/generated/contract. Keep aligned with
// ingestion/ingestion/generated/store.py.
export const GENERATED_CONTRACT_VERSION = 2;

export const GENERATED_ROUTES = [
  "/ingest/generated/candidates",
  "/ingest/generated/inputs",
  "/ingest/generated",
  "/ingest/generated/flag-usage",
] as const;

export const GENERATED_LIMITS = {
  recordsPerRequest: 25,
  candidatesPerPage: 200,
  inputsPerRequest: 10,
  examplesPerSource: 5,
  shownExamples: 5,
  commandChars: 400,
  descriptionChars: 240,
  placeholderSpans: 16,
  summaryChars: 240,
  taskPhrases: 5,
  taskPhraseChars: 60,
  partFlagUsageRows: 64,
  labelChars: 64,
  // Pages per content hash that receive B7 flag usage.
  flagUsagePages: 64,
  // B7 updates one propagation mutation schedules before continuing itself;
  // Convex allows 1,000 scheduled functions per mutation.
  flagUsageSchedules: 256,
  // B7's setVerifiedFlagUsage accepts at most this many rows.
  flagUsageRows: 256,
  // Serialized page inputs per response; later pages are deferred.
  inputResponseBytes: 8 * 1024 * 1024,
} as const;

export const GENERATED_CONTRACT = {
  schemaVersion: GENERATED_CONTRACT_VERSION,
  routes: GENERATED_ROUTES,
  limits: GENERATED_LIMITS,
};

export const generatedExampleValidator = v.object({
  description: v.string(),
  command: v.string(),
  // [start, end) spans of user-supplied values in `command`.
  placeholders: v.optional(v.array(v.array(v.number()))),
});

// Same shape as B7's verified flag usage, minus the source the part implies.
export const flagUsageValidator = v.object({ flag: v.string(), count: v.number() });

export const pageExamplesPartValidator = v.object({
  examples: v.array(generatedExampleValidator),
  flagUsage: v.array(flagUsageValidator),
});

export const tldrPartValidator = v.object({
  commit: v.string(),
  path: v.string(),
  examples: v.array(generatedExampleValidator),
  rejected: v.number(),
  flagUsage: v.array(flagUsageValidator),
});

export const generatedPartValidator = v.object({
  provider: v.string(),
  model: v.string(),
  promptVersion: v.string(),
  generatedAt: v.string(),
  summary: v.optional(v.string()),
  examples: v.array(generatedExampleValidator),
  taskPhrases: v.array(v.string()),
  rejected: v.number(),
});

export const generatedPartNameValidator = v.union(
  v.literal("page"),
  v.literal("tldr"),
  v.literal("generated"),
);
export type GeneratedPartName = Infer<typeof generatedPartNameValidator>;

export const generatedRecordValidator = v.object({
  contentSha256: v.string(),
  // The tldr-pages commit this page was checked against, matched or not.
  tldrCommit: v.optional(v.string()),
  page: v.optional(pageExamplesPartValidator),
  tldr: v.optional(tldrPartValidator),
  generated: v.optional(generatedPartValidator),
});

type Example = Infer<typeof generatedExampleValidator>;
type FlagUsage = Infer<typeof flagUsageValidator>;
export type GeneratedRecord = Infer<typeof generatedRecordValidator>;

const SHA256_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const TLDR_PATH_RE = /^[a-z-]+\/[a-z0-9][a-z0-9._+-]*\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/;

export class GeneratedRecordError extends Error {
  constructor(message: string) {
    super(`INVALID_GENERATED_RECORD: ${message}`);
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new GeneratedRecordError(message);
}

// C0 and C1 controls, DEL, line/paragraph separators and bidi controls.
// Keep aligned with ingestion/ingestion/generated/safety.py. Stored text is
// plain text: readers render it as text nodes, never as HTML or markdown.
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

export function hasForbiddenChars(value: string, { multiline = false } = {}): boolean {
  // Only the manual's own multi-line example commands may contain line feeds.
  return FORBIDDEN_CHARS.test(multiline ? value.replaceAll("\n", "") : value);
}

function checkText(value: string, max: number, what: string, { multiline = false, allowEmpty = false } = {}): void {
  check(allowEmpty || value.trim().length > 0, `${what} is empty`);
  check(value.length <= max, `${what} is longer than ${max} characters`);
  check(multiline || !/[\r\n]/.test(value), `${what} has a line break`);
  check(!hasForbiddenChars(value, { multiline }), `${what} has control characters`);
}

function checkExamples(examples: Example[], what: string): void {
  check(examples.length <= GENERATED_LIMITS.examplesPerSource, `${what} has too many examples`);
  for (const example of examples) {
    checkText(example.command, GENERATED_LIMITS.commandChars, `${what} command`, { multiline: what === "page" });
    // The manual's own examples do not always have a lead-in sentence.
    checkText(example.description, GENERATED_LIMITS.descriptionChars, `${what} description`, { allowEmpty: what === "page" });
    const spans = example.placeholders ?? [];
    check(spans.length <= GENERATED_LIMITS.placeholderSpans, `${what} has too many placeholders`);
    let previous = 0;
    for (const span of spans) {
      check(span.length === 2 && span.every(Number.isSafeInteger), `${what} placeholder is not a span`);
      const [start, end] = span;
      check(start >= previous && start < end && end <= example.command.length, `${what} placeholder is out of range`);
      previous = end;
    }
  }
}

function checkFlagUsage(rows: FlagUsage[], what: string): void {
  check(rows.length <= GENERATED_LIMITS.partFlagUsageRows, `${what} flag usage is too long`);
  for (const row of rows) {
    check(row.flag.length > 0 && row.flag.length <= 80 && !hasForbiddenChars(row.flag), `${what} flag is malformed`);
    check(Number.isSafeInteger(row.count) && row.count > 0, `${what} flag count is invalid`);
  }
}

function checkLabel(value: string, what: string): void {
  check(value.length <= GENERATED_LIMITS.labelChars && LABEL_RE.test(value), `${what} is malformed`);
}

/** Bounds every stored field so the read path stays compact. */
export function validateGeneratedRecord(record: GeneratedRecord): void {
  check(SHA256_RE.test(record.contentSha256), "contentSha256 must be a sha256 hex digest");
  check(Boolean(record.page || record.tldr || record.generated), "record has no parts");
  if (record.page) {
    checkExamples(record.page.examples, "page");
    checkFlagUsage(record.page.flagUsage, "page");
  }
  if (record.tldrCommit !== undefined) check(COMMIT_RE.test(record.tldrCommit), "tldrCommit must be a full git sha");
  if (record.tldr) {
    check(COMMIT_RE.test(record.tldr.commit), "tldr commit must be a full git sha");
    check(TLDR_PATH_RE.test(record.tldr.path), "tldr path is malformed");
    check(Number.isSafeInteger(record.tldr.rejected) && record.tldr.rejected >= 0, "tldr rejected count is invalid");
    checkExamples(record.tldr.examples, "tldr");
    checkFlagUsage(record.tldr.flagUsage, "tldr");
  }
  const generated = record.generated;
  if (generated) {
    checkLabel(generated.provider, "provider");
    checkLabel(generated.model, "model");
    checkLabel(generated.promptVersion, "promptVersion");
    check(DATE_RE.test(generated.generatedAt), "generatedAt must be YYYY-MM-DD");
    check(Number.isSafeInteger(generated.rejected) && generated.rejected >= 0, "generated rejected count is invalid");
    if (generated.summary !== undefined) checkText(generated.summary, GENERATED_LIMITS.summaryChars, "summary");
    checkExamples(generated.examples, "generated");
    check(generated.taskPhrases.length <= GENERATED_LIMITS.taskPhrases, "too many task phrases");
    for (const phrase of generated.taskPhrases) checkText(phrase, GENERATED_LIMITS.taskPhraseChars, "task phrase");
    check(Boolean(generated.summary || generated.examples.length || generated.taskPhrases.length), "generated part is empty");
  }
}

export type BriefExample = {
  source: "page" | "tldr" | "generated";
  description: string;
  command: string;
  placeholders?: number[][];
  // tldr-pages items carry their own CC BY 4.0 attribution.
  attribution?: { name: "tldr-pages"; url: string; license: "CC-BY-4.0"; licenseUrl: string; modified: string };
};

export const TLDR_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
export const TLDR_MODIFIED =
  "Placeholders converted (alternatives shown as the first choice); examples filtered by flag verification against this manual.";

export type ManPageBrief = {
  summary: string | null;
  examples: BriefExample[];
  taskPhrases: string[];
  tldr: { path: string; commit: string; url: string; license: "CC-BY-4.0" } | null;
  generated: { provider: string; model: string; promptVersion: string; generatedAt: string } | null;
};

function sourced(
  source: BriefExample["source"],
  examples: Example[],
  attribution?: BriefExample["attribution"],
): BriefExample[] {
  return examples.map((example) => ({ source, ...example, ...(attribution ? { attribution } : {}) }));
}

function tldrUrl(tldr: { commit: string; path: string }): string {
  return `https://github.com/tldr-pages/tldr/blob/${tldr.commit}/pages/${tldr.path}`;
}

/** The man page's answer-first data: page examples, then tldr, then generated, five at most. */
export function briefFromRecord(row: Doc<"manPageGenerated"> | null): ManPageBrief | null {
  if (!row) return null;
  const examples = [
    ...sourced("page", row.page?.examples ?? []),
    ...sourced("tldr", row.tldr?.examples ?? [], row.tldr ? {
      name: "tldr-pages", url: tldrUrl(row.tldr), license: "CC-BY-4.0", licenseUrl: TLDR_LICENSE_URL, modified: TLDR_MODIFIED,
    } : undefined),
    ...sourced("generated", row.generated?.examples ?? []),
  ].slice(0, GENERATED_LIMITS.shownExamples);
  const shown = new Set(examples.map((example) => example.source));
  const generated = row.generated;
  const brief: ManPageBrief = {
    summary: generated?.summary ?? null,
    examples,
    taskPhrases: generated?.taskPhrases ?? [],
    tldr: row.tldr && shown.has("tldr")
      ? {
        path: row.tldr.path,
        commit: row.tldr.commit,
        url: tldrUrl(row.tldr),
        license: "CC-BY-4.0",
      }
      : null,
    generated: generated
      ? { provider: generated.provider, model: generated.model, promptVersion: generated.promptVersion, generatedAt: generated.generatedAt }
      : null,
  };
  if (!brief.summary && !brief.examples.length && !brief.taskPhrases.length) return null;
  return brief;
}

// The prompt reads DESCRIPTION, and page examples come from EXAMPLES. Keep
// these titles aligned with ingestion/ingestion/generated/page.py.
const INPUT_SECTIONS = new Set(["DESCRIPTION", "EXAMPLE", "EXAMPLES", "USAGE EXAMPLES", "EXAMPLES OF USE"]);

type DocBlock = { type?: unknown; level?: unknown; text?: unknown };

/** Only the document sections generation reads, so large manuals stay small. */
export function generationDoc(doc: unknown): { toc: never[]; blocks: unknown[] } {
  const blocks = doc && typeof doc === "object" && Array.isArray((doc as { blocks?: unknown }).blocks)
    ? (doc as { blocks: DocBlock[] }).blocks
    : [];
  const kept: unknown[] = [];
  let keepLevel: number | null = null;
  for (const block of blocks) {
    if (block?.type === "heading") {
      const level = typeof block.level === "number" ? block.level : 2;
      if (keepLevel !== null && level <= keepLevel) keepLevel = null;
      const title = String(block.text ?? "").toUpperCase().split(/\s+/).filter(Boolean).join(" ");
      if (keepLevel === null && INPUT_SECTIONS.has(title)) keepLevel = level;
    }
    if (keepLevel !== null) kept.push(block);
  }
  return { toc: [], blocks: kept };
}

export type VerifiedFlagUsage = { flag: string; count: number; source: "examples" | "tldr" };

/**
 * B7's most-used-flags input (#429 `derived.setVerifiedFlagUsage`): verified
 * counts from the manual's EXAMPLES and from tldr-pages. Generated examples
 * never count.
 */
export function flagUsageFor(row: Doc<"manPageGenerated"> | null): VerifiedFlagUsage[] {
  if (!row) return [];
  const usage: VerifiedFlagUsage[] = [
    ...(row.page?.flagUsage ?? []).map((item) => ({ ...item, source: "examples" as const })),
    ...(row.tldr?.flagUsage ?? []).map((item) => ({ ...item, source: "tldr" as const })),
  ];
  return usage.slice(0, GENERATED_LIMITS.flagUsageRows);
}

export function sameFlagUsage(a: VerifiedFlagUsage[] | undefined, b: VerifiedFlagUsage[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b);
}
