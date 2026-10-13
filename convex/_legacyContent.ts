import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { ManPageContentPayload } from "./lib";

export type ContentJsonKind = keyof ManPageContentPayload;
export type StoredContentFields = Record<ContentJsonKind, string | null>;
export type ContentField = { kind: ContentJsonKind; value: string | undefined };

export const CONTENT_KINDS: ContentJsonKind[] = [
  "docJson",
  "synopsisJson",
  "optionsJson",
  "seeAlsoJson",
];

export const CONTENT_CHUNK_CHARS = 400_000;
export const MAX_CONTENT_FIELD_CHARS = 20 * CONTENT_CHUNK_CHARS;

export function validateContentFieldSize(value: string, kind: string): void {
  if (value.length > MAX_CONTENT_FIELD_CHARS) {
    throw new Error(`CONTENT_FIELD_TOO_LARGE: ${kind} exceeds ${MAX_CONTENT_FIELD_CHARS} characters (20 chunks)`);
  }
}

export function contentChunks(value: string): string[] {
  const chunks = [];
  for (let index = 0; index < value.length; index += CONTENT_CHUNK_CHARS) {
    chunks.push(value.slice(index, index + CONTENT_CHUNK_CHARS));
  }
  return chunks;
}

// Ingest retains fields through 500,000 characters inline; legacy maintenance
// retains only 400,000. Keep those deliberate call-site thresholds distinct.
export function splitContentFields(contentFields: ContentField[], inlineThreshold: number): {
  inlinePayload: Partial<Record<ContentJsonKind, string>>;
  chunkedFields: Array<{ kind: ContentJsonKind; value: string }>;
} {
  const inlinePayload: Partial<Record<ContentJsonKind, string>> = {};
  const chunkedFields: Array<{ kind: ContentJsonKind; value: string }> = [];
  for (const field of contentFields) {
    if (typeof field.value !== "string") continue;
    if (field.value.length > inlineThreshold) {
      chunkedFields.push({ kind: field.kind, value: field.value });
    } else {
      inlinePayload[field.kind] = field.value;
    }
  }
  return { inlinePayload, chunkedFields };
}

type DbCtx = QueryCtx | MutationCtx;

function joinChunks(chunks: Array<{ chunkIndex: number; chunk: string }>, strict: boolean): string | null {
  if (!chunks.length) return null;
  if (chunks.length > 200) throw new Error("CONTENT_CHUNKS_INVALID_OR_OVERSIZED: field exceeds 200 chunks");
  if (strict && chunks.some((chunk, index) => chunk.chunkIndex !== index)) {
    throw new Error("CONTENT_CHUNKS_INVALID_OR_OVERSIZED");
  }
  return chunks.map((chunk) => chunk.chunk).join("");
}

export async function readContentBlobField(
  ctx: DbCtx,
  blob: Doc<"manPageContentBlobs">,
  kind: ContentJsonKind,
  strict = false,
): Promise<string | null> {
  const inline = blob[kind];
  if (typeof inline === "string") return inline;

  const query = ctx.db
    .query("manPageContentBlobChunks")
    .withIndex("by_blobId_and_kind_and_chunkIndex", (q) =>
      q.eq("blobId", blob._id).eq("kind", kind),
    );
  const chunks = await query.take(201);
  return joinChunks(chunks, strict);
}

export async function readManPageContentField(
  ctx: DbCtx,
  content: Doc<"manPageContents">,
  kind: ContentJsonKind,
  strict = false,
): Promise<string | null> {
  const inline = content[kind];
  if (typeof inline === "string") return inline;

  const query = ctx.db
    .query("manPageContentChunks")
    .withIndex("by_contentId_and_kind_and_chunkIndex", (q) =>
      q.eq("contentId", content._id).eq("kind", kind),
    );
  const chunks = await query.take(201);
  return joinChunks(chunks, strict);
}

export async function readAllContentBlobFields(
  ctx: DbCtx,
  blob: Doc<"manPageContentBlobs">,
  strict = false,
): Promise<StoredContentFields> {
  const entries = await Promise.all(
    CONTENT_KINDS.map(async (kind) => [kind, await readContentBlobField(ctx, blob, kind, strict)] as const),
  );
  return Object.fromEntries(entries) as StoredContentFields;
}

export async function readAllManPageContentFields(
  ctx: DbCtx,
  content: Doc<"manPageContents">,
  strict = false,
): Promise<StoredContentFields> {
  const entries = await Promise.all(
    CONTENT_KINDS.map(
      async (kind) => [kind, await readManPageContentField(ctx, content, kind, strict)] as const,
    ),
  );
  return Object.fromEntries(entries) as StoredContentFields;
}

export async function readManPageContentFieldList(
  ctx: DbCtx,
  content: Doc<"manPageContents">,
): Promise<ContentField[]> {
  const fields = await readAllManPageContentFields(ctx, content, true);
  return CONTENT_KINDS.map((kind) => ({
    kind,
    value: fields[kind] ?? undefined,
  }));
}

export function contentFieldsChars(
  fields: StoredContentFields | ContentField[],
): number {
  if (Array.isArray(fields)) {
    return fields.reduce((total, field) => total + (field.value?.length ?? 0), 0);
  }
  return CONTENT_KINDS.reduce((total, kind) => total + (fields[kind]?.length ?? 0), 0);
}
