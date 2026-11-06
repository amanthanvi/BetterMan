import type { Doc } from "./_generated/dataModel";

/** Unscored canonical pages retain legacy indexing; provider alternates never index. */
export function pageIsIndexable(
  release: Pick<Doc<"datasetReleases">, "indexablePageCount">,
  page: { indexable?: boolean; providerOnly?: boolean },
): boolean {
  return page.providerOnly !== true && (release.indexablePageCount === undefined || page.indexable === true);
}

export function sitemapPageCount(
  release: Pick<Doc<"datasetReleases">, "indexablePageCount" | "pageCount">,
): number {
  return release.indexablePageCount ?? release.pageCount;
}
