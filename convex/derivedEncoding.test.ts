import { expect, it } from "vitest";
import { normalizeOptions, buildOptionPortability } from "./_derivedModel";
import { encodeSummaryParts, decodeSummary, publicSummary, MAX_DERIVED_RESPONSE_BYTES } from "./_derivedEncoding";
import type { PageDerivedSummary } from "./derived";
import { DISTROS } from "./lib";
it("bounds a 3,009-option main response and keeps distro details paginated", () => {
  const options = normalizeOptions(Array.from({ length: 3009 }, (_, i) => ({ anchorId: `f${i}`, flags: `--flag-${i}` })));
  const summary: PageDerivedSummary = { version: 1, variants: [], variantGroups: [], portability: buildOptionPortability(options, [{ distro: "debian", options }], DISTROS),
    newIn: [], previousDatasetReleaseId: null, mostUsed: { source: "manual-order", flags: [] }, referencedBy: { items: [], hasMore: false }, family: null, package: null };
  const packed = encodeSummaryParts(summary);
  const result = publicSummary(decodeSummary(packed.summaryJson), "snapshot", false);
  expect(result.portability.rows).toHaveLength(256);
  expect(result.portability.total).toBe(3009);
  expect(result.portability.nextOffset).toBe(256);
  expect(result.portability.rows[0][1]).toBe("auu");
  expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(MAX_DERIVED_RESPONSE_BYTES);
  expect(JSON.stringify(result)).not.toContain('"state":"available"');
  expect(packed.chunks).toHaveLength(24);
  expect(packed.chunks.flatMap((chunk) => JSON.parse(chunk))).toHaveLength(3009);
});
