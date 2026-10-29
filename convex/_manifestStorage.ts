// Distinguish manifest uploads from page content/legacy storage. Unlinked
// files with this MIME type can be reclaimed after the maximum action lifetime.
export const MANIFEST_CONTENT_TYPE = "application/vnd.betterman.release-manifest+json";
export const MANIFEST_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
