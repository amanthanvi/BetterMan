/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { INGEST_CONTRACT } from "./ingestContract";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
});

it("advertises the ingest contract only when the ingest secret matches", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  const t = convexTest(schema, modules);

  const anonymous = await t.fetch("/ingest/contract", { method: "GET" });
  expect(anonymous.status).toBe(401);

  const response = await t.fetch("/ingest/contract", {
    method: "GET",
    headers: { authorization: "Bearer test-secret" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    schemaVersion: INGEST_CONTRACT.schemaVersion,
    functions: [...INGEST_CONTRACT.functions],
    declarationCounts: [...INGEST_CONTRACT.declarationCounts],
    activatePending: INGEST_CONTRACT.activatePending,
  });
});

it("does not advertise the ingest contract when the secret is unset", async () => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "");
  const t = convexTest(schema, modules);
  const response = await t.fetch("/ingest/contract", {
    method: "GET",
    headers: { authorization: "Bearer test-secret" },
  });
  expect(response.status).toBe(503);
});
