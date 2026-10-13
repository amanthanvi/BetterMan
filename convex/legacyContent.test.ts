/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { CONTENT_CHUNK_CHARS, MAX_CONTENT_FIELD_CHARS, contentChunks, readContentBlobField, splitContentFields, validateContentFieldSize } from "./_legacyContent";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

it("preserves the distinct ingest and maintenance inline thresholds", () => {
  for (const length of [400_000, 400_001, 500_000, 500_001]) {
    const value = "a".repeat(length);
    for (const threshold of [400_000, 500_000]) {
      const result = splitContentFields([{ kind: "docJson", value }], threshold);
      expect(result.inlinePayload.docJson).toBe(length <= threshold ? value : undefined);
      expect(result.chunkedFields.length).toBe(length > threshold ? 1 : 0);
    }
    expect(contentChunks(value).join("")).toBe(value);
    expect(contentChunks(value).every((chunk) => chunk.length <= CONTENT_CHUNK_CHARS)).toBe(true);
  }
});

it("caps serialized ingest fields at exactly twenty chunks", async () => {
  expect(() => validateContentFieldSize("a".repeat(MAX_CONTENT_FIELD_CHARS), "docJson")).not.toThrow();
  const t = convexTest(schema, modules);
  await t.mutation(internal.ingest.createRelease, {
    datasetReleaseId: "oversized", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-09-07T00:00:00Z", packageManifest: null, pageCount: 1, aliasCount: 0, licenseCount: 0,
    sectionTotals: [{ section: "1", total: 1 }], licensePackages: [],
  });
  await expect(t.mutation(internal.ingest.insertPages, {
    datasetReleaseId: "oversized", pages: [{
      externalId: "page", name: "page", section: "1", sitemapPage: 0, title: "page", description: "page",
      sourcePath: "page.1", sourcePackage: null, sourcePackageVersion: null, contentSha256: "page",
      hasParseWarnings: false, doc: "a".repeat(MAX_CONTENT_FIELD_CHARS), synopsis: null, options: null,
      seeAlso: null, searchText: "page", snippetText: "page", links: [],
    }],
  })).rejects.toThrow("CONTENT_FIELD_TOO_LARGE: docJson");
  expect(await t.run((ctx) => ctx.db.query("manPages").take(1))).toEqual([]);
});

describe.each([false, true])("legacy chunk reads (strict=%s)", (strict) => {
  it("accepts 200 chunks and rejects the 201st", async () => {
    const t = convexTest(schema, modules);
    const blobId = await t.run(async (ctx) => {
      const blobId = await ctx.db.insert("manPageContentBlobs", { contentSha256: "hash" });
      for (let chunkIndex = 0; chunkIndex < 200; chunkIndex++) {
        await ctx.db.insert("manPageContentBlobChunks", { blobId, contentSha256: "hash", kind: "docJson", chunkIndex, chunk: "a" });
      }
      return blobId;
    });
    const read = () => t.run(async (ctx) => {
      const blob = await ctx.db.get(blobId);
      return readContentBlobField(ctx, blob!, "docJson", strict);
    });
    expect(await read()).toBe("a".repeat(200));
    await t.run((ctx) => ctx.db.insert("manPageContentBlobChunks", { blobId, contentSha256: "hash", kind: "docJson", chunkIndex: 200, chunk: "a" }));
    await expect(read()).rejects.toThrow("field exceeds 200 chunks");
  });
});
