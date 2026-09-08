/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { serializeStoredPayload } from "./_storedPayload";

const modules = import.meta.glob("./**/*.ts");
const fields = { docJson: '{"text":"original"}', synopsisJson: '["usage"]' };
type Target = "blobs" | "contents";
type State = "draft" | "sealed" | "pruning" | "staging" | "prod";

async function seed(target: Target, state: State = "draft") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const makePage = async (name: string, state: State) => {
      const releaseId = await ctx.db.insert("datasetReleases", {
        datasetReleaseId: name, locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
        ingestedAt: "2026-09-07T00:00:00Z", pageCount: 1,
        ...(state === "sealed" ? { sealed: true } : {}),
        ...(state === "pruning" ? { pruning: true } : {}),
      });
      if (state === "staging" || state === "prod") {
        await ctx.db.insert("activeReleases", {
          stage: state, locale: "en", distro: "debian", releaseId, datasetReleaseId: name,
          activatedAt: "2026-09-07T00:00:00Z",
        });
      }
      const pageId = await ctx.db.insert("manPages", {
        releaseId, datasetReleaseId: name, externalId: name, locale: "en", distro: "debian",
        name, section: "1", sitemapPage: 0, title: name, description: "description", sourcePath: `${name}.1`,
        contentSha256: "source-hash", hasParseWarnings: false,
      });
      return { releaseId, pageId };
    };
    const { releaseId, pageId } = await makePage("source", target === "blobs" ? "draft" : state);
    const blobId = target === "blobs" ? await ctx.db.insert("manPageContentBlobs", {
      contentSha256: "source-hash", synopsisJson: fields.synopsisJson,
    }) : null;
    const contentId = await ctx.db.insert("manPageContents", {
      pageId, contentSha256: "source-hash",
      ...(blobId ? { blobId } : { synopsisJson: fields.synopsisJson }),
    });
    if (blobId) {
      await ctx.db.insert("manPageContentBlobChunks", {
        blobId, contentSha256: "source-hash", kind: "docJson", chunkIndex: 0, chunk: fields.docJson,
      });
      // A mutable first owner must not hide a second protected shared owner.
      const shared = await makePage("shared", state);
      await ctx.db.insert("manPageContents", { pageId: shared.pageId, blobId });
    } else {
      await ctx.db.insert("manPageContentChunks", {
        contentId, pageId, kind: "docJson", chunkIndex: 0, chunk: fields.docJson,
      });
    }
    return { releaseId, pageId, blobId, contentId };
  });
  const sourceId = ids.blobId ?? ids.contentId;
  const store = (payload = serializeStoredPayload("source-hash", fields)) =>
    t.run((ctx) => ctx.storage.store(new Blob([payload], { type: "application/json" })));
  const mark = (storageId: Id<"_storage">) => ids.blobId
    ? t.mutation(internal.content.markContentBlobStored, { blobId: ids.blobId, contentSha256: "source-hash", storageId })
    : t.mutation(internal.content.markPageContentStored, { contentId: ids.contentId, storageId });
  const snapshot = () => t.run(async (ctx) => ({
    source: await ctx.db.get(sourceId),
    chunks: ids.blobId
      ? await ctx.db.query("manPageContentBlobChunks")
        .withIndex("by_blobId_and_kind_and_chunkIndex", (q) => q.eq("blobId", ids.blobId!)).take(10)
      : await ctx.db.query("manPageContentChunks")
        .withIndex("by_contentId_and_kind_and_chunkIndex", (q) => q.eq("contentId", ids.contentId)).take(10),
  }));
  return { t, ...ids, sourceId, store, mark, snapshot };
}

