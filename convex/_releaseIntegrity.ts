import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DATASET_STAGES } from "./lib";

export async function requireMutableRelease(
  ctx: MutationCtx | QueryCtx,
  release: Doc<"datasetReleases">,
) {
  if (release.pruning) throw new Error("RELEASE_PRUNING");
  if (release.sealed) throw new Error("RELEASE_SEALED");
  for (const stage of DATASET_STAGES) {
    const active = await ctx.db.query("activeReleases")
      .withIndex("by_stage_and_locale_and_distro", (q) =>
        q.eq("stage", stage).eq("locale", release.locale).eq("distro", release.distro))
      .unique();
    if (active?.releaseId === release._id) throw new Error("RELEASE_SEALED");
  }
}

export async function requireMutablePage(ctx: MutationCtx, pageId: Id<"manPages">) {
  const page = await ctx.db.get(pageId);
  if (!page) throw new Error("PAGE_NOT_FOUND");
  const release = await ctx.db.get(page.releaseId);
  if (!release) throw new Error("RELEASE_NOT_FOUND");
  await requireMutableRelease(ctx, release);
}

export async function requireMutableBlob(ctx: MutationCtx, blobId: Id<"manPageContentBlobs">) {
  const references = await ctx.db.query("manPageContents")
    .withIndex("by_blobId", (q) => q.eq("blobId", blobId)).take(101);
  // Fail closed when all owners cannot be checked in a bounded transaction.
  if (references.length > 100) throw new Error("CONTENT_REFERENCE_LIMIT");
  for (const reference of references) await requireMutablePage(ctx, reference.pageId);
}
