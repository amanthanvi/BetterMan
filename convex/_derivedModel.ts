import { flagTakesArgument, optionKeys } from "./_optionFlags";
import type { Distro } from "./lib";

export type ArgumentShape = "none" | "required" | "optional";
export type OptionSignature = {
  anchorId: string;
  flags: string[];
  argumentShape: ArgumentShape;
  semantic?: string;
};
export type PortabilityState = "available" | "absent" | "different" | "unknown" | "page-unavailable";
export type DistroPortability = { distro: Distro; state: PortabilityState; reason?: string };
export type SystemPortability = {
  system: "gnu-linux" | "freebsd" | "macos";
  distro: Distro | null;
  state: PortabilityState;
  reason?: string;
};
export type PortabilityRow = {
  anchorId: string;
  flags: string[];
  distros: DistroPortability[];
  systems: SystemPortability[];
};
export type OptionPeer = { distro: Distro; options: OptionSignature[]; truncated?: boolean; pagePresent?: boolean; inputAvailable?: boolean };
export type VerifiedFlagUsage = { flag: string; count: number; source: "examples" | "tldr" };
export type RankedFlags = {
  source: "verified-frequency" | "manual-order";
  flags: Array<{ flag: string; anchorId: string; count: number; sources: Array<"examples" | "tldr"> }>;
};

