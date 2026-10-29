// Advertised by GET /ingest/contract. Bump the schema version when ingestion
// must see a new Convex deploy before it writes. Keep the same values in
// ingestion/ingestion/convex_client.py. Cross-language alignment lives in
// ingestion/tests/test_ingest_contract.py (no duplicate version expectation).
// v4 retains license-package batches and derived option extractor provenance,
// and adds stored-page symbols and optional option-argument metadata.

export const INGEST_CONTRACT_SCHEMA_VERSION = 4;

export const INGEST_CONTRACT = {
  schemaVersion: INGEST_CONTRACT_SCHEMA_VERSION,
  functions: [
    "ingest.createRelease",
    "ingest.insertStoredPages",
    "ingest.insertLicensePackages",
    "ingest.insertAliases",
    "ingest.insertLicenses",
    "ingest.activateRelease",
  ],
  declarationCounts: ["pageCount", "aliasCount", "licenseCount"],
  activatePending: true,
} as const;
