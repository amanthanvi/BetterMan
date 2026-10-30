/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { INGEST_CONTRACT } from "./ingestContract";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

it.each([false, true])("persists Ubuntu's independent hold and enforces tiers (scored: %s)", async (scored) => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  try {
    const t = convexTest(schema, modules);
    const headers = { authorization: "Bearer test-secret", "content-type": "application/json", "x-betterman-ingest-contract": String(INGEST_CONTRACT.schemaVersion) };
    const input = { datasetReleaseId: "ubuntu-full", locale: "en", distro: "ubuntu" as const,
      imageRef: "https://unrelated-mirror.example", imageDigest: "test", ingestedAt: "now",
      packageManifest: { acquisition: "ubuntu-deb-extraction" }, pageCount: 1,
      ...(scored ? { indexablePageCount: 1 } : {}), aliasCount: 0, licenseCount: 0,
      sectionTotals: [{ section: "1", total: 1 }], licensePackages: [] };
    const response = await t.fetch("/ingest/release", { method: "POST", headers, body: JSON.stringify(input) });
    expect(response.status).toBe(200);
    const release = await t.run(ctx => ctx.db.query("datasetReleases").withIndex("by_datasetReleaseId", q => q.eq("datasetReleaseId", input.datasetReleaseId)).unique());
    expect(release?.acquisition).toBe("ubuntu-deb-extraction");
    await t.run(async ctx => {
      await ctx.db.patch(release!._id, { sealed: true, manifestVerified: true, relatedMetadataVersion: 0, relatedMetadataCompletedVersion: 0 });
      await ctx.db.insert("activeReleases", { releaseId: release!._id, datasetReleaseId: input.datasetReleaseId, locale: "en", distro: "ubuntu", stage: "staging", activatedAt: "now" });
    });
    for (const allowFullUbuntu of [false, true]) {
      const direct = await t.fetch("/ingest/activate", { method: "POST", headers, body: JSON.stringify({ datasetReleaseId: input.datasetReleaseId, stage: "prod", activatedAt: "now", allowFullUbuntu, allowFullDebian: true }) });
      expect(direct.status).toBe(409);
      expect(await direct.json()).toMatchObject({ error: { code: scored ? "FULL_UBUNTU_PROMOTION_HELD" : "FULL_UBUNTU_TIER_REQUIRED" } });
      const args = { fromStage: "staging" as const, toStage: "prod" as const, distros: ["ubuntu" as const], activatedAt: "now", allowFullDebian: true, allowFullUbuntu, expectedDatasetReleaseId: { ubuntu: input.datasetReleaseId } };
      await expect(t.mutation(internal.ingest.promoteActiveReleases, { ...args, expectedDatasetReleaseId: { ubuntu: "different" } })).rejects.toThrow("STAGING_RELEASE_CONFLICT");
      const result = await t.mutation(internal.ingest.promoteActiveReleases, args);
      expect(result).toEqual(scored && allowFullUbuntu ? { promoted: [{ distro: "ubuntu", datasetReleaseId: input.datasetReleaseId }] } : { promoted: [], skipped: [{ distro: "ubuntu", datasetReleaseId: input.datasetReleaseId, reason: scored ? "FULL_UBUNTU_PROMOTION_HELD" : "FULL_UBUNTU_TIER_REQUIRED" }] });
    }
    await expect(t.mutation(internal.ingest.createRelease, { ...input, datasetReleaseId: "mismatch", distro: "debian" })).rejects.toThrow("INVALID_RELEASE_MANIFEST");
  } finally { vi.unstubAllEnvs(); }
});
