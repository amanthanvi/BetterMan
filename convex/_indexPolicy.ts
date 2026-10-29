import type { Doc } from "./_generated/dataModel";

/** Unscored releases retain main's serving behavior; only scored releases filter. */
export function pageIsIndexable(
  release: Pick<Doc<"datasetReleases">, "indexablePageCount">,
  page: { indexable?: boolean },
): boolean {
  return release.indexablePageCount === undefined || page.indexable === true;
}

export function sitemapPageCount(
  release: Pick<Doc<"datasetReleases">, "indexablePageCount" | "pageCount">,
): number {
  return release.indexablePageCount ?? release.pageCount;
}
