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

export async function variantsForPage(
  ctx: QueryCtx,
  args: {
    stage: DatasetStage;
    locale: string;
    name: string;
    section: string;
  },
): Promise<Array<{ distro: Distro; datasetReleaseId: string; contentSha256: string }>> {
  const active = await ctx.db
    .query("activeReleases")
    .withIndex("by_stage_and_locale_and_distro", (q) =>
      q.eq("stage", args.stage).eq("locale", args.locale),
    )
    .take(DISTROS.length);

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
