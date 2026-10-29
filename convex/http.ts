import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ingestClientError } from "./_ingestErrors";
import { serializeStoredPayload, storedPayloadDigest } from "./_storedPayload";
import { optionFlagRows } from "./_optionFlags";
import { MANIFEST_CONTENT_TYPE } from "./_manifestStorage";
import { INGEST_CONTRACT } from "./ingestContract";
import { canonicalJson } from "./ingest";
import { secretsMatch } from "./lib";

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

function ingestAction(handler: (ctx: ActionCtx, body: unknown) => Promise<Response>) {
  return httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } }, 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonResponse({ error: { code: "INVALID_INGEST_PAYLOAD", message: "Request body must be a JSON object" } }, 400);
    }
    try {
      return await handler(ctx, body);
    } catch (error) {
      const known = ingestClientError(error);
      if (!known) throw error;
      return jsonResponse({ error: { code: known.code, message: known.message } }, known.status);
    }
  });
}

function jsonField(value: unknown): string | undefined {
  if (value === null || typeof value === "undefined") return undefined;
  return JSON.stringify(value);
}

http.route({
  path: "/ingest/contract",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    return jsonResponse(INGEST_CONTRACT);
  }),
});

http.route({
  path: "/ingest/release",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const { packageManifest, ...metadata } = body as Record<string, unknown>;
    // JSON is a storage blob, so a 17k-package manifest never crosses the
    // document or Convex array-value limits or burdens a page-view read.
    const text = canonicalJson(packageManifest ?? null);
    const storageId = await ctx.storage.store(new Blob([text], { type: MANIFEST_CONTENT_TYPE }));
    try {
      const result = await ctx.runMutation(internal.ingest.createRelease, {
        ...metadata, packageManifestStorageId: storageId, packageManifestDigest: await storedPayloadDigest(text),
      } as never);
      if (result.existed) await ctx.storage.delete(storageId);
      return jsonResponse(result);
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
  }),
});

http.route({
  path: "/ingest/license-packages",
  method: "POST",
  handler: ingestAction(async (ctx, body) => jsonResponse(
    await ctx.runMutation(internal.ingest.insertLicensePackages, body as never),
  )),
});

http.route({
  path: "/ingest/pages",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.insertPages, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/pages/storage",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
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
        void seeAlso;
        // The option index is derived here from the parsed OPTIONS that only
        // the stored payload keeps; ingestion sends nothing extra.
        pages.push({ ...metadata, contentStorageId, optionFlags: optionFlagRows(options) });
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
  handler: ingestAction(async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.insertAliases, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/licenses",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.insertLicenses, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/activate",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.activateRelease, body as never);
    return jsonResponse(result, result.pending ? 409 : 200);
  }),
});

http.route({
  path: "/ingest/promote",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.promoteActiveReleases, body as never);
    return jsonResponse(result);
  }),
});

export default http;
