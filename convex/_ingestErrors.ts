// Convex checks mutation arguments against their validators before the handler
// runs and surfaces a mismatch to the calling action as an Error whose message
// starts with the runtime's own error name. convex-test renders the same
// failure as "Validator error: ...".
const ARGUMENT_VALIDATION_PREFIXES = ["ArgumentValidationError", "Validator error"];

// An Error thrown inside a mutation handler reaches the calling action as
// "Uncaught Error: <message>\n    at handler (...)". convex-test passes the
// message through unchanged.
const UNCAUGHT_PREFIX = "Uncaught Error: ";

// Errors thrown by the ingest mutations that describe the request rather than a
// server fault. The client must not retry these; anything else stays a 500.
const DOMAIN_ERROR_STATUS: Record<string, number> = {
  INVALID_RELEASE_MANIFEST: 400,
  INVALID_MAN_PAGE_ROUTE: 400,
  INVALID_ALIAS_ROUTE: 400,
  EMPTY_LICENSE_TEXT: 400,
  UNDECLARED_LICENSE_PACKAGE: 400,
  UNDECLARED_MAN_PAGE_SECTION: 400,
  ALIAS_TARGET_NOT_FOUND: 400,
  RELEASE_NOT_FOUND: 404,
  ACTIVE_RELEASE_NOT_FOUND: 404,
  DUPLICATE_MAN_PAGE_ROUTE: 409,
  RELEASE_SEALED: 409,
  RELEASE_PRUNING: 409,
  RELEASE_NOT_SEALED: 409,
  RELEASE_MANIFEST_CONFLICT: 409,
  RELEASE_MANIFEST_UNDECLARED: 409,
  RELEASE_MANIFEST_EXCEEDED: 409,
  RELEASE_MANIFEST_EMPTY: 409,
  RELEASE_MANIFEST_UNVERIFIED: 409,
  RELEASE_MANIFEST_INCOMPLETE: 409,
  RELATED_METADATA_INCOMPLETE: 409,
  RELATED_METADATA_BACKFILL_FAILED: 409,
};

// The validation message repeats the rejected value, which may be a whole page.
const MAX_ERROR_MESSAGE_CHARS = 1_000;

export type IngestClientError = { status: number; code: string; message: string };

export function ingestClientError(error: unknown): IngestClientError | null {
  if (!(error instanceof Error)) return null;
  const [firstLine] = error.message.split("\n", 1);
  if (ARGUMENT_VALIDATION_PREFIXES.some((prefix) => firstLine.startsWith(prefix))) {
    return { status: 400, code: "INVALID_INGEST_PAYLOAD", message: error.message.slice(0, MAX_ERROR_MESSAGE_CHARS) };
  }
  const code = firstLine.startsWith(UNCAUGHT_PREFIX) ? firstLine.slice(UNCAUGHT_PREFIX.length) : firstLine;
  if (!Object.hasOwn(DOMAIN_ERROR_STATUS, code)) return null;
  return { status: DOMAIN_ERROR_STATUS[code], code, message: code === "RELATED_METADATA_BACKFILL_FAILED"
    ? "Related metadata batch failed three attempts without progress; repair the cause and re-arm the backfill before resuming activation." : code };
}
