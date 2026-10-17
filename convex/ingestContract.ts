// Advertised by GET /ingest/contract. Bump the schema version when ingestion
// must see a new Convex deploy before it writes. Keep the same values in
// ingestion/ingestion/convex_client.py.

export const INGEST_CONTRACT_SCHEMA_VERSION = 1;

export const INGEST_CONTRACT = {
  schemaVersion: INGEST_CONTRACT_SCHEMA_VERSION,
  functions: [
    "ingest.createRelease",
    "ingest.insertStoredPages",
    "ingest.insertAliases",
    "ingest.insertLicenses",
    "ingest.activateRelease",
  ],
  declarationCounts: ["pageCount", "aliasCount", "licenseCount"],
  activatePending: true,
} as const;