describe.each(["blobs", "contents"] as const)("%s storage migration integrity", (target) => {
  it.each(["sealed", "pruning", "staging", "prod"] as const)("rejects migration for a %s owner without deleting content", async (state) => {
    const fixture = await seed(target, state);
    const before = await fixture.snapshot();
    const storageId = await fixture.store();
    await expect(fixture.mark(storageId)).rejects.toThrow(state === "pruning" ? "RELEASE_PRUNING" : "RELEASE_SEALED");
    expect(await fixture.snapshot()).toEqual(before);
  });

  it("accepts exact canonical bytes for drafts and only then removes legacy fields and chunks", async () => {
    const fixture = await seed(target);
    const storageId = await fixture.store();
    expect(await fixture.mark(storageId)).toEqual({ deletedChunks: 1 });
    const after = await fixture.snapshot();
    expect(after.chunks).toEqual([]);
    expect(after.source).toMatchObject({ storageId });
    expect(after.source).not.toHaveProperty("synopsisJson");
    expect(after.source).not.toHaveProperty("docJson");
    expect(await fixture.t.run(async (ctx) => (await ctx.storage.get(storageId))?.text()))
      .toBe(serializeStoredPayload("source-hash", fields));
  });

  it("rejects a same-size forged payload despite an unchanged source hash", async () => {
    const fixture = await seed(target);
    const before = await fixture.snapshot();
    const forged = serializeStoredPayload("source-hash", { ...fields, docJson: '{"text":"tampered"}' });
    expect(forged.length).toBe(serializeStoredPayload("source-hash", fields).length);
    await expect(fixture.mark(await fixture.store(forged))).rejects.toThrow("CONTENT_STORAGE_PAYLOAD_MISMATCH");
    expect(await fixture.snapshot()).toEqual(before);
  });

  it("rejects an upload made before the legacy source changed", async () => {
    const fixture = await seed(target);
    const storageId = await fixture.store();
    await fixture.t.run((ctx) => ctx.db.patch(fixture.sourceId, { synopsisJson: '["changed"]' }));
    const current = await fixture.snapshot();
    await expect(fixture.mark(storageId)).rejects.toThrow("CONTENT_STORAGE_PAYLOAD_MISMATCH");
    expect(await fixture.snapshot()).toEqual(current);
  });

  it("cannot overwrite an already-stored pointer", async () => {
    const fixture = await seed(target);
    const first = await fixture.store();
    await fixture.mark(first);
    const before = await fixture.snapshot();
    await expect(fixture.mark(await fixture.store())).rejects.toThrow("CONTENT_ALREADY_STORED");
    expect(await fixture.snapshot()).toEqual(before);
  });

  it("cleans a rejected action's upload while retaining all existing storage and source content", async () => {
    const fixture = await seed(target, "sealed");
    const existing = await fixture.store("existing file unrelated to the migration");
    const before = await fixture.snapshot();
    await expect(fixture.t.action(internal.content.migrateContentToStorageBatch, {
      target, cursor: null, limit: 1,
    })).rejects.toThrow("RELEASE_SEALED");
    const files = await fixture.t.run((ctx) => ctx.db.system.query("_storage").take(10));
    expect(files.map((file) => file._id)).toEqual([existing]);
    expect(await fixture.snapshot()).toEqual(before);
  });

  it("keeps dry-run migration read-only for sealed owners", async () => {
    const fixture = await seed(target, "sealed");
    const before = await fixture.snapshot();
    expect(await fixture.t.action(internal.content.migrateContentToStorageBatch, {
      target, cursor: null, limit: 1, dryRun: true,
    })).toMatchObject({ dryRun: true, candidates: 1, stored: 0, deletedChunks: 0 });
    expect(await fixture.snapshot()).toEqual(before);
    expect(await fixture.t.run((ctx) => ctx.db.system.query("_storage").take(1))).toEqual([]);
  });

  it.each(["gap", "duplicate", "oversized"] as const)("rejects %s chunks before replacing or deleting legacy content", async (shape) => {
    const fixture = await seed(target);
    await fixture.t.run(async (ctx) => {
      if (fixture.blobId) {
        const first = await ctx.db.query("manPageContentBlobChunks")
          .withIndex("by_blobId_and_kind_and_chunkIndex", (q) => q.eq("blobId", fixture.blobId!)).first();
        if (!first) throw new Error("Fixture chunk missing");
        if (shape === "gap") await ctx.db.patch(first._id, { chunkIndex: 1 });
        else {
          for (let index = 0; index < (shape === "duplicate" ? 1 : 200); index += 1) {
            await ctx.db.insert("manPageContentBlobChunks", {
              blobId: fixture.blobId, contentSha256: "source-hash", kind: "docJson",
              chunkIndex: shape === "duplicate" ? 0 : index + 1, chunk: "part",
            });
          }
        }
      } else {
        const first = await ctx.db.query("manPageContentChunks")
          .withIndex("by_contentId_and_kind_and_chunkIndex", (q) => q.eq("contentId", fixture.contentId)).first();
        if (!first) throw new Error("Fixture chunk missing");
        if (shape === "gap") await ctx.db.patch(first._id, { chunkIndex: 1 });
        else {
          for (let index = 0; index < (shape === "duplicate" ? 1 : 200); index += 1) {
            await ctx.db.insert("manPageContentChunks", {
              contentId: fixture.contentId, pageId: fixture.pageId, kind: "docJson",
              chunkIndex: shape === "duplicate" ? 0 : index + 1, chunk: "part",
            });
          }
        }
      }
    });
    const before = await fixture.snapshot();
    const storageId = await fixture.store();
    await expect(fixture.mark(storageId)).rejects.toThrow("CONTENT_CHUNKS_INVALID_OR_OVERSIZED");
    await expect(fixture.t.action(internal.content.migrateContentToStorageBatch, {
      target, cursor: null, limit: 1,
    })).rejects.toThrow("CONTENT_CHUNKS_INVALID_OR_OVERSIZED");
    expect(await fixture.snapshot()).toEqual(before);
    const chunks = await fixture.t.run(async (ctx) => fixture.blobId
      ? await ctx.db.query("manPageContentBlobChunks")
        .withIndex("by_blobId_and_kind_and_chunkIndex", (q) => q.eq("blobId", fixture.blobId!)).take(202)
      : await ctx.db.query("manPageContentChunks")
        .withIndex("by_contentId_and_kind_and_chunkIndex", (q) => q.eq("contentId", fixture.contentId)).take(202));
    expect(chunks).toHaveLength(shape === "gap" ? 1 : shape === "duplicate" ? 2 : 201);
    expect((await fixture.t.run((ctx) => ctx.db.system.query("_storage").take(10))).map((file) => file._id))
      .toEqual([storageId]);
  });
});

