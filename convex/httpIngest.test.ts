/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { ingestClientError } from "./_ingestErrors";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;

beforeEach(() => vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret"));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const page = {
  externalId: "page", name: "page", section: "1", sitemapPage: 0, title: "page", description: "page",
  sourcePath: "page.1", sourcePackage: null, sourcePackageVersion: null, contentSha256: "page",
  hasParseWarnings: false, doc: {}, synopsis: null, options: null, seeAlso: null,
  searchText: "page", snippetText: "page", links: [],
};

function post(t: Harness, path: string, body: string) {
  return t.fetch(path, {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body,
  });
}

function createRelease(t: Harness, datasetReleaseId: string) {
  return t.mutation(internal.ingest.createRelease, {
    datasetReleaseId, locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
    ingestedAt: "2026-09-07T00:00:00Z", packageManifest: null, pageCount: 1, aliasCount: 0,
    licenseCount: 0, sectionTotals: [{ section: "1", total: 1 }], licensePackages: [],
  });
}

it("returns 400 for a body that is not JSON", async () => {
  const t = convexTest(schema, modules);
  const response = await post(t, "/ingest/pages", "{");
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
});

it("returns 400 when the mutation validator rejects a page", async () => {
  const t = convexTest(schema, modules);
  await createRelease(t, "release");
  const response = await post(t, "/ingest/pages", JSON.stringify({ datasetReleaseId: "release", pages: [{}] }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_INGEST_PAYLOAD" } });
  expect(await t.run((ctx) => ctx.db.query("manPages").take(1))).toEqual([]);
});

it("returns 400 and removes uploaded files when the stored-page validator rejects a page", async () => {
  const t = convexTest(schema, modules);
  await createRelease(t, "release");
  const response = await post(t, "/ingest/pages/storage", JSON.stringify({
    datasetReleaseId: "release", pages: [{ contentSha256: "page", doc: {} }],
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_INGEST_PAYLOAD" } });
  expect(await t.run((ctx) => ctx.db.system.query("_storage").take(1))).toEqual([]);
});

it("answers domain errors with a 4xx that names the code", async () => {
  const t = convexTest(schema, modules);
  const missing = await post(t, "/ingest/pages", JSON.stringify({ datasetReleaseId: "missing", pages: [page] }));
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: { code: "RELEASE_NOT_FOUND", message: "RELEASE_NOT_FOUND" } });

  await createRelease(t, "release");
  expect((await post(t, "/ingest/pages", JSON.stringify({ datasetReleaseId: "release", pages: [page] }))).status).toBe(200);
  const duplicate = await post(t, "/ingest/pages", JSON.stringify({
    datasetReleaseId: "release", pages: [{ ...page, externalId: "other" }],
  }));
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: { code: "DUPLICATE_MAN_PAGE_ROUTE" } });
});

it("classifies the messages the Convex runtime hands to an action", () => {
  // A mutation's Error arrives wrapped with the runtime's stack; argument
  // validation fails before the handler runs and arrives bare.
  expect(ingestClientError(new Error("Uncaught Error: RELEASE_SEALED\n    at handler (../convex/ingest.ts:376:11)\n")))
    .toEqual({ status: 409, code: "RELEASE_SEALED", message: "RELEASE_SEALED" });
  expect(ingestClientError(new Error("RELEASE_NOT_FOUND"))).toMatchObject({ status: 404 });
  const validation = `ArgumentValidationError: Value does not match validator.\nPath: .pages[0].doc\nValue: ${"x".repeat(5000)}`;
  const classified = ingestClientError(new Error(validation));
  expect(classified).toMatchObject({ status: 400, code: "INVALID_INGEST_PAYLOAD" });
  expect(classified?.message.length).toBe(1000);
  expect(ingestClientError(new Error("Uncaught TypeError: boom\n    at handler"))).toBeNull();
  expect(ingestClientError(new Error("CONTENT_STORAGE_MISSING"))).toBeNull();
  expect(ingestClientError(new Error("Uncaught Error: constructor"))).toBeNull();
  expect(ingestClientError(new Error("__proto__"))).toBeNull();
  expect(ingestClientError("RELEASE_SEALED")).toBeNull();
});

it("rethrows errors it does not recognise so Convex answers 500", async () => {
  const t = convexTest(schema, modules);
  await createRelease(t, "release");
  // The secret check hashes twice before the payload digest runs.
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, "digest").mockImplementation((algorithm, data) => {
    calls += 1;
    if (calls > 2) throw new Error("digest unavailable");
    return digest(algorithm, data);
  });
  await expect(post(t, "/ingest/pages/storage", JSON.stringify({ datasetReleaseId: "release", pages: [page] })))
    .rejects.toThrow("digest unavailable");
});
