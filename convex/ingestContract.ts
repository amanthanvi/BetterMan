// Advertised by GET /ingest/contract. Bump the schema version when ingestion
// must see a new Convex deploy before it writes. Keep the same values in
// ingestion/ingestion/convex_client.py. Cross-language alignment lives in
// ingestion/tests/test_ingest_contract.py (no duplicate version expectation).
// v6 retains v5 uploads and adds verified promotion-source reads and CAS.
// v7 retains v6, adding content locales (#395): release locale validation,
// per-locale promotion behind the translated-release hold, and the optional
// stored-page documentedVersion.

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
  declarationCounts: ["pageCount", "aliasCount", "licenseCount", "providerCount"],
  activatePending: true,
} as const;
