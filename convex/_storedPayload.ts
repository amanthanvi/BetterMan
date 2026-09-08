import type { ManPageContentPayload } from "./lib";

// Keep field order and omitted values stable across ingestion and migration.
export function serializeStoredPayload(contentSha256: string | null, fields: ManPageContentPayload): string {
  return JSON.stringify({ contentSha256, content: {
    docJson: fields.docJson,
    synopsisJson: fields.synopsisJson,
    optionsJson: fields.optionsJson,
    seeAlsoJson: fields.seeAlsoJson,
  } });
}

export async function storedPayloadDigest(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}
