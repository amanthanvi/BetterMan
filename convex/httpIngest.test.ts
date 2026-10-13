/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "./http";
import schema from "./schema";
import { MAX_CONTENT_FIELD_CHARS } from "./_legacyContent";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;

const releasePayload = {
  datasetReleaseId: "http-ingest-test", locale: "en", distro: "debian", imageRef: "test", imageDigest: "test",
  ingestedAt: "2026-09-07T00:00:00Z", packageManifest: null, pageCount: 0, aliasCount: 0, licenseCount: 0,
  sectionTotals: [], licensePackages: [],
};
const routeCases: Array<{ path: string; payload: Record<string, unknown>; strings: string[]; arrays: string[]; numbers?: string[] }> = [
  { path: "/ingest/release", payload: releasePayload,
    strings: ["datasetReleaseId", "locale", "distro", "imageRef", "imageDigest", "ingestedAt"],
    arrays: ["sectionTotals", "licensePackages"], numbers: ["pageCount", "aliasCount", "licenseCount"] },
  { path: "/ingest/pages", payload: { datasetReleaseId: "http-ingest-test", pages: [] }, strings: ["datasetReleaseId"], arrays: ["pages"] },
  { path: "/ingest/pages/storage", payload: { datasetReleaseId: "http-ingest-test", pages: [] }, strings: ["datasetReleaseId"], arrays: ["pages"] },
  { path: "/ingest/aliases", payload: { datasetReleaseId: "http-ingest-test", aliases: [] }, strings: ["datasetReleaseId"], arrays: ["aliases"] },
  { path: "/ingest/licenses", payload: { datasetReleaseId: "http-ingest-test", licenses: [] }, strings: ["datasetReleaseId"], arrays: ["licenses"] },
  { path: "/ingest/activate", payload: { datasetReleaseId: "http-ingest-test", stage: "prod", activatedAt: "2026-09-07T00:00:00Z" },
    strings: ["datasetReleaseId", "stage", "activatedAt"], arrays: [] },
  { path: "/ingest/promote", payload: { fromStage: "dev", toStage: "prod", distros: ["debian"], activatedAt: "2026-09-07T00:00:00Z" },
    strings: ["fromStage", "toStage", "activatedAt"], arrays: ["distros"] },
];

beforeEach(() => vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

function request(t: Harness, path: string, body: string, authorization: string | undefined = "Bearer test-secret") {
  return t.fetch(path, {
    method: "POST", headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, body,
  });
}

async function expectNoSideEffects(t: Harness) {
  const state = await t.run(async (ctx) => ({
    releases: await ctx.db.query("datasetReleases").take(1),
    pages: await ctx.db.query("manPages").take(1),
    aliases: await ctx.db.query("manPageAliases").take(1),
    licenses: await ctx.db.query("licenses").take(1),
    active: await ctx.db.query("activeReleases").take(1),
    scheduled: await ctx.db.system.query("_scheduled_functions").take(1),
    storage: await ctx.db.system.query("_storage").take(1),
  }));
  for (const rows of Object.values(state)) expect(rows).toEqual([]);
}

it("covers every registered ingest HTTP route", () => {
  const registered = http.getRoutes().filter(([path]) => path.startsWith("/ingest/"));
  expect(registered.map(([path, method]) => [path, method]).sort()).toEqual(routeCases.map(({ path }) => [path, "POST"]).sort());
});

describe.each(routeCases)("$path", ({ path, payload, strings, arrays, numbers = [] }) => {
  it.each([undefined, "Bearer wrong-secret", "Basic test-secret", "Bearer"])("rejects authorization %s without side effects", async (authorization) => {
    const t = convexTest(schema, modules);
    // Explicitly build missing-auth requests: request() defaults to valid auth.
    const response = await t.fetch(path, { method: "POST", headers: authorization ? { authorization } : {}, body: JSON.stringify(payload) });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    await expectNoSideEffects(t);
  });

  it.each([undefined, "", "   "])("fails closed with a missing configured secret (%s)", async (secret) => {
    vi.stubEnv("CONVEX_INGEST_SECRET", secret);
    const t = convexTest(schema, modules);
    const response = await request(t, path, JSON.stringify(payload));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "INGEST_SECRET_NOT_CONFIGURED" } });
    await expectNoSideEffects(t);
  });

  it.each(["{", "", "{\"datasetReleaseId\":"])("returns 400 for malformed JSON (%s)", async (body) => {
    const t = convexTest(schema, modules);
    const response = await request(t, path, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
    await expectNoSideEffects(t);
  });

  it("checks authorization before parsing malformed JSON", async () => {
    const t = convexTest(schema, modules);
    const response = await request(t, path, "{", "Bearer wrong-secret");
    expect(response.status).toBe(401);
    await expectNoSideEffects(t);
  });

  it.each([null, [], true, 42, "payload", {}])("returns 400 for invalid root shape %j", async (body) => {
    const t = convexTest(schema, modules);
    const response = await request(t, path, JSON.stringify(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_INGEST_PAYLOAD" } });
    await expectNoSideEffects(t);
  });

  for (const field of strings) {
    it.each([undefined, null, 42, "", "   "])(`returns 400 for invalid ${field} (%j)`, async (value) => {
      const t = convexTest(schema, modules);
      const response = await request(t, path, JSON.stringify({ ...payload, [field]: value }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "INVALID_INGEST_PAYLOAD" } });
      await expectNoSideEffects(t);
    });
  }

  for (const field of arrays) {
    it.each([undefined, null, {}, "array", [null], [42]])(`returns 400 for invalid ${field} (%j)`, async (value) => {
      const t = convexTest(schema, modules);
      const response = await request(t, path, JSON.stringify({ ...payload, [field]: value }));
      expect(response.status).toBe(400);
      await expectNoSideEffects(t);
    });
  }

  for (const field of numbers) {
    it.each([undefined, null, "0", []])(`returns 400 for invalid ${field} (%j)`, async (value) => {
      const t = convexTest(schema, modules);
      const response = await request(t, path, JSON.stringify({ ...payload, [field]: value }));
      expect(response.status).toBe(400);
      await expectNoSideEffects(t);
    });
  }
});

it.each(["doc", "synopsis", "options", "seeAlso"])("rejects oversized storage %s content before allocating files", async (field) => {
  const t = convexTest(schema, modules);
  const response = await request(t, "/ingest/pages/storage", JSON.stringify({
    datasetReleaseId: "http-ingest-test",
    pages: [{ contentSha256: "content", doc: {}, [field]: "x".repeat(MAX_CONTENT_FIELD_CHARS) }],
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_INGEST_PAYLOAD", message: expect.stringContaining("CONTENT_FIELD_TOO_LARGE") } });
  await expectNoSideEffects(t);
});
