import { expect, it } from "vitest";
import { CONTENT_FIELD_UTF8_BYTES, contentChunks, splitContentFields } from "./_legacyContent";

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

it("bounds chunks by UTF-8 size and never splits a surrogate pair", () => {
  // Astral characters cross every chunk boundary; a code-unit slice would orphan surrogates.
  const value = "a".repeat(CONTENT_FIELD_UTF8_BYTES - 1) + "🧪".repeat(1000);
  const chunks = contentChunks(value);
  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    expect(utf8Bytes(chunk)).toBeLessThanOrEqual(CONTENT_FIELD_UTF8_BYTES);
    expect(() => encodeURIComponent(chunk)).not.toThrow(); // throws on a lone surrogate
  }
  expect(chunks.join("")).toBe(value);

  const cjk = "漢".repeat(200_000);
  expect(contentChunks(cjk).every((chunk) => utf8Bytes(chunk) <= CONTENT_FIELD_UTF8_BYTES)).toBe(true);
  expect(contentChunks(cjk).join("")).toBe(cjk);
});

it("keeps a field inline only while its UTF-8 size fits the budget", () => {
  const ascii = "a".repeat(CONTENT_FIELD_UTF8_BYTES);
  const cjk = "漢".repeat(CONTENT_FIELD_UTF8_BYTES / 3 + 1);
  const result = splitContentFields([
    { kind: "docJson", value: ascii },
    { kind: "synopsisJson", value: cjk },
    { kind: "optionsJson", value: undefined },
  ]);
  expect(result.inlinePayload).toEqual({ docJson: ascii });
  expect(result.chunkedFields).toEqual([{ kind: "synopsisJson", value: cjk }]);
});
