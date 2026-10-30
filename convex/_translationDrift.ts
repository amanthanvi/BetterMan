// Drift between a translated page and its English page (#395), computed after
// activation, never per request. Two signals, each claimed only on evidence:
// - older: the translation's .TH release ("GNU tar 1.34") is below the English
//   package's upstream version ("1.35+dfsg-3.1" -> 1.35);
// - missing options: English flags the translation lacks, only when the
//   translation's own options table parsed (else a parse gap would read as drift).

export const MAX_DRIFT_FLAGS = 24;

const DOTTED = /\d+(?:\.\d+)+/g;

/** The last dotted release number in a .TH source field, e.g. "GNU tar 1.34" -> "1.34". */
export function documentedRelease(source: string | undefined): string | null {
  const matches = source?.match(DOTTED);
  return matches?.length ? matches[matches.length - 1] : null;
}

/** A Debian version's upstream release: no epoch, revision or repack suffix ("2:1.35+dfsg-3.1" -> "1.35"). */
export function upstreamRelease(debianVersion: string | undefined): string | null {
  if (!debianVersion) return null;
  const upstream = debianVersion.replace(/^\d+:/, "").replace(/-[^-]*$/, "");
  return upstream.match(/^\d+(?:\.\d+)+/)?.[0] ?? null;
}

/** Numeric, component-wise; missing components count as 0. */
export function compareReleases(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

export type TranslationDrift = {
  documented: string | null;
  english: string | null;
  older: boolean;
  missingFlags: string[];
  missingCount: number;
};

export function translationDrift(args: {
  documentedVersion: string | undefined;
  englishPackageVersion: string | undefined;
  translatedFlags: Iterable<string>;
  englishFlags: Iterable<string>;
}): TranslationDrift | null {
  const documented = documentedRelease(args.documentedVersion);
  const english = upstreamRelease(args.englishPackageVersion);
  const older = documented !== null && english !== null && compareReleases(documented, english) < 0;
  const translated = new Set(args.translatedFlags);
  const missing = translated.size ? [...new Set(args.englishFlags)].filter((flag) => !translated.has(flag)) : [];
  if (!older && !missing.length) return null;
  return { documented, english, older, missingFlags: missing.slice(0, MAX_DRIFT_FLAGS), missingCount: missing.length };
}
