import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { serializeStoredPayload, storedPayloadDigest } from "./_storedPayload";

const http = httpRouter();

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function unauthorized(): Response {
  return jsonResponse({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
}

// Compare two secrets without leaking their contents through timing. Both
// sides are hashed first so the comparison always runs over a fixed 32 bytes
// and reveals nothing about the length or prefix of the configured secret.
async function secretsMatch(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);

  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);

  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

async function requireIngestSecret(req: Request): Promise<Response | null> {
  const configured = process.env.CONVEX_INGEST_SECRET?.trim();
  if (!configured) {
    return jsonResponse(
      { error: { code: "INGEST_SECRET_NOT_CONFIGURED", message: "Ingest secret not configured" } },
      503,
    );
  }

  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !(await secretsMatch(token, configured))) return unauthorized();
  return null;
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function jsonField(value: unknown): string | undefined {
  if (value === null || typeof value === "undefined") return undefined;
  return JSON.stringify(value);
}

http.route({
  path: "/ingest/release",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    const body = await readJson(req);
    const result = await ctx.runMutation(internal.ingest.createRelease, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/pages",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    const body = await readJson(req);
    const result = await ctx.runMutation(internal.ingest.insertPages, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/pages/storage",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    const body = await readJson(req);
    const payload = body as { datasetReleaseId: string; pages: Array<Record<string, unknown>> };
    if (!payload || !Array.isArray(payload.pages)) {
      return jsonResponse(
        { error: { code: "INVALID_INGEST_PAYLOAD", message: "pages must be an array" } },
        400,
      );
    }

    // Validate the entire batch before allocating files, including late entries.
    if (payload.pages.some((page) => !page || typeof page !== "object" ||
      typeof page.contentSha256 !== "string" || !page.contentSha256 || page.doc == null)) {
      return jsonResponse(
        { error: { code: "INVALID_INGEST_PAYLOAD", message: "page.contentSha256 and page.doc are required" } }, 400,
      );
    }
    const prepared = await Promise.all(payload.pages.map(async (page) => {
      const text = serializeStoredPayload(page.contentSha256 as string, {
        docJson: JSON.stringify(page.doc), synopsisJson: jsonField(page.synopsis),
        optionsJson: jsonField(page.options), seeAlsoJson: jsonField(page.seeAlso),
      });
      return { page, text, digest: await storedPayloadDigest(text) };
    }));
    const existing = await ctx.runQuery(internal.ingest.listContentBlobStorageByDigest, {
      contentDigests: prepared.map((item) => item.digest),
    });
    const storageByDigest = new Map<string, Id<"_storage">>();
    for (const item of existing) {
      if (item.storageId) storageByDigest.set(item.contentDigest, item.storageId);
    }

    const pages = [];
    const createdStorageIds: Id<"_storage">[] = [];
    let storedContentFiles = 0;
    let reusedContentFiles = 0;
    let result;
    try {
      for (const { page, text, digest } of prepared) {
        let contentStorageId = storageByDigest.get(digest);
        if (!contentStorageId) {
          contentStorageId = await ctx.storage.store(new Blob([text], { type: "application/json" }));
          createdStorageIds.push(contentStorageId);
          storageByDigest.set(digest, contentStorageId);
          storedContentFiles += 1;
        } else {
          reusedContentFiles += 1;
        }

        const { doc, synopsis, options, seeAlso, ...metadata } = page;
        void doc;
        void synopsis;
        void options;
        void seeAlso;
        pages.push({ ...metadata, contentStorageId });
      }

      result = await ctx.runMutation(internal.ingest.insertStoredPages, {
        datasetReleaseId: payload.datasetReleaseId,
        pages,
      } as never);
    } catch (error) {
      // A seal may commit while this action uploads blobs. The mutation rejects
      // that late batch atomically; remove only files created by this request.
      await Promise.all(createdStorageIds.map((id) => ctx.storage.delete(id)));
      throw error;
    }
    // Never delete a reused file, or run failure cleanup after a committed write.
    const unused = new Set(result.unusedStorageIds);
    await Promise.all(createdStorageIds.filter((id) => unused.has(id)).map((id) => ctx.storage.delete(id)));
    return jsonResponse({ ...result, storedContentFiles, reusedContentFiles });
  }),
});

http.route({
  path: "/ingest/aliases",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    const body = await readJson(req);
    const result = await ctx.runMutation(internal.ingest.insertAliases, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/licenses",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    const body = await readJson(req);
    const result = await ctx.runMutation(internal.ingest.insertLicenses, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/activate",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    const body = await readJson(req);
    const result = await ctx.runMutation(internal.ingest.activateRelease, body as never);
    return jsonResponse(result, result.pending ? 409 : 200);
  }),
});

http.route({
  path: "/ingest/promote",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    const body = await readJson(req);
    const result = await ctx.runMutation(internal.ingest.promoteActiveReleases, body as never);
    return jsonResponse(result);
  }),
});

export default http;
