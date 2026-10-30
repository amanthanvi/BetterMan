"""Build BetterMan's favicon, app icons and mark from the BM Text share-card font.

The mark is a semibold BM Text "b", the wordmark's initial, in ink on paper,
over a short red rule: the search field with focus, where the one red turns its
underline red. Square, no border, no shadow. The glyph is drawn as a path, so
the SVGs depend on no font.

- favicon.svg and favicon-16/32.png (and favicon.ico) use a pixel-fitted 32-unit
  grid: a larger letter and a rule that lands on whole pixels at 16 and 32.
- betterman-mark.svg, apple-touch-icon.png and icon-192/512.png use a 512-unit
  grid whose letter and rule sit inside the maskable safe zone (a centred
  circle of 40% radius), so icon-512.png also serves as the maskable icon.

Usage, from the repository root, with fontTools and Pillow installed and
rsvg-convert (librsvg) on PATH:

    python3 scripts/icons/build-icons.py

Input is nextjs/public/fonts/og/bm-text-og-semibold.woff
(scripts/fonts/build-og-fonts.py). Output goes to nextjs/public/.
"""

import io
import subprocess
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "nextjs" / "public"
FONT = PUBLIC / "fonts" / "og" / "bm-text-og-semibold.woff"

PAPER = "#f9f7f2"
INK = "#1c1a16"
ACCENT = "#a3261b"


def glyph_path(size, letter_height, rule_gap, rule_height, rule_width):
    """The letter's SVG path and the rule's rectangle, centred on a size x size square."""
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    name = font.getBestCmap()[ord("b")]
    bounds = BoundsPen(glyphs)
    glyphs[name].draw(bounds)
    x_min, y_min, x_max, y_max = bounds.bounds
    scale = letter_height / (y_max - y_min)
    width = (x_max - x_min) * scale
    block = letter_height + rule_gap + rule_height
    left = (size - width) / 2
    top = (size - block) / 2
    baseline = top + letter_height
    pen = SVGPathPen(glyphs, ntos=lambda value: f"{value:.2f}".rstrip("0").rstrip("."))
    # Font units are y-up; the SVG is y-down from the letter's top-left.
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, left - x_min * scale, baseline + y_min * scale)))
    rule = (round((size - rule_width) / 2, 2), round(baseline + rule_gap, 2), rule_width, rule_height)
    return pen.getCommands(), rule


def svg(size, letter_height, rule_gap, rule_height, rule_width):
    path, (x, y, w, h) = glyph_path(size, letter_height, rule_gap, rule_height, rule_width)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="BetterMan">\n'
        "  <title>BetterMan</title>\n"
        f'  <rect width="{size}" height="{size}" fill="{PAPER}"/>\n'
        f'  <path fill="{INK}" d="{path}"/>\n'
        f'  <rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" fill="{ACCENT}"/>\n'
        "</svg>\n"
    )


def png(source, target, pixels):
    subprocess.run(["rsvg-convert", "-w", str(pixels), "-h", str(pixels), "-o", str(target), str(source)], check=True)
    print(f"{target.relative_to(ROOT)}: {target.stat().st_size} bytes")


def main():
    # 32 units: the letter from y 4 to the baseline at 24, the rule from 26 to 28 and x 8 to 24,
    # so every edge of the rule lands on a whole pixel at 16 and 32.
    small = PUBLIC / "favicon.svg"
    small.write_text(svg(32, 20, 2, 2, 16))
    # 512 units: letter and rule inside the maskable safe zone.
    large = PUBLIC / "betterman-mark.svg"
    large.write_text(svg(512, 272, 34, 24, 216))
    for path in (small, large):
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size} bytes")

    png(small, PUBLIC / "favicon-16.png", 16)
    png(small, PUBLIC / "favicon-32.png", 32)
    png(large, PUBLIC / "apple-touch-icon.png", 180)
    png(large, PUBLIC / "icon-192.png", 192)
    png(large, PUBLIC / "icon-512.png", 512)

    frames = []
    for pixels in (16, 32, 48):
        buffer = io.BytesIO(subprocess.run(["rsvg-convert", "-w", str(pixels), "-h", str(pixels), str(small)], check=True, capture_output=True).stdout)
        frames.append(Image.open(buffer).convert("RGBA"))
    ico = PUBLIC / "favicon.ico"
    frames[-1].save(ico, format="ICO", sizes=[frame.size for frame in frames], append_images=frames[:-1])
    print(f"{ico.relative_to(ROOT)}: {ico.stat().st_size} bytes")


if __name__ == "__main__":
    main()
