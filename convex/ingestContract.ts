// Advertised by GET /ingest/contract. Bump the schema version when ingestion
// must see a new Convex deploy before it writes. Keep the same values in
// ingestion/ingestion/convex_client.py. Cross-language alignment lives in
// ingestion/tests/test_ingest_contract.py (no duplicate version expectation).
// v6 retains v5 uploads and adds verified promotion-source reads and CAS.
// v7 is index by demand (#445) and v8 the B2 full extractions (#394).
// v9 adds content locales (#395): release locale validation, per-locale
// promotion behind the translated-release hold, and the optional stored-page
// documentedVersion. Every release-contract request now carries the exact
// version in INGEST_CONTRACT_HEADER; any other version is rejected.

export const INGEST_CONTRACT_SCHEMA_VERSION = 9;

export const INGEST_CONTRACT_HEADER = "x-betterman-ingest-contract";

export const INGEST_CONTRACT = {
  schemaVersion: INGEST_CONTRACT_SCHEMA_VERSION,
  storedLicenseText: true,
  acquisitions: ["deb-extraction", "ubuntu-deb-extraction", "fedora-rpm-extraction", "arch-pkg-extraction", "alpine-apk-extraction"],
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
