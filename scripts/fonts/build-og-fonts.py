"""Build the share-card fonts the OG image routes rasterize with (nextjs/lib/og/card.tsx).

Satori, which renders the cards, reads neither variable fonts, WOFF2 nor
OpenType features (no small caps, no old-style figures, no ligature control).
So each voice the card needs is a static WOFF instance with the feature baked
into its character map:

- bm-text-og-roman / -semibold / -italic: BM Text at 400, 600 and italic 400,
  digits mapped to old-style figures.
- bm-text-og-caps: BM Text 400 in all small caps (smcp for lower case, c2sc
  for capitals) with old-style figures, for running heads and labels.
- jetbrains-mono-og-regular / -semibold: flags and arguments. No GSUB at all,
  so code ligatures (`calt`) cannot form.

BM Text keeps only `kern`: no `liga`, so a command name such as `fflush` is
never set with a ligature. The ranges are Latin, Latin Extended, Greek and
Cyrillic, as on the site; any other script falls back to what next/og loads.

Usage, from the repository root, with fontTools and brotli installed:

    python3 scripts/fonts/build-og-fonts.py \\
      <SourceSerif4Variable-Roman.ttf> <SourceSerif4Variable-Italic.ttf> \\
      <JetBrainsMono-Regular.ttf> <JetBrainsMono-SemiBold.ttf>

Source Serif 4 is the VAR/*.ttf of release 4.005R, as for build-bm-text.py.
JetBrains Mono is the static 2.211 Regular and SemiBold (OFL, no Reserved Font
Name). Output goes to nextjs/public/fonts/og/; set SOURCE_DATE_EPOCH to
reproduce the committed files byte for byte.
"""

import importlib.util
import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "nextjs" / "public" / "fonts" / "og"

_spec = importlib.util.spec_from_file_location("build_bm_text", HERE / "build-bm-text.py")
bm_text = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bm_text)

SERIF_RANGES = ",".join(bm_text.SUBSETS[name] for name in ("latin", "latin-ext", "greek", "cyrillic"))
MONO_RANGES = bm_text.SUBSETS["latin"]


def single_substitutions(font, feature):
    """glyph -> glyph for every single substitution the feature applies."""
    gsub = font["GSUB"].table
    mapping = {}
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != feature:
            continue
        for index in record.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[index]
            for sub in lookup.SubTable:
                if lookup.LookupType == 7:
                    sub = sub.ExtSubTable
                if getattr(sub, "mapping", None):
                    for source, target in sub.mapping.items():
                        mapping.setdefault(source, target)
    return mapping


def bake(font, features):
    """Point the character map at the glyphs these features would substitute."""
    maps = [single_substitutions(font, feature) for feature in features]
    for table in font["cmap"].tables:
        if not table.isUnicode():
            continue
        for codepoint, glyph in list(table.cmap.items()):
            for mapping in maps:
                if glyph in mapping:
                    table.cmap[codepoint] = mapping[glyph]
                    break


def save(font, unicodes, features, target):
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    font = TTFont(buffer)
    options = subset.Options()
    options.layout_features = features
    options.flavor = "woff"
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.hinting = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.flavor = "woff"
    path = OUT / target
    font.save(path)
    print(f"{path.relative_to(OUT.parents[3])}: {path.stat().st_size} bytes")


def serif(source, style, weight, bake_features, target):
    font = TTFont(source)
    instancer.instantiateVariableFont(font, {"wght": weight, "opsz": 20}, inplace=True)
    bm_text.rename(font, style)
    bake(font, bake_features)
    save(font, bm_text.ranges(SERIF_RANGES), ["kern"], target)


def mono(source, target):
    save(TTFont(source), bm_text.ranges(MONO_RANGES), [], target)


def main():
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    roman, italic, mono_regular, mono_semibold = sys.argv[1:]
    OUT.mkdir(parents=True, exist_ok=True)
    serif(roman, "Roman", 400, ["onum"], "bm-text-og-roman.woff")
    serif(roman, "Semibold", 600, ["onum"], "bm-text-og-semibold.woff")
    serif(italic, "Italic", 400, ["onum"], "bm-text-og-italic.woff")
    # c2sc first: capitals become small capitals, then smcp takes the lower case.
    serif(roman, "Caps", 400, ["c2sc", "smcp", "onum"], "bm-text-og-caps.woff")
    mono(mono_regular, "jetbrains-mono-og-regular.woff")
    mono(mono_semibold, "jetbrains-mono-og-semibold.woff")


if __name__ == "__main__":
    main()
