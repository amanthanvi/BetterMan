/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { consume, enforce } from "./rateLimit";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function enforceRequest(body: unknown, secret: string | null = "rl-secret"): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret === null ? {} : { authorization: `Bearer ${secret}` }),
    },
    body: JSON.stringify(body),
  };
}

function bucketRows(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) => ctx.db.query("rateLimitBuckets").take(10));
}

beforeEach(() => vi.stubEnv("CONVEX_RATE_LIMIT_SECRET", "rl-secret"));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("public API surface", () => {
  it("registers bucket enforcement as internal only", () => {
    expect(consume.isInternal).toBe(true);
    expect("isPublic" in consume).toBe(false);
    // @ts-expect-error bucket enforcement must not be part of the public API
    void api.rateLimit.consume;
  });

  it("keeps the legacy public name inert so callers cannot spend anyone's bucket", async () => {
    expect(enforce.isPublic).toBe(true);
    const t = convexTest(schema, modules);
    for (let i = 0; i < 61; i += 1) {
      await expect(t.mutation(api.rateLimit.enforce, { kind: "search", identifier: "victim" })).resolves.toEqual({
        allowed: true, count: 0, retryAfterSeconds: 1,
      });
    }
    expect(await bucketRows(t)).toEqual([]);
    await expect(t.mutation(internal.rateLimit.consume, { kind: "search", identifier: "victim" })).resolves
      .toMatchObject({ allowed: true, count: 1 });
  });
});

describe("/rate-limit/enforce", () => {
  it("fails closed when the secret is not configured", async () => {
    vi.stubEnv("CONVEX_RATE_LIMIT_SECRET", "");
    const t = convexTest(schema, modules);
    const response = await t.fetch("/rate-limit/enforce", enforceRequest({ kind: "search", identifier: "a" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMIT_SECRET_NOT_CONFIGURED" } });
    expect(await bucketRows(t)).toEqual([]);
  });

  it.each([
    ["no credentials", null],
    ["the wrong secret", "guess"],
    ["the ingest secret", "ingest-secret"],
  ])("rejects %s without touching buckets", async (_label, secret) => {
    vi.stubEnv("CONVEX_INGEST_SECRET", "ingest-secret");
    const t = convexTest(schema, modules);
    const response = await t.fetch("/rate-limit/enforce", enforceRequest({ kind: "search", identifier: "a" }, secret));
    expect(response.status).toBe(401);
    expect(await bucketRows(t)).toEqual([]);
  });

  it.each([
    { kind: "admin", identifier: "a" },
    { kind: "search" },
    { kind: "search", identifier: "" },
    { kind: "search", identifier: "x".repeat(257) },
    null,
  ])("rejects malformed payload %j", async (body) => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/rate-limit/enforce", enforceRequest(body));
    expect(response.status).toBe(400);
    expect(await bucketRows(t)).toEqual([]);
  });

  it("enforces per-kind, per-identifier windows for the authenticated caller", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T00:00:05Z"));
    const t = convexTest(schema, modules);
    const hit = async (kind: string, identifier: string) =>
      (await t.fetch("/rate-limit/enforce", enforceRequest({ kind, identifier }))).json();

    for (let i = 1; i <= 60; i += 1) {
      expect(await hit("search", "203.0.113.10")).toMatchObject({ allowed: true, count: i });
    }
    expect(await hit("search", "203.0.113.10")).toEqual({ allowed: false, count: 61, retryAfterSeconds: 55 });
    expect(await hit("search", "198.51.100.7")).toMatchObject({ allowed: true, count: 1 });
    expect(await hit("page", "203.0.113.10")).toMatchObject({ allowed: true, count: 1 });

    vi.setSystemTime(new Date("2026-10-10T00:01:00Z"));
    expect(await hit("search", "203.0.113.10")).toMatchObject({ allowed: true, count: 1 });
  });
});
