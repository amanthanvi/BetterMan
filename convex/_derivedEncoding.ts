import type { PageDerivedSummary } from "./derived";
import type { DistroPortability, OptionSignature, SystemPortability } from "./_derivedModel";
import { DISTROS } from "./lib";

export const PORTABILITY_PAGE_SIZE = 128;
export const MAIN_PORTABILITY_ROWS = 256;
export const MAX_PORTABILITY_CHUNKS = 64;
export const MAX_DERIVED_RESPONSE_BYTES = 32_000;
export const PORTABILITY_CELLS: Record<string, Pick<DistroPortability, "state" | "reason">> = {
  a: { state: "available" }, x: { state: "absent" },
  p: { state: "page-unavailable", reason: "page-not-in-dataset" },
  d: { state: "different", reason: "argument-shape" }, n: { state: "different", reason: "known-tar-n-semantics" },
  i: { state: "different", reason: "known-tar-I-semantics" },
  u: { state: "unknown", reason: "no-active-release" }, t: { state: "unknown", reason: "truncated-options" },
  e: { state: "unknown", reason: "input-unavailable" },
};
export type CompactStoredSummary = Omit<PageDerivedSummary, "portability" | "version"> & {
  version: 2;
  portability: {
    systems: Pick<SystemPortability, "system" | "distro">[];
    rows: [anchorId: string, cells: string][];
    total: number; nextOffset: number | null; available: number;
  };
  newInHasMore: boolean;
};
export type PageDerivedResponse = Omit<CompactStoredSummary, "variants"> & { asOf: string; stale: boolean };
export type PortabilityDetailRow = [anchorId: string, flags: string[], cells: string, newIn: boolean];

function cellCode(cell: Pick<DistroPortability, "state" | "reason">): string {
  const code = Object.keys(PORTABILITY_CELLS).find((key) => PORTABILITY_CELLS[key].state === cell.state && PORTABILITY_CELLS[key].reason === cell.reason);
  if (!code) throw new Error("DERIVED_UNKNOWN_CELL");
  return code;
}
export function encodeOptions(options: OptionSignature[]): string {
  return JSON.stringify(options.map((o) => [o.anchorId, o.flags, o.argumentShape, o.semantic ?? null]));
}
export function decodeOptions(json: string): OptionSignature[] {
  return (JSON.parse(json) as [string, string[], OptionSignature["argumentShape"], string | null][])
    .map(([anchorId, flags, argumentShape, semantic]) => ({ anchorId, flags, argumentShape, ...(semantic ? { semantic } : {}) }));
}

export function encodeSummaryParts(summary: PageDerivedSummary): { summaryJson: string; chunks: string[] } {
  const available = Math.min(summary.portability.length, PORTABILITY_PAGE_SIZE * MAX_PORTABILITY_CHUNKS);
  const observed = new Set(summary.newIn.map((mark) => mark.anchorId));
  const chunks: string[] = [];
  for (let offset = 0; offset < available; offset += PORTABILITY_PAGE_SIZE) {
    const rows: PortabilityDetailRow[] = summary.portability.slice(offset, offset + PORTABILITY_PAGE_SIZE)
      .map((row) => [row.anchorId, row.flags, DISTROS.map((distro) => cellCode(row.distros.find((cell) => cell.distro === distro) ?? { state: "unknown", reason: "no-active-release" })).join(""), observed.has(row.anchorId)]);
    chunks.push(JSON.stringify(rows));
  }
  const main: CompactStoredSummary = {
    ...summary, version: 2,
    portability: {
      systems: summary.portability[0]?.systems.map(({ system, distro }) => ({ system, distro })) ?? [],
      rows: summary.portability.slice(0, MAIN_PORTABILITY_ROWS).map((row) => [row.anchorId, row.systems.map(cellCode).join("")]),
      total: summary.portability.length, available,
      nextOffset: summary.portability.length > MAIN_PORTABILITY_ROWS ? MAIN_PORTABILITY_ROWS : null,
    },
    newIn: summary.newIn.slice(0, PORTABILITY_PAGE_SIZE), newInHasMore: summary.newIn.length > PORTABILITY_PAGE_SIZE,
  };
  const bytes = () => new TextEncoder().encode(JSON.stringify(main)).length;
  while (bytes() > MAX_DERIVED_RESPONSE_BYTES - 512 && main.portability.rows.length) main.portability.rows.pop();
  if (main.portability.rows.length < summary.portability.length) main.portability.nextOffset = main.portability.rows.length;
  while (bytes() > MAX_DERIVED_RESPONSE_BYTES - 512 && main.newIn.length) { main.newIn.pop(); main.newInHasMore = true; }
  if (bytes() > MAX_DERIVED_RESPONSE_BYTES - 512) throw new Error("DERIVED_SUMMARY_LIMIT");
  return { summaryJson: JSON.stringify(main), chunks };
}
export function encodeSummary(summary: PageDerivedSummary | CompactStoredSummary): string {
  return summary.version === 2 ? JSON.stringify(summary) : encodeSummaryParts(summary).summaryJson;
}
export function decodeSummary(json: string): CompactStoredSummary {
  const summary = JSON.parse(json) as CompactStoredSummary;
  if (summary.version !== 2) throw new Error("DERIVED_SUMMARY_VERSION");
  return summary;
}
export function publicSummary(summary: CompactStoredSummary, asOf: string, stale: boolean): PageDerivedResponse {
  const { variants: _variants, ...result } = summary;
  return { ...result, asOf, stale };
}
