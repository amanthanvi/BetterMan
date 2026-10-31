import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ingestClientError } from "./_ingestErrors";
import { serializeStoredPayload, storedPayloadDigest } from "./_storedPayload";
import { packOptionSignature } from "./_derivedInputs";
import { optionFlagRows } from "./_optionFlags";
import { LICENSE_CONTENT_TYPE, MANIFEST_CONTENT_TYPE } from "./_manifestStorage";
import { INGEST_CONTRACT, INGEST_CONTRACT_HEADER } from "./ingestContract";
import { canonicalJson } from "./ingest";
import { releaseAcquisition } from "./_releaseManifest";
import { GENERATED_CONTRACT, GENERATED_LIMITS, generationDoc } from "./_generatedLayer";
import { resolveContent } from "./content";
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

function ingestAction(handler: (ctx: ActionCtx, body: unknown) => Promise<Response>, requireContract = true) {
  return httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    // Every release-contract request names the exact contract it was written
    // for, so an older or newer client (or workflow) stops before any read or
    // write, the way the client stops on an older or newer deployment. A shared
    // feature subset is not enough: two contracts may name the same fields.
    if (requireContract && req.headers.get(INGEST_CONTRACT_HEADER) !== String(INGEST_CONTRACT.schemaVersion)) {
      return jsonResponse({ error: { code: "INGEST_CONTRACT_MISMATCH", message: `This deployment serves ingest contract v${INGEST_CONTRACT.schemaVersion}; use the matching workflow/client and deploy Convex first.` } }, 409);
    }
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
    const acquisition = releaseAcquisition(packageManifest);
    // JSON is a storage blob, so a 17k-package manifest never crosses the
    // document or Convex array-value limits or burdens a page-view read.
    const text = canonicalJson(packageManifest ?? null);
    const storageId = await ctx.storage.store(new Blob([text], { type: MANIFEST_CONTENT_TYPE }));
    try {
      const result = await ctx.runMutation(internal.ingest.createRelease, {
        ...metadata, acquisition, packageManifestStorageId: storageId, packageManifestDigest: await storedPayloadDigest(text),
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
        pages.push({ ...metadata, contentStorageId, optionFlags: optionFlagRows(options), optionsSignature: packOptionSignature(options) });
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
    const input = body as { datasetReleaseId: string; licenses: Array<Record<string, unknown>> };
    if (!input || !Array.isArray(input.licenses) || input.licenses.length > 100) throw new Error("INVALID_INGEST_PAYLOAD");
    const created: Array<Id<"_storage">> = [];
    let committed = false;
    try {
      const licenses = [];
      for (const license of input.licenses) {
        if (!license || typeof license !== "object" || "storageId" in license ||
            typeof license.packageName !== "string" || typeof license.licenseId !== "string" ||
            typeof license.licenseName !== "string" || typeof license.licenseText !== "string") throw new Error("INVALID_INGEST_PAYLOAD");
        if (!license.licenseText.trim()) throw new Error("EMPTY_LICENSE_TEXT");
        const bytes = new TextEncoder().encode(license.licenseText).length;
        if (bytes > 7 * 1024 * 1024) throw new Error("INVALID_INGEST_PAYLOAD");
        if (bytes <= 512 * 1024) { licenses.push(license); continue; }
        const text = JSON.stringify({ package: license.packageName.trim().toLowerCase(),
          licenseId: license.licenseId, licenseName: license.licenseName, text: license.licenseText });
        const storageId = await ctx.storage.store(new Blob([text], { type: LICENSE_CONTENT_TYPE }));
        created.push(storageId);
        licenses.push({ ...license, licenseText: "", storageId });
      }
      const { unusedStorageIds = [], ...result } = await ctx.runMutation(internal.ingest.insertLicenses,
        { ...input, licenses } as never);
      committed = true;
      await Promise.all(unusedStorageIds.map(id => ctx.storage.delete(id)));
      return jsonResponse(result);
    } catch (error) {
      if (!committed) await Promise.all(created.map(id => ctx.storage.delete(id)));
      throw error;
    }
  }),
});

http.route({
  path: "/ingest/activate",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    // Full archive production authorization belongs to the gated promote path.
    const result = await ctx.runMutation(internal.ingest.activateRelease, { ...body as object, allowFullDebian: false, allowFullUbuntu: false, allowFullFedora: false, allowFullArch: false, allowFullAlpine: false, allowTranslations: false } as never);
    return jsonResponse(result, result.pending ? 409 : 200);
  }),
});

http.route({
  path: "/ingest/promotion-source",
  method: "POST",
  handler: ingestAction(async (ctx, body) => jsonResponse(
    await ctx.runQuery(internal.ingest.getPromotionSource, body as never),
  )),
});

http.route({
  path: "/ingest/promote",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.promoteActiveReleases, body as never);
    return jsonResponse(result);
  }),
});

// Generated layer (B6). Separate from the release contract above: records are
// keyed by content hash and written after a release exists.
http.route({
  path: "/ingest/generated/contract",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    return jsonResponse(GENERATED_CONTRACT);
  }),
});

http.route({
  path: "/ingest/generated/candidates",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const result = await ctx.runQuery(internal.generated.listCandidates, body as never);
    return jsonResponse(result);
  }, false),
});

function parsedField(value: string | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

http.route({
  path: "/ingest/generated/inputs",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const pointers = await ctx.runQuery(internal.generated.inputPointers, body as never);
    const encoder = new TextEncoder();
    const utf8 = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
    const pages: unknown[] = [];
    const deferred: Array<{ name: string; section: string }> = [];
    const skipped: Array<{ name: string; section: string; reason: string; bytes: number }> = [];
    // The envelope with every page deferred or skipped, so the final response
    // stays within the limit whatever happens to the rest.
    const envelope = utf8({
      pages: [],
      deferred: pointers.map(({ name, section }) => ({ name, section })),
      skipped: pointers.map(({ name, section }) => ({ name, section, reason: "input too large", bytes: Number.MAX_SAFE_INTEGER })),
    });
    let bytes = envelope;
    for (const { pointer, ...page } of pointers) {
      if (pages.length && bytes >= GENERATED_LIMITS.inputResponseBytes) {
        deferred.push({ name: page.name, section: page.section });
        continue;
      }
      const content = await resolveContent(ctx, pointer);
      if (!content) continue;
      const input = {
        ...page,
        doc: generationDoc(parsedField(content.docJson)),
        synopsis: parsedField(content.synopsisJson),
        options: parsedField(content.optionsJson),
      };
      // Measure the UTF-8 bytes this page adds, comma included, before adding it.
      const size = utf8(input) + 1;
      if (envelope + size > GENERATED_LIMITS.inputResponseBytes) {
        skipped.push({ name: page.name, section: page.section, reason: "input too large", bytes: size });
      } else if (bytes + size > GENERATED_LIMITS.inputResponseBytes) {
        deferred.push({ name: page.name, section: page.section });
      } else {
        bytes += size;
        pages.push(input);
      }
    }
    return jsonResponse({ pages, deferred, skipped });
  }, false),
});

http.route({
  path: "/ingest/generated/flag-usage",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const result = await ctx.runMutation(internal.generated.propagateFlagUsage, body as never);
    return jsonResponse(result);
  }, false),
});

http.route({
  path: "/ingest/generated",
  method: "POST",
  handler: ingestAction(async (ctx, body) => {
    const { records } = body as { records?: unknown };
    const result = await ctx.runMutation(internal.generated.upsertRecords, {
      records,
      updatedAt: new Date().toISOString(),
    } as never);
    return jsonResponse(result);
  }, false),
});

export default http;
