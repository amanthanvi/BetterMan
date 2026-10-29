/** Limits include UTF-8 JSON syntax, source text, diagnostics and metadata. */
export const EXPLAIN_OUTPUT_LIMITS = { decodedTokens: 256, bytes: 64 * 1024 } as const;
export const TRUNCATED_DIAGNOSTIC = 'Explanation truncated: output limit reached';
const encoder = new TextEncoder();
export const explanationBytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
