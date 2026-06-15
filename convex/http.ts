import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

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
  if (!token || token !== configured) return unauthorized();
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

type PageIngestPayload = {
  contentSha256: string;
  doc: unknown;
  synopsis: unknown;
  options: unknown;
  seeAlso: unknown;
};

async function contentStorageIdForPage(
  ctx: { storage: { store: (blob: Blob) => Promise<string> } },
  page: PageIngestPayload,
): Promise<string> {
  const content = {
    docJson: JSON.stringify(page.doc),
    synopsisJson: jsonField(page.synopsis),
    optionsJson: jsonField(page.options),
    seeAlsoJson: jsonField(page.seeAlso),
  };
  return await ctx.storage.store(
    new Blob([JSON.stringify({ contentSha256: page.contentSha256, content })], {
      type: "application/json",
    }),
  );
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

    const contentSha256s = payload.pages
      .map((page) => (typeof page.contentSha256 === "string" ? page.contentSha256 : ""))
      .filter(Boolean);
    const existing = await ctx.runQuery(internal.ingest.listContentBlobStorageBySha, {
      contentSha256s,
    });
    const storageBySha = new Map<string, string>();
    for (const item of existing) {
      if (item.storageId) storageBySha.set(item.contentSha256, item.storageId);
    }

    const pages = [];
    let storedContentFiles = 0;
    let reusedContentFiles = 0;
    for (const page of payload.pages) {
      const contentSha256 =
        typeof page.contentSha256 === "string" ? page.contentSha256 : "";
      if (!contentSha256) {
        return jsonResponse(
          { error: { code: "INVALID_INGEST_PAYLOAD", message: "page.contentSha256 is required" } },
          400,
        );
      }

      let contentStorageId = storageBySha.get(contentSha256);
      if (!contentStorageId) {
        contentStorageId = await contentStorageIdForPage(ctx, {
          contentSha256,
          doc: page.doc,
          synopsis: page.synopsis,
          options: page.options,
          seeAlso: page.seeAlso,
        });
        storageBySha.set(contentSha256, contentStorageId);
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

    const result = await ctx.runMutation(internal.ingest.insertStoredPages, {
      datasetReleaseId: payload.datasetReleaseId,
      pages,
    } as never);
    return jsonResponse({ ...result, storedContentFiles, reusedContentFiles });
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
    return jsonResponse(result);
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
