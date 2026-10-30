/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DATASET_STAGES, DISTROS, type DatasetStage, type Distro } from "./lib";
import schema from "./schema";
import debianManifest from "../ingestion/data/debian-trixie.json";
import { INGEST_CONTRACT } from "./ingestContract";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
const kinds = ["inline", "storage", "aliases", "licenses"] as const;
const activation = (datasetReleaseId: string) => ({
  datasetReleaseId, stage: "prod" as const, activatedAt: "2026-09-07T00:00:00Z",
});
const releaseInput = (datasetReleaseId: string, distro: Distro = "debian", pageCount = 0) => ({
  datasetReleaseId, distro, locale: "en", imageRef: "test", imageDigest: "test",
  ingestedAt: "2026-09-07T00:00:00Z", packageManifest: null,
  pageCount, aliasCount: 0, licenseCount: 0,
  sectionTotals: pageCount ? [{ section: "1", total: pageCount }] : [], licensePackages: [],
});
const fourPathRelease = (datasetReleaseId: string) => ({
  ...releaseInput(datasetReleaseId, "debian", 2), aliasCount: 1, licenseCount: 1,
  licensePackages: [{ name: "original-licenses", version: "1", hasLicenseText: true }],
});

async function pointRelease(t: Harness, releaseId: Id<"datasetReleases">, stage: DatasetStage) {
  return t.run(async (ctx) => {
    const release = await ctx.db.get(releaseId);
    if (!release) throw new Error("fixture release missing");
    return ctx.db.insert("activeReleases", {
      releaseId, datasetReleaseId: release.datasetReleaseId,
      stage, locale: release.locale, distro: release.distro, activatedAt: "2026-09-07T00:00:00Z",
    });
  });
}
async function write(t: Harness, kind: typeof kinds[number], datasetReleaseId: string, name: string) {
  if (kind === "aliases") {
    return t.mutation(internal.ingest.insertAliases, {
      datasetReleaseId, aliases: [{ name, section: "1", targetName: "original-inline", targetSection: "1" }],
    });
  }
  if (kind === "licenses") {
    return t.mutation(internal.ingest.insertLicenses, {
      datasetReleaseId, licenses: [{ packageName: name, licenseId: name, licenseName: name, licenseText: name, sourceUrl: null }],
    });
  }
  const metadata = {
    externalId: name, name, section: "1", sitemapPage: 0, title: name, description: name,
    sourcePath: name, sourcePackage: null, sourcePackageVersion: null,
    contentSha256: name, hasParseWarnings: false, searchText: name, snippetText: name, links: [],
  };
  if (kind === "storage") {
    const contentStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["{}"], { type: "application/json" })));
    return t.mutation(internal.ingest.insertStoredPages, { datasetReleaseId, pages: [{ ...metadata, contentStorageId }] });
  }
  return t.mutation(internal.ingest.insertPages, {
    datasetReleaseId, pages: [{ ...metadata, doc: {}, synopsis: null, options: null, seeAlso: null }],
  });
}
async function releaseRows(t: Harness, releaseId: Id<"datasetReleases">) {
  return t.run(async (ctx) => ({
    release: await ctx.db.get(releaseId),
    pages: await ctx.db.query("manPages").withIndex("by_releaseId_and_externalId", (q) => q.eq("releaseId", releaseId)).take(100),
    aliases: await ctx.db.query("manPageAliases").withIndex("by_releaseId_and_name", (q) => q.eq("releaseId", releaseId)).take(100),
    licenses: await ctx.db.query("licenses").withIndex("by_releaseId_and_packageName", (q) => q.eq("releaseId", releaseId)).take(100),
  }));
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("release sealing", () => {
  it("leaves the old pointer in place while pending, joins polling jobs, then activates atomically", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const previous = await t.mutation(internal.ingest.createRelease, releaseInput("previous"));
    const pointerId = await pointRelease(t, previous.releaseId, "prod");
    const next = await t.mutation(internal.ingest.createRelease, releaseInput("next", "debian", 1));
    await write(t, "inline", "next", "uploaded-before-seal");
    const oldPointer = await t.run((ctx) => ctx.db.get(pointerId));
    for (let poll = 0; poll < 5; poll += 1) {
      expect(await t.mutation(internal.ingest.activateRelease, activation("next"))).toEqual({
        stage: "prod", distro: "debian", datasetReleaseId: "next", pending: true,
      });
      expect(await t.run((ctx) => ctx.db.get(pointerId))).toEqual(oldPointer);
    }
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100));
    expect(jobs).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(next.releaseId)))?.sealed).toBe(true);
    await expect(write(t, "inline", "next", "upload-after-seal")).rejects.toThrow("RELEASE_SEALED");
    expect(await t.run((ctx) => ctx.db.get(pointerId))).toEqual(oldPointer);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.ingest.activateRelease, activation("next"))).toEqual({
      stage: "prod", distro: "debian", datasetReleaseId: "next", pending: false,
    });
    expect(await t.run((ctx) => ctx.db.get(pointerId))).toMatchObject({ releaseId: next.releaseId, datasetReleaseId: "next" });
    expect((await t.run((ctx) => ctx.db.get(previous.releaseId)))?.sealed).toBe(true);
    expect((await releaseRows(t, next.releaseId)).pages.map((page) => page.name)).toEqual(["uploaded-before-seal"]);
  });

  it.each(["sealed", "legacy-active", "retired-sealed"])("permits only duplicate no-op replays for all four ingestion paths on %s releases", async (state) => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, fourPathRelease("locked"));
    for (const kind of kinds) await write(t, kind, "locked", `original-${kind}`);
    if (state === "legacy-active") {
      await pointRelease(t, releaseId, "prod");
    } else if (state === "sealed") {
      await t.mutation(internal.ingest.activateRelease, activation("locked"));
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } else {
      await pointRelease(t, releaseId, "prod");
      await t.mutation(internal.ingest.createRelease, releaseInput("replacement", "debian", 1));
      await write(t, "inline", "replacement", "replacement-page");
      await t.mutation(internal.ingest.activateRelease, activation("replacement"));
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      await t.mutation(internal.ingest.activateRelease, activation("replacement"));
      expect((await t.run((ctx) => ctx.db.get(releaseId)))?.sealed).toBe(true);
    }
    const before = await releaseRows(t, releaseId);
    for (const kind of kinds) {
      expect(await write(t, kind, "locked", `original-${kind}`)).toMatchObject({ inserted: 0, skipped: 1 });
      await expect(write(t, kind, "locked", `new-${kind}`)).rejects.toThrow("RELEASE_SEALED");
    }
    expect(await t.mutation(internal.ingest.createRelease, fourPathRelease("locked"))).toEqual({ releaseId, existed: true });
    expect(await releaseRows(t, releaseId)).toEqual(before);
  });

  it("recovers a canceled hydration chain on a later activation poll", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("retry", "debian", 1));
    await write(t, "inline", "retry", "retry-page");
    await t.mutation(internal.ingest.activateRelease, activation("retry"));
    await t.run(async (ctx) => {
      const release = await ctx.db.get(releaseId);
      if (!release?.relatedMetadataBackfillJobId) throw new Error("missing fixture job");
      await ctx.scheduler.cancel(release.relatedMetadataBackfillJobId);
    });
    expect(await t.mutation(internal.ingest.activateRelease, activation("retry"))).toMatchObject({ pending: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.ingest.activateRelease, activation("retry"))).toMatchObject({ pending: false });
  });

  it.each(["missing", "unsealed", "incomplete", "pruning"])("rejects an entire multi-distro promotion when a requested source is %s", async (invalid) => {
    const t = convexTest(schema, modules);
    const previous = await t.mutation(internal.ingest.createRelease, releaseInput("previous"));
    const targetId = await pointRelease(t, previous.releaseId, "prod");
    const ready = await t.mutation(internal.ingest.createRelease, releaseInput("ready"));
    await t.run((ctx) => ctx.db.patch(ready.releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 }));
    await pointRelease(t, ready.releaseId, "staging");
    if (invalid !== "missing") {
      const bad = await t.mutation(internal.ingest.createRelease, releaseInput("bad", "ubuntu"));
      await t.run((ctx) => ctx.db.patch(bad.releaseId, {
        sealed: invalid !== "unsealed",
        manifestVerified: true,
        pruning: invalid === "pruning",
        relatedMetadataCompletedVersion: invalid === "incomplete" ? undefined : 0,
      }));
      await pointRelease(t, bad.releaseId, "staging");
    }
    const before = await t.run((ctx) => ctx.db.get(targetId));
    await expect(t.mutation(internal.ingest.promoteActiveReleases, {
      fromStage: "staging", toStage: "prod", distros: ["debian", "ubuntu"], activatedAt: "2026-09-07T00:00:00Z",
    })).rejects.toThrow({ missing: "ACTIVE_RELEASE_NOT_FOUND", unsealed: "RELEASE_NOT_SEALED", incomplete: "RELATED_METADATA_INCOMPLETE", pruning: "RELEASE_PRUNING" }[invalid]);
    expect(await t.run((ctx) => ctx.db.get(targetId))).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get(previous.releaseId)))?.sealed).not.toBe(true);
  });

  it("holds the actual full Debian staging pointer atomically while promoting healthy distros", async () => {
    const t = convexTest(schema, modules);
    for (const distro of ["debian", "ubuntu"] as const) {
      const input = releaseInput(`full-${distro}`, distro);
      const { releaseId } = await t.mutation(internal.ingest.createRelease, {
        ...input, imageRef: "https://another-mirror.example/debian", packageManifest: distro === "debian" ? debianManifest : null,
      });
      await t.run(ctx => ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 }));
      await pointRelease(t, releaseId, "staging");
    }
    const args = { fromStage: "staging" as const, toStage: "prod" as const, distros: ["debian" as const, "ubuntu" as const], activatedAt: "2026-10-29T00:00:00Z" };
    expect(await t.mutation(internal.ingest.promoteActiveReleases, args)).toEqual({
      promoted: [{ distro: "ubuntu", datasetReleaseId: "full-ubuntu" }],
      skipped: [{ distro: "debian", datasetReleaseId: "full-debian", reason: "FULL_DEBIAN_PROMOTION_HELD" }],
    });
    expect(await t.run(ctx => ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", q => q.eq("stage", "prod").eq("locale", "en").eq("distro", "debian")).unique())).toBeNull();
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...args, allowFullDebian: true })).toEqual({
      promoted: [{ distro: "debian", datasetReleaseId: "full-debian" }, { distro: "ubuntu", datasetReleaseId: "full-ubuntu" }],
    });
  });

  it("promotes matching expectations and retries without pointer/history writes or duplicate healthy jobs even after staging advances", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("expected"));
    await t.run(ctx => ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 }));
    const stagingId = await pointRelease(t, releaseId, "staging");
    const args = { fromStage: "staging" as const, toStage: "prod" as const, distros: ["debian" as const], activatedAt: "now", expectedDatasetReleaseId: { debian: "expected" } };
    expect(await t.query(internal.ingest.getPromotionSource, { distro: "debian" })).toEqual({ distro: "debian", datasetReleaseId: "expected" });
    expect(await t.mutation(internal.ingest.promoteActiveReleases, args)).toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "expected" }] });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const state = () => t.run(async ctx => ({
      pointers: await ctx.db.query("activeReleases").take(10),
      release: await ctx.db.get(releaseId),
      jobs: await ctx.db.system.query("_scheduled_functions").take(10),
    }));
    const before = await state();
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...args, activatedAt: "retry" })).toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "expected" }] });
    expect(await state()).toEqual(before);
    await t.run(ctx => ctx.db.delete(stagingId));
    const next = await t.mutation(internal.ingest.createRelease, releaseInput("next"));
    await pointRelease(t, next.releaseId, "staging");
    const advanced = await state();
    expect(await t.mutation(internal.ingest.promoteActiveReleases, args)).toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "expected" }] });
    expect(await state()).toEqual(advanced);
  });

  it("acknowledges expected prod while re-arming a failed derived build without force", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("retry-derived"));
    await t.run(ctx => ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 }));
    await pointRelease(t, releaseId, "staging");
    const args = { fromStage: "staging" as const, toStage: "prod" as const, distros: ["debian" as const], activatedAt: "now", expectedDatasetReleaseId: { debian: "retry-derived" } };
    await t.mutation(internal.ingest.promoteActiveReleases, args);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const before = await t.run(async ctx => ({
      pointers: await ctx.db.query("activeReleases").take(10),
      release: await ctx.db.get(releaseId),
      build: await ctx.db.query("derivedBuilds").withIndex("by_locale", q => q.eq("locale", "en")).unique(),
    }));
    if (!before.build) throw new Error("missing derived fixture");
    await t.mutation(internal.derived.failBuild, { locale: "en", key: before.build.key, error: "fixture failure" });
    await t.mutation(internal.ingest.promoteActiveReleases, { ...args, activatedAt: "retry" });
    const after = await t.run(async ctx => ({
      pointers: await ctx.db.query("activeReleases").take(10),
      release: await ctx.db.get(releaseId),
      build: await ctx.db.query("derivedBuilds").withIndex("by_locale", q => q.eq("locale", "en")).unique(),
    }));
    expect(after.pointers).toEqual(before.pointers);
    expect(after.release).toEqual(before.release);
    expect(after.build).toMatchObject({ key: before.build.key, revision: before.build.revision, fingerprint: before.build.fingerprint, retrying: true, phase: "summaries", jobId: expect.any(String) });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.query(internal.derived.status, {})).toMatchObject({ state: "complete", healthy: true });
  });

  it.each([{ ubuntu: "extra" }, { debian: "" }, { debian: " " }])("rejects invalid promotion expectations before any writes: %j", async (expectedDatasetReleaseId) => {
    vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
    const t = convexTest(schema, modules);
    const response = await t.fetch("/ingest/promote", {
      method: "POST", headers: { authorization: "Bearer test-secret", "content-type": "application/json", "x-betterman-ingest-contract": String(INGEST_CONTRACT.schemaVersion) },
      body: JSON.stringify({ fromStage: "staging", toStage: "prod", distros: ["debian"], activatedAt: "now", expectedDatasetReleaseId }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_PROMOTION_EXPECTATION" } });
    expect(await t.run(ctx => ctx.db.query("activeReleases").take(10))).toEqual([]);
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").take(10))).toEqual([]);
  });

  it("reports readiness errors for full-Debian sources before evaluating the promotion hold", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...releaseInput("unready-full"), packageManifest: debianManifest });
    await t.run(ctx => ctx.db.patch(releaseId, { sealed: true, manifestVerified: true }));
    await pointRelease(t, releaseId, "staging");
    await expect(t.query(internal.ingest.getPromotionSource, { distro: "debian" })).rejects.toThrow("RELATED_METADATA_INCOMPLETE");
    expect(await t.run(ctx => ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", q => q.eq("stage", "prod").eq("locale", "en").eq("distro", "debian")).unique())).toBeNull();
  });

  it.each(["changed", "missing"])("returns HTTP 409 for a %s expected staging pointer and rolls back every distro", async (source) => {
    vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
    const t = convexTest(schema, modules);
    const ids: Id<"datasetReleases">[] = [];
    for (const distro of ["ubuntu", "debian"] as const) {
      const old = await t.mutation(internal.ingest.createRelease, releaseInput(`old-${distro}`, distro));
      await pointRelease(t, old.releaseId, "prod");
      ids.push(old.releaseId);
      const ready = await t.mutation(internal.ingest.createRelease, releaseInput(`ready-${distro}`, distro));
      await t.run(ctx => ctx.db.patch(ready.releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 }));
      if (distro !== "debian" || source !== "missing") await pointRelease(t, ready.releaseId, "staging");
      ids.push(ready.releaseId);
    }
    const state = () => t.run(async ctx => ({
      pointers: await ctx.db.query("activeReleases").take(10),
      releases: await Promise.all(ids.map(id => ctx.db.get(id))),
      jobs: await ctx.db.system.query("_scheduled_functions").take(10),
    }));
    const before = await state();
    const response = await t.fetch("/ingest/promote", {
      method: "POST", headers: { authorization: "Bearer test-secret", "content-type": "application/json", "x-betterman-ingest-contract": String(INGEST_CONTRACT.schemaVersion) },
      body: JSON.stringify({ fromStage: "staging", toStage: "prod", distros: ["ubuntu", "debian"], activatedAt: "now",
        expectedDatasetReleaseId: { ubuntu: "ready-ubuntu", debian: "verified-debian" } }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "STAGING_RELEASE_CONFLICT", message: expect.stringContaining("debian expected verified-debian") } });
    expect(await state()).toEqual(before);
  });

  it("composes CAS with persisted full-Debian authorization, including idempotent retries", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, { ...releaseInput("full-cas"), packageManifest: debianManifest });
    await t.run(ctx => ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 }));
    const stagingId = await pointRelease(t, releaseId, "staging");
    const args = { fromStage: "staging" as const, toStage: "prod" as const, distros: ["debian" as const], activatedAt: "now", expectedDatasetReleaseId: { debian: "full-cas" } };
    const held = { promoted: [], skipped: [{ distro: "debian", datasetReleaseId: "full-cas", reason: "FULL_DEBIAN_PROMOTION_HELD" }] };
    expect(await t.mutation(internal.ingest.promoteActiveReleases, args)).toEqual(held);
    for (const allowFullDebian of [false, true]) {
      await expect(t.mutation(internal.ingest.promoteActiveReleases, { ...args, allowFullDebian, expectedDatasetReleaseId: { debian: "other" } })).rejects.toThrow("STAGING_RELEASE_CONFLICT");
    }
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...args, allowFullDebian: true })).toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "full-cas" }] });
    // Move staging to a curated release. The retry must check the expected
    // prod release's persisted acquisition, not the new staging identity.
    await t.run(ctx => ctx.db.delete(stagingId));
    const curated = await t.mutation(internal.ingest.createRelease, releaseInput("curated"));
    await pointRelease(t, curated.releaseId, "staging");
    expect(await t.mutation(internal.ingest.promoteActiveReleases, args)).toEqual(held);
    expect(await t.mutation(internal.ingest.promoteActiveReleases, { ...args, allowFullDebian: true })).toEqual({ promoted: [{ distro: "debian", datasetReleaseId: "full-cas" }] });
  });

  it("exposes verified staging identity only through an authenticated, fixed-stage read", async () => {
    vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("source"));
    await pointRelease(t, releaseId, "staging");
    const request = (body: object, authorized = true) => t.fetch("/ingest/promotion-source", {
      method: "POST", headers: { "content-type": "application/json", "x-betterman-ingest-contract": String(INGEST_CONTRACT.schemaVersion), ...(authorized ? { authorization: "Bearer test-secret" } : {}) }, body: JSON.stringify(body),
    });
    expect((await request({ distro: "debian" }, false)).status).toBe(401);
    expect((await request({ distro: "debian", stage: "prod" })).status).toBe(400);
    expect((await request({ distro: "debian" })).status).toBe(409);
    await t.run(ctx => ctx.db.patch(releaseId, { sealed: true, manifestVerified: true, relatedMetadataCompletedVersion: 0 }));
    const response = await request({ distro: "debian" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ distro: "debian", datasetReleaseId: "source" });
  });

  it.each([false, true])("holds direct prod activation before mutation (existing pointer: %s), but allows staging and explicit authorization", async (existing) => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    if (existing) {
      const old = await t.mutation(internal.ingest.createRelease, releaseInput("old"));
      await pointRelease(t, old.releaseId, "prod");
    }
    const input = { ...releaseInput("archive", "debian", 1), packageManifest: debianManifest, imageRef: "https://changed-mirror.example/archive" };
    const { releaseId } = await t.mutation(internal.ingest.createRelease, input);
    expect(await t.run(ctx => ctx.db.get(releaseId))).toMatchObject({ acquisition: debianManifest.acquisition });
    await write(t, "inline", "archive", "archive-page");
    const before = await t.run(ctx => ctx.db.query("activeReleases").take(10));
    for (const allowFullDebian of [undefined, false]) {
      await expect(t.mutation(internal.ingest.activateRelease, { ...activation("archive"), ...(allowFullDebian === undefined ? {} : { allowFullDebian }) }))
        .rejects.toThrow("FULL_DEBIAN_PROMOTION_HELD");
    }
    expect(await t.run(ctx => ctx.db.query("activeReleases").take(10))).toEqual(before);
    expect((await t.run(ctx => ctx.db.get(releaseId)))?.sealed).not.toBe(true);
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").take(10))).toEqual([]);
    await t.mutation(internal.ingest.activateRelease, { ...activation("archive"), stage: "staging" });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.mutation(internal.ingest.activateRelease, { ...activation("archive"), stage: "staging" })).toMatchObject({ pending: false });
    await expect(t.mutation(internal.ingest.activateRelease, activation("archive"))).rejects.toThrow("FULL_DEBIAN_PROMOTION_HELD");
    expect(await t.mutation(internal.ingest.activateRelease, { ...activation("archive"), allowFullDebian: true })).toMatchObject({ pending: false });
    expect(await t.run(ctx => ctx.db.query("activeReleases").withIndex("by_stage_and_locale_and_distro", q => q.eq("stage", "prod").eq("locale", "en").eq("distro", "debian")).unique())).toMatchObject({ releaseId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });

  it("seals and hydrates all 14 supported active pointers before reporting ready", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    for (const stage of DATASET_STAGES) {
      for (const distro of DISTROS) {
        const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput(`${stage}-${distro}`, distro, 1));
        await write(t, "inline", `${stage}-${distro}`, "page");
        await pointRelease(t, releaseId, stage);
      }
    }
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(false);
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 14, skipped: 0, stopped: [] });
    const pending = await t.query(internal.related.activeMetadataStatus, {});
    expect(pending.complete).toBe(false);
    expect(pending.releases).toHaveLength(14);
    expect(pending.releases.every((release) => release.sealed)).toBe(true);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(true);
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 0, skipped: 14, stopped: [] });
  });

  it("does not declare a completed but unsealed legacy release ready", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, releaseInput("legacy", "debian", 1));
    await write(t, "inline", "legacy", "page");
    await t.run((ctx) => ctx.db.patch(releaseId, { relatedMetadataCompletedVersion: 1, manifestBasis: undefined, aliasCount: undefined }));
    await pointRelease(t, releaseId, "prod");
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(false);
    expect(await t.mutation(internal.related.backfillActiveReleases, {})).toEqual({ scheduled: 1, skipped: 0, stopped: [] });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(false);
  });

  it("rejects pruning release inputs and activation while stopping hydration and readiness", async () => {
    const t = convexTest(schema, modules);
    const { releaseId } = await t.mutation(internal.ingest.createRelease, fourPathRelease("pruning"));
    for (const kind of kinds) await write(t, kind, "pruning", `original-${kind}`);
    await pointRelease(t, releaseId, "prod");
    await t.run((ctx) => ctx.db.patch(releaseId, { sealed: true, pruning: true, relatedMetadataCompletedVersion: 2 }));
    const before = await releaseRows(t, releaseId);
    for (const kind of kinds) {
      await expect(write(t, kind, "pruning", `original-${kind}`)).rejects.toThrow("RELEASE_PRUNING");
    }
    await expect(t.mutation(internal.ingest.createRelease, fourPathRelease("pruning"))).rejects.toThrow("RELEASE_PRUNING");
    await expect(t.mutation(internal.ingest.activateRelease, activation("pruning"))).rejects.toThrow("RELEASE_PRUNING");
    await expect(t.mutation(internal.related.backfillActiveReleases, {})).rejects.toThrow("RELEASE_PRUNING");
    expect(await t.mutation(internal.related.backfillRelease, { datasetReleaseId: "pruning" })).toEqual({
      processed: 0, updated: 0, isDone: true, continueCursor: null,
    });
    expect((await t.query(internal.related.activeMetadataStatus, {})).complete).toBe(false);
    expect(await releaseRows(t, releaseId)).toEqual(before);
  });
});
