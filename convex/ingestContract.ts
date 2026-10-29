// Advertised by GET /ingest/contract. Bump the schema version when ingestion
// must see a new Convex deploy before it writes. Keep the same values in
// ingestion/ingestion/convex_client.py. Cross-language alignment lives in
// ingestion/tests/test_ingest_contract.py (no duplicate version expectation).
// v7 retains v6 verified promotion-source reads and CAS, adding per-page
// indexable/popularityScore and declared indexablePageCount to v5 uploads.

export const INGEST_CONTRACT_SCHEMA_VERSION = 7;

export const INGEST_CONTRACT = {
  schemaVersion: INGEST_CONTRACT_SCHEMA_VERSION,
  functions: [
    "ingest.createRelease",
    "ingest.insertStoredPages",
    "ingest.insertLicensePackages",
    "ingest.insertAliases",
    "ingest.insertLicenses",
    "ingest.activateRelease",
    "ingest.getPromotionSource",
    "ingest.promoteActiveReleases",
  ],
  declarationCounts: ["pageCount", "aliasCount", "licenseCount", "providerCount", "indexablePageCount"],
  activatePending: true,
} as const;
