/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { INGEST_CONTRACT } from "./ingestContract";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const families = [
  { distro: "ubuntu" as const, acquisition: "ubuntu-deb-extraction" },
  { distro: "fedora" as const, acquisition: "fedora-rpm-extraction" },
  { distro: "arch" as const, acquisition: "arch-pkg-extraction" },
  { distro: "alpine" as const, acquisition: "alpine-apk-extraction" },
];

it.each(families.flatMap(family => [false, true].map(scored => ({ ...family, scored }))))(
  "persists $distro's independent hold and enforces tiers (scored: $scored)", async ({ distro, acquisition, scored }) => {
  vi.stubEnv("CONVEX_INGEST_SECRET", "test-secret");
  try {
    const t = convexTest(schema, modules);
    const headers = { authorization: "Bearer test-secret", "content-type": "application/json", "x-betterman-ingest-contract": String(INGEST_CONTRACT.schemaVersion) };
    const datasetReleaseId = `${distro}-full`;
    const input = { datasetReleaseId, locale: "en", distro,
      imageRef: "https://unrelated-mirror.example", imageDigest: "test", ingestedAt: "now",
      packageManifest: { acquisition }, pageCount: 1,
      ...(scored ? { indexablePageCount: 1 } : {}), aliasCount: 0, licenseCount: 0,
      sectionTotals: [{ section: "1", total: 1 }], licensePackages: [] };
    const response = await t.fetch("/ingest/release", { method: "POST", headers, body: JSON.stringify(input) });
    expect(response.status).toBe(200);
    const release = await t.run(ctx => ctx.db.query("datasetReleases").withIndex("by_datasetReleaseId", q => q.eq("datasetReleaseId", datasetReleaseId)).unique());
    expect(release?.acquisition).toBe(acquisition);
    await t.run(async ctx => {
      await ctx.db.patch(release!._id, { sealed: true, manifestVerified: true, relatedMetadataVersion: 0, relatedMetadataCompletedVersion: 0 });
      await ctx.db.insert("activeReleases", { releaseId: release!._id, datasetReleaseId, locale: "en", distro, stage: "staging", activatedAt: "now" });
    });
    for (const allowed of [false, true]) {
      const authorizations = { allowFullDebian: true, allowFullUbuntu: distro === "ubuntu" ? allowed : true, allowFullFedora: distro === "fedora" ? allowed : true, allowFullArch: distro === "arch" ? allowed : true, allowFullAlpine: distro === "alpine" ? allowed : true };
      const direct = await t.fetch("/ingest/activate", { method: "POST", headers, body: JSON.stringify({ datasetReleaseId, stage: "prod", activatedAt: "now", ...authorizations }) });
      expect(direct.status).toBe(409);
      expect(await direct.json()).toMatchObject({ error: { code: `FULL_${distro.toUpperCase()}_${scored ? "PROMOTION_HELD" : "TIER_REQUIRED"}` } });
      const args = { fromStage: "staging" as const, toStage: "prod" as const, distros: [distro], activatedAt: "now", ...authorizations, expectedDatasetReleaseId: { [distro]: datasetReleaseId } };
      await expect(t.mutation(internal.ingest.promoteActiveReleases, { ...args, expectedDatasetReleaseId: { [distro]: "different" } })).rejects.toThrow("STAGING_RELEASE_CONFLICT");
      const result = await t.mutation(internal.ingest.promoteActiveReleases, args);
      expect(result).toEqual(scored && allowed ? { promoted: [{ distro, datasetReleaseId }] } : { promoted: [], skipped: [{ distro, datasetReleaseId, reason: `FULL_${distro.toUpperCase()}_${scored ? "PROMOTION_HELD" : "TIER_REQUIRED"}` }] });
    }
    await expect(t.mutation(internal.ingest.createRelease, { ...input, datasetReleaseId: "mismatch", distro: "debian" })).rejects.toThrow("INVALID_RELEASE_MANIFEST");
  } finally { vi.unstubAllEnvs(); }
});