/** Use the search index's spelling rules, without its 400-row per-page storage cap. */
export function normalizeOptions(options: unknown): OptionSignature[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>();
  const result: OptionSignature[] = [];
  for (const option of options) {
    if (!option || typeof option !== "object") continue;
    const { flags, anchorId, argument, description } = option as { flags?: unknown; anchorId?: unknown; argument?: unknown; description?: unknown };
    if (typeof flags !== "string" || typeof anchorId !== "string" || !anchorId) continue;
    const keys = optionKeys(flags);
    const spelling = flags.trim();
    // Bare separators and symbolic forms are real options even without search-index keys.
    if (["-", "--", "+"].includes(spelling) || /^\+\/\S+$|^-<[^<>\s]+>$/.test(spelling)) keys.push(spelling);
    const owned = [...new Set(keys)].filter((key) => !seen.has(key));
    if (!owned.length) continue;
    for (const key of owned) seen.add(key);
    const arg = typeof argument === "string" ? argument.trim() : "";
    const argumentShape: ArgumentShape = /(?:--[\w-]+|-[A-Za-z0-9])\[/.test(flags) || /^\[.*\]$/.test(arg)
      ? "optional"
      : arg || flagTakesArgument(flags) ? "required" : "none";
    const semantic = owned.includes("--seek") ? "tar-seek"
      : owned.includes("-n") && owned.some((key) => key === "--norecurse" || key === "--no-recursion")
        ? "tar-no-recursion"
        : owned.includes("--use-compress-program") ? "tar-compression-program"
          : owned.includes("-I") && typeof description === "string" && /\b(?:include|patterns?|filenames|file list)\b/i.test(description)
            ? "tar-include-list" : undefined;
    result.push({ anchorId, flags: owned, argumentShape, ...(semantic ? { semantic } : {}) });
  }
  return result;
}

function knownSemantic(option: OptionSignature, distro?: Distro): string | undefined {
  if (option.semantic) return option.semantic;
  if (distro !== "freebsd" && distro !== "macos") return undefined;
  if (option.flags.includes("-n")) return "tar-no-recursion";
  if (option.flags.includes("-I")) return "tar-include-list";
  return undefined;
}

/** Availability is alias-aware; semantic equivalence is asserted only for explicit checks. */
export function buildOptionPortability(
  source: OptionSignature[],
  peers: OptionPeer[],
  supportedDistros: readonly Distro[],
  context?: { name: string; section: string; distro?: Distro },
): PortabilityRow[] {
  const peerIndexes = new Map(peers.map((peer) => {
    const index = new Map<string, OptionSignature>();
    for (const option of peer.options) {
      for (const flag of option.flags) if (!index.has(flag)) index.set(flag, option);
    }
    return [peer.distro, { index, truncated: peer.truncated === true, pagePresent: peer.pagePresent !== false, inputAvailable: peer.inputAvailable !== false }] as const;
  }));
  const gnuRepresentative = (["debian", "ubuntu", "fedora", "arch"] as const)
    .find((distro) => peerIndexes.get(distro)?.pagePresent && peerIndexes.get(distro)?.inputAvailable) ?? null;
  return source.map((option) => {
    const distros: DistroPortability[] = supportedDistros.map((distro) => {
      const peer = peerIndexes.get(distro);
      if (!peer) return { distro, state: "unknown", reason: "no-active-release" };
      if (!peer.pagePresent) return { distro, state: "page-unavailable", reason: "page-not-in-dataset" };
      if (!peer.inputAvailable) return { distro, state: "unknown", reason: "input-unavailable" };
      const candidates = [...new Set(option.flags.flatMap((flag) => {
        const target = peer.index.get(flag);
        return target ? [target] : [];
      }))];
      if (!candidates.length) return peer.truncated
        ? { distro, state: "unknown", reason: "truncated-options" }
        : { distro, state: "absent" };
      for (const target of candidates) {
        // tar -n means seekable on GNU tar and nonrecursive on bsdtar, despite identical arity.
        const sourceMeaning = knownSemantic(option, context?.distro);
        const targetMeaning = knownSemantic(target, distro);
        if (context?.name === "tar" && context.section === "1" &&
          option.flags.includes("-n") && target.flags.includes("-n") &&
          sourceMeaning && targetMeaning && sourceMeaning !== targetMeaning) {
          return { distro, state: "different", reason: "known-tar-n-semantics" };
        }
        if (context?.name === "tar" && context.section === "1" &&
          option.flags.includes("-I") && target.flags.includes("-I") &&
          sourceMeaning && targetMeaning && sourceMeaning !== targetMeaning) {
          return { distro, state: "different", reason: "known-tar-I-semantics" };
        }
        if (option.argumentShape !== target.argumentShape) {
          return { distro, state: "different", reason: "argument-shape" };
        }
      }
      return { distro, state: "available" };
    });
    const systems = ([
      { system: "gnu-linux", distro: gnuRepresentative },
      { system: "freebsd", distro: "freebsd" },
      { system: "macos", distro: "macos" },
    ] as const).map(({ system, distro }): SystemPortability => {
      const cell = distros.find((entry) => entry.distro === distro);
      if (!cell) {
        const gnuPeers = (["debian", "ubuntu", "fedora", "arch"] as const).flatMap((candidate) => {
          const peer = peerIndexes.get(candidate);
          return peer ? [peer] : [];
        });
        const missingPage = system === "gnu-linux" && gnuPeers.length > 0 && gnuPeers.every((peer) => !peer.pagePresent);
        const unavailableInput = system === "gnu-linux" && gnuPeers.some((peer) => peer.pagePresent && !peer.inputAvailable);
        return { system, distro, state: missingPage ? "page-unavailable" : "unknown", reason: missingPage ? "page-not-in-dataset" : unavailableInput ? "input-unavailable" : "no-active-release" };
      }
      return { system, distro, state: cell.state, ...(cell.reason ? { reason: cell.reason } : {}) };
    });
    return { anchorId: option.anchorId, flags: option.flags, distros, systems };
  });
}

export function variantGroups<T extends { distro: Distro; contentSha256: string }>(variants: T[]): Array<{
  contentSha256: string; distros: Distro[];
}> {
  const groups = new Map<string, Distro[]>();
  for (const variant of variants) {
    const distros = groups.get(variant.contentSha256) ?? [];
    if (!distros.includes(variant.distro)) distros.push(variant.distro);
    groups.set(variant.contentSha256, distros);
  }
  return [...groups].map(([contentSha256, distros]) => ({ contentSha256, distros }));
}

/** First-observed marks need existing coverage; a majority change is treated as a restructure. */
export function newInOptions(current: OptionSignature[], previous: OptionSignature[] | null): Array<{
  anchorId: string; flags: string[];
}> {
  if (!previous?.length) return [];
  const old = new Set(previous.flatMap((option) => option.flags));
  const added = current.filter((option) => !option.flags.some((flag) => old.has(flag)));
  if (added.length > current.length / 2) return [];
  return added.map(({ anchorId, flags }) => ({ anchorId, flags }));
}

/** Verified example counts can rank flags; otherwise the source manual's order is explicit. */
export function rankFlags(options: OptionSignature[], verifiedUsage: VerifiedFlagUsage[] = []): RankedFlags {
  const byFlag = new Map(options.flatMap((option) => option.flags.map((flag) => [flag, option] as const)));
  const usage = new Map<string, { count: number; sources: Set<"examples" | "tldr"> }>();
  for (const entry of verifiedUsage) {
    if (!Number.isSafeInteger(entry.count) || entry.count <= 0 || !byFlag.has(entry.flag)) continue;
    const option = byFlag.get(entry.flag)!;
    const current = usage.get(option.anchorId) ?? { count: 0, sources: new Set<"examples" | "tldr">() };
    current.count = Math.min(Number.MAX_SAFE_INTEGER, current.count + entry.count);
    current.sources.add(entry.source);
    usage.set(option.anchorId, current);
  }
  const ranked = options.map((option, index) => ({ option, index, usage: usage.get(option.anchorId) }));
  const measured = ranked.filter((item) => item.usage);
  if (measured.length) measured.sort((a, b) => b.usage!.count - a.usage!.count || a.index - b.index);
  return {
    source: measured.length ? "verified-frequency" : "manual-order",
    flags: (measured.length ? measured : ranked).slice(0, 8).map(({ option, usage: score }) => ({
      flag: option.flags[0], anchorId: option.anchorId, count: score?.count ?? 0,
      sources: score ? [...score.sources].sort() : [],
    })),
  };
}
