import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { serializeStoredPayload, storedPayloadDigest } from "./_storedPayload";
import { validateContentFieldSize } from "./_legacyContent";
import { deriveOptionsSearchText } from "./_optionsSearch";

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

function invalidPayload(message: string): Response {
  return jsonResponse({ error: { code: "INVALID_INGEST_PAYLOAD", message } }, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type PayloadShape = {
  strings: readonly string[];
  numbers?: readonly string[];
  records?: readonly string[];
  stringArrays?: readonly string[];
};

// Catch cheap transport mistakes before casting. The mutation validators remain
// authoritative for individual fields inside each batch entry.
function matchesShape(body: Record<string, unknown>, shape: PayloadShape): boolean {
  return shape.strings.every((key) => typeof body[key] === "string" && (body[key] as string).trim().length > 0) &&
    (shape.numbers ?? []).every((key) => typeof body[key] === "number" && Number.isFinite(body[key])) &&
    (shape.records ?? []).every((key) => Array.isArray(body[key]) && body[key].every(isRecord)) &&
    (shape.stringArrays ?? []).every((key) => Array.isArray(body[key]) && body[key].every((value) => typeof value === "string"));
}

function ingestAction(
  shape: PayloadShape,
  handler: (ctx: ActionCtx, body: Record<string, unknown>) => Promise<Response>,
) {
  return httpAction(async (ctx, req) => {
    const auth = await requireIngestSecret(req);
    if (auth) return auth;
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "INVALID_JSON") throw error;
      return jsonResponse({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } }, 400);
    }
    if (!isRecord(body) || !matchesShape(body, shape)) {
      return invalidPayload("Request body has an invalid ingest payload shape");
    }
    try {
      return await handler(ctx, body);
    } catch (error) {
      // Nested argument validation failures from the mutation validators are
      // client errors: a 500 would make the ingest client retry a request that
      // can never succeed. Domain errors (RELEASE_NOT_FOUND, DUPLICATE_…)
      // keep their existing status mapping.
      if (error instanceof Error && /validat/i.test(error.message)) {
        return invalidPayload(error.message);
      }
      throw error;
    }
  });
}

function jsonField(value: unknown): string | undefined {
  if (value === null || typeof value === "undefined") return undefined;
  return JSON.stringify(value);
}

http.route({
  path: "/ingest/release",
  method: "POST",
  handler: ingestAction({
    strings: ["datasetReleaseId", "locale", "distro", "imageRef", "imageDigest", "ingestedAt"],
    numbers: ["pageCount", "aliasCount", "licenseCount"], records: ["sectionTotals", "licensePackages"],
  }, async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.createRelease, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/pages",
  method: "POST",
  handler: ingestAction({ strings: ["datasetReleaseId"], records: ["pages"] }, async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.insertPages, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/pages/storage",
  method: "POST",
  handler: ingestAction({ strings: ["datasetReleaseId"], records: ["pages"] }, async (ctx, body) => {
    const payload = body as { datasetReleaseId: string; pages: Array<Record<string, unknown>> };

    // Validate the entire batch before allocating files, including late entries.
    if (payload.pages.some((page) => !page || typeof page !== "object" ||
      typeof page.contentSha256 !== "string" || !page.contentSha256 || page.doc == null)) {
      return jsonResponse(
        { error: { code: "INVALID_INGEST_PAYLOAD", message: "page.contentSha256 and page.doc are required" } }, 400,
      );
    }
    let prepared;
    try {
      prepared = await Promise.all(payload.pages.map(async (page) => {
        const fields = {
          docJson: JSON.stringify(page.doc), synopsisJson: jsonField(page.synopsis),
          optionsJson: jsonField(page.options), seeAlsoJson: jsonField(page.seeAlso),
        };
        for (const [kind, value] of Object.entries(fields)) {
          if (value !== undefined) validateContentFieldSize(value, kind);
        }
        const text = serializeStoredPayload(page.contentSha256 as string, fields);
        // Override incoming metadata while trusted parsed options are available.
        const derivedPage: Record<string, unknown> = { ...page, optionsText: deriveOptionsSearchText(page.options) };
        return { page: derivedPage, text, digest: await storedPayloadDigest(text) };
      }));
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("CONTENT_FIELD_TOO_LARGE")) throw error;
      return invalidPayload(error.message);
    }
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
  handler: ingestAction({ strings: ["datasetReleaseId"], records: ["aliases"] }, async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.insertAliases, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/licenses",
  method: "POST",
  handler: ingestAction({ strings: ["datasetReleaseId"], records: ["licenses"] }, async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.insertLicenses, body as never);
    return jsonResponse(result);
  }),
});

http.route({
  path: "/ingest/activate",
  method: "POST",
  handler: ingestAction({ strings: ["datasetReleaseId", "stage", "activatedAt"] }, async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.activateRelease, body as never);
    return jsonResponse(result, result.pending ? 409 : 200);
  }),
});

http.route({
  path: "/ingest/promote",
  method: "POST",
  handler: ingestAction({ strings: ["fromStage", "toStage", "activatedAt"], stringArrays: ["distros"] }, async (ctx, body) => {
    const result = await ctx.runMutation(internal.ingest.promoteActiveReleases, body as never);
    return jsonResponse(result);
  }),
});

export default http;
