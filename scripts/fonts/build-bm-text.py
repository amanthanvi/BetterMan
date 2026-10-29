"""Build the BM Text web fonts from Source Serif 4.

BM Text is a subset of Adobe's Source Serif 4 (SIL OFL 1.1, Reserved Font
Name "Source"). The OFL forbids a Modified Version from using a Reserved Font
Name, so every name-table entry that presents the family is rewritten to
"BM Text". Copyright, trademark and license entries stay as published.

Usage, from the repository root, with fontTools and brotli installed:

    python3 scripts/fonts/build-bm-text.py <SourceSerif4Variable-Roman.ttf> <SourceSerif4Variable-Italic.ttf>

The inputs are the VAR/*.ttf files of the 4.005R release
(https://github.com/adobe-fonts/source-serif/releases/tag/4.005R).
Output goes to nextjs/public/fonts/bm-text/. fontTools stamps head.modified with
the build time; set SOURCE_DATE_EPOCH to reproduce the committed files byte for byte.
Otherwise only that timestamp differs.
"""

import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parents[2] / "nextjs" / "public" / "fonts" / "bm-text"

# Keep these in sync with the unicode-range descriptors in nextjs/app/globals.css.
# Only blocks Source Serif 4.005 has glyphs for: it has no Greek Extended
# (polytonic), Latin Extended-C/D or Cyrillic Extended-A/B/C, so those
# characters fall back through the rest of the serif stack.
SUBSETS = {
    "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
    "U+2000-206F,U+20AC,U+2122,U+2190-2195,U+2212,U+2215,U+2264-2265,U+FEFF,U+FFFD",
    "latin-ext": "U+0100-0130,U+0132-0151,U+0154-02BA,U+02BD-02C5,U+02C7-02CC,U+02DD-02FF,"
    "U+0300-0303,U+0305-0307,U+0309-0328,U+032A-036F,U+1D00-1DBF,U+1E00-1EFF,U+20A0-20AB,U+20AD-20C0,"
    "U+2113",
    "greek": "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF",
    "cyrillic": "U+0400-052F,U+20B4,U+2116",
}

# Small caps, figure styles, ligatures and the shaping features scripts need.
FEATURES = ["kern", "liga", "clig", "calt", "ccmp", "locl", "mark", "mkmk", "smcp", "c2sc", "onum", "lnum", "pnum", "tnum", "case", "sups"]

FAMILY = "BM Text"
PS_FAMILY = "BMText"


def ranges(spec):
    out = []
    for part in spec.split(","):
        part = part.strip().removeprefix("U+")
        lo, _, hi = part.partition("-")
        out.extend(range(int(lo, 16), int(hi or lo, 16) + 1))
    return out


def rename(font, style):
    name = font["name"]
    for record in list(name.names):
        if record.nameID in (1, 16):
            record.string = FAMILY
        elif record.nameID == 4:
            record.string = f"{FAMILY} {style}" if style != "Regular" else FAMILY
        elif record.nameID in (3, 6):
            record.string = f"{PS_FAMILY}-{style}"
        elif record.nameID == 25:
            record.string = PS_FAMILY
        elif record.nameID in (17,):
            record.string = style
        elif record.nameID not in (0, 7, 13, 14):
            # Named-instance and STAT names, e.g. "SourceSerif4Variable-CaptionRegular".
            text = record.toUnicode()
            text = text.replace("SourceSerif4Variable", PS_FAMILY).replace("SourceSerif4", PS_FAMILY)
            record.string = text.replace("Source Serif 4", FAMILY)
    for record in name.names:
        text = record.toUnicode()
        if record.nameID not in (0, 7, 13, 14) and "Source" in text:
            raise SystemExit(f"name {record.nameID} still carries the reserved name: {text!r}")


def build(source, style, axes):
    for subset_name, spec in SUBSETS.items():
        part = TTFont(source)
        instancer.instantiateVariableFont(part, axes, inplace=True)
        rename(part, style)
        # Reload the instanced font so the subsetter sees fully decompiled tables.
        buffer = io.BytesIO()
        part.save(buffer)
        buffer.seek(0)
        part = TTFont(buffer)
        options = subset.Options()
        options.layout_features = FEATURES
        options.flavor = "woff2"
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.notdef_outline = True
        options.hinting = False
        options.desubroutinize = True
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=ranges(spec))
        subsetter.subset(part)
        target = OUT / f"bm-text-{style.lower()}-{subset_name}.woff2"
        part.flavor = "woff2"
        part.save(target)
        print(f"{target.relative_to(OUT.parents[3])}: {target.stat().st_size} bytes")


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    OUT.mkdir(parents=True, exist_ok=True)
    # The optical-size axis is pinned at its text default: keeping it more than
    # doubles the Latin roman. Roman keeps regular through semibold.
    build(sys.argv[1], "Roman", {"wght": (400, 600), "opsz": 20})
    # Italic is only set at regular weight, for replaceable arguments and subheadings.
    build(sys.argv[2], "Italic", {"wght": 400, "opsz": 20})


if __name__ == "__main__":
    main()
