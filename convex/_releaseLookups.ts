import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DISTRO_ORDER, DISTROS, type DatasetStage, type Distro } from "./lib";

export async function activeRelease(
  ctx: QueryCtx,
  args: { stage: DatasetStage; distro: Distro; locale?: string },
): Promise<Doc<"datasetReleases"> | null> {
  const active = await ctx.db
    .query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", args.stage).eq("locale", args.locale ?? "en").eq("distro", args.distro),
    )
    .unique();
  if (!active) return null;
  return await ctx.db.get(active.releaseId);
}

export async function requireActiveRelease(
  ctx: QueryCtx,
  args: { stage: DatasetStage; distro: Distro; locale?: string },
): Promise<Doc<"datasetReleases">> {
  const release = await activeRelease(ctx, args);
  if (!release) throw new Error("ACTIVE_RELEASE_NOT_FOUND");
  return release;
}

export async function pageByNameAndSection(
  ctx: QueryCtx,
  args: { releaseId: Id<"datasetReleases">; name: string; section: string },
): Promise<Doc<"manPages"> | null> {
  return await ctx.db
    .query("manPages")
    .withIndex("by_releaseId_and_name_and_section", (q) =>
      q.eq("releaseId", args.releaseId).eq("name", args.name).eq("section", args.section),
    )
    .unique();
}

// Name-only route resolution is shared by metadata redirects and document
// reads. Page matches outrank aliases; preserve the index's section ordering.
export async function resolvePageByName(
  ctx: QueryCtx,
  args: { releaseId: Id<"datasetReleases">; name: string },
) {
  const pages = await ctx.db
    .query("manPages")
    .withIndex("by_releaseId_and_name_and_section", (q) =>
      q.eq("releaseId", args.releaseId).eq("name", args.name),
    )
    .take(20);
  if (pages.length === 1) return { kind: "page" as const, page: pages[0] };
  if (pages.length > 1) {
    return {
      kind: "ambiguous" as const,
      options: pages.map((page) => ({
        section: page.section, title: page.title, description: page.description,
      })),
    };
  }
  const aliases = await ctx.db
    .query("manPageAliases")
    .withIndex("by_releaseId_and_name", (q) =>
      q.eq("releaseId", args.releaseId).eq("name", args.name),
    )
    .take(2);
  if (aliases.length === 1) {
    return { kind: "alias" as const, name: aliases[0].targetName, section: aliases[0].targetSection };
  }
  return { kind: "not_found" as const };
}

export async function variantsForPage(
  ctx: QueryCtx,
  args: {
    stage: DatasetStage;
    locale: string;
    name: string;
    section: string;
    page?: Doc<"manPages">;
  },
): Promise<Array<{ distro: Distro; datasetReleaseId: string; contentSha256: string }>> {
  const cached = args.stage === "prod" ? args.page?.variants : args.page?.stagingVariants;
  const version = args.stage === "prod" ? args.page?.variantsVersion : args.page?.stagingVariantsVersion;
  if (cached !== undefined) {
    const state = await ctx.db.query("variantSnapshots")
      .withIndex("by_stage_and_locale", (q) => q.eq("stage", args.stage).eq("locale", args.locale)).unique();
    if (state && version === state.version) {
      return cached.map(({ distro, datasetReleaseId, contentSha256 }) => ({ distro, datasetReleaseId, contentSha256 }));
    }
  }
  // Legacy or invalidated rows retain live lookup behavior while refreshing.
  const active = await ctx.db
    .query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", args.stage).eq("locale", args.locale),
    )
    .take(DISTROS.length);

  return variantsFromPointers(ctx, active, args);
}

export async function variantsFromPointers(
  ctx: QueryCtx,
  active: Array<Doc<"activeReleases">>,
  args: { name: string; section: string },
): Promise<Array<{ distro: Distro; datasetReleaseId: string; contentSha256: string }>> {
  const variants = (
    await Promise.all(
      active.map(async (item) => {
        const page = await pageByNameAndSection(ctx, {
          releaseId: item.releaseId,
          name: args.name,
          section: args.section,
        });
        if (!page) return null;
        return {
          distro: item.distro,
          datasetReleaseId: item.datasetReleaseId,
          contentSha256: page.contentSha256,
        };
      }),
    )
  ).filter((variant): variant is NonNullable<typeof variant> => variant !== null);

  variants.sort((a, b) => {
    const order = (DISTRO_ORDER[a.distro] ?? 99) - (DISTRO_ORDER[b.distro] ?? 99);
    return order || a.distro.localeCompare(b.distro);
  });
  return variants;
}
