// Advertised by GET /ingest/contract. Bump the schema version when ingestion
// must see a new Convex deploy before it writes. Keep the same values in
// ingestion/ingestion/convex_client.py. Cross-language alignment lives in
// ingestion/tests/test_ingest_contract.py (no duplicate version expectation).
// MERGE #430/#431: each independently introduces v2. The second to merge must
// rebase, bump both constants to v3, and retain package batches AND stored-page
// symbols across the contract functions, validators, and Python payloads.

export const INGEST_CONTRACT_SCHEMA_VERSION = 2;

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
