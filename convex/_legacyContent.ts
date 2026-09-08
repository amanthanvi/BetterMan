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

type DbCtx = QueryCtx | MutationCtx;

function joinChunks(chunks: Array<{ chunkIndex: number; chunk: string }>, strict: boolean): string | null {
  if (!chunks.length) return null;
  if (strict && (chunks.length > 200 || chunks.some((chunk, index) => chunk.chunkIndex !== index))) {
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
  const chunks = strict ? await query.take(201) : await query.collect();
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
  const chunks = strict ? await query.take(201) : await query.collect();
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