it("fails closed when a shared blob has more than 100 mutable references", async () => {
  const fixture = await seed("blobs");
  const blobId = fixture.blobId;
  if (!blobId) throw new Error("Fixture blob missing");
  await fixture.t.run(async (ctx) => {
    // seed already created two distinct owners; bring the total to 101.
    for (let index = 0; index < 99; index += 1) {
      const name = `extra-${index}`;
      const pageId = await ctx.db.insert("manPages", {
        releaseId: fixture.releaseId, datasetReleaseId: "source", externalId: name,
        locale: "en", distro: "debian", name, section: "1", sitemapPage: 0,
        title: name, description: "description", sourcePath: `${name}.1`,
        contentSha256: "source-hash", hasParseWarnings: false,
      });
      await ctx.db.insert("manPageContents", { pageId, blobId });
    }
  });
  const before = await fixture.snapshot();
  const storageId = await fixture.store();
  await expect(fixture.mark(storageId)).rejects.toThrow("CONTENT_REFERENCE_LIMIT");
  await expect(fixture.t.action(internal.content.migrateContentToStorageBatch, {
    target: "blobs", cursor: null, limit: 1,
  })).rejects.toThrow("CONTENT_REFERENCE_LIMIT");
  expect(await fixture.snapshot()).toEqual(before);
  expect(await fixture.t.run((ctx) => ctx.db.query("manPageContents")
    .withIndex("by_blobId", (q) => q.eq("blobId", blobId)).take(102))).toHaveLength(101);
  expect((await fixture.t.run((ctx) => ctx.db.system.query("_storage").take(10))).map((file) => file._id))
    .toEqual([storageId]);
});
