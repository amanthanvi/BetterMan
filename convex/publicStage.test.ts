/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const originalStage = process.env.BETTERMAN_DATASET_STAGE;

afterEach(() => {
  if (originalStage === undefined) {
    delete process.env.BETTERMAN_DATASET_STAGE;
  } else {
    process.env.BETTERMAN_DATASET_STAGE = originalStage;
  }
});

async function seedRelease(
  t: TestConvex<typeof schema>,
  stage: "staging" | "prod",
  datasetReleaseId: string,
) {
  await t.run(async (ctx) => {
    const releaseId = await ctx.db.insert("datasetReleases", {
      datasetReleaseId,
      locale: "en",
      distro: "debian",
      imageRef: "debian:stable",
      imageDigest: `sha256:${datasetReleaseId}`,
      ingestedAt: "2026-08-20T00:00:00.000Z",
      pageCount: stage === "prod" ? 100 : 200,
    });
    await ctx.db.insert("activeReleases", {
      stage,
      locale: "en",
      distro: "debian",
      releaseId,
      datasetReleaseId,
      activatedAt: "2026-08-20T00:00:00.000Z",
    });
  });
}

describe("public dataset stage", () => {
  it("defaults to prod and honors a staging deployment configuration", async () => {
    const t = convexTest(schema, modules);
    await seedRelease(t, "prod", "prod-release");
    await seedRelease(t, "staging", "staging-release");

    delete process.env.BETTERMAN_DATASET_STAGE;
    await expect(t.query(api.queries.getInfo, { distro: "debian" })).resolves.toMatchObject({
      datasetReleaseId: "prod-release",
      pageCount: 100,
    });

    process.env.BETTERMAN_DATASET_STAGE = "staging";
    await expect(t.query(api.queries.getInfo, { distro: "debian" })).resolves.toMatchObject({
      datasetReleaseId: "staging-release",
      pageCount: 200,
    });
  });

  it("rejects a forged stage on every public dataset read", async () => {
    process.env.BETTERMAN_DATASET_STAGE = "prod";
    const t = convexTest(schema, modules);
    const forgedStage = "staging" as const;
    const calls = [
      () => t.query(api.queries.getInfo, { stage: forgedStage, distro: "debian" } as never),
      () => t.query(api.queries.listSections, { stage: forgedStage, distro: "debian" } as never),
      () =>
        t.query(
          api.queries.listSection,
          { stage: forgedStage, distro: "debian", section: "1", limit: 20, offset: 0 } as never,
        ),
      () =>
        t.query(
          api.queries.getRelated,
          { stage: forgedStage, distro: "debian", name: "tar", section: "1" } as never,
        ),
      () =>
        t.query(
          api.queries.search,
          {
            stage: forgedStage,
            distro: "debian",
            q: "tar",
            section: null,
            limit: 5,
            offset: 0,
          } as never,
        ),
      () =>
        t.query(
          api.queries.suggest,
          { stage: forgedStage, distro: "debian", name: "tar" } as never,
        ),
      () => t.query(api.queries.listLicenses, { stage: forgedStage, distro: "debian" } as never),
      () =>
        t.query(
          api.queries.getLicense,
          { stage: forgedStage, distro: "debian", packageName: "tar" } as never,
        ),
      () => t.query(api.queries.listSeoReleases, { stage: forgedStage } as never),
      () =>
        t.query(
          api.queries.listSitemapPage,
          { stage: forgedStage, distro: "debian", page: 0 } as never,
        ),
      () =>
        t.query(
          api.queries.listSitemapPageChunk,
          {
            stage: forgedStage,
            distro: "debian",
            page: 0,
            paginationOpts: { numItems: 10, cursor: null },
          } as never,
        ),
      () =>
        t.action(
          api.content.getManByName,
          { stage: forgedStage, distro: "debian", name: "tar" } as never,
        ),
      () =>
        t.action(
          api.content.getManByNameAndSection,
          { stage: forgedStage, distro: "debian", name: "tar", section: "1" } as never,
        ),
    ];

    expect.assertions(calls.length);
    for (const call of calls) {
      await expect(call()).rejects.toThrow(/unexpected field `stage`/i);
    }
  });

  it("rejects an invalid deployment stage instead of falling back", async () => {
    process.env.BETTERMAN_DATASET_STAGE = "preview";
    const t = convexTest(schema, modules);

    await expect(t.query(api.queries.getInfo, { distro: "debian" })).rejects.toThrow(
      "INVALID_DATASET_STAGE",
    );
  });
});
