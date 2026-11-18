"""Make the site fonts: TeX Gyre Heros as WOFF2, cut to the characters in
site/fonts-src/charset.txt.

WOFF2 is a lossless, compressed wrapper for a font. The cut keeps only the
glyphs for the listed characters (and the glyphs that their layout features
need), so each face goes from about 51 KB to about 21 KB. Hinting stays, so
small text stays sharp on Windows. The sources (from CTAN, GUST Font License)
are in site/fonts-src/. The output goes to site/static/fonts/, which the build
copies to the site. The build warns if a page uses a character outside the list.

Usage: .venv/Scripts/python.exe -I scripts/make_woff2.py
Needs: pip install fonttools brotli
"""
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "site" / "fonts-src"
OUT = ROOT / "site" / "static" / "fonts"
# Only the faces that the site uses. The logo slants the bold face with CSS,
# so the italic sources stay in fonts-src but are not converted.
FACES = ["regular", "bold"]


def charset() -> list[int]:
    codes = []
    for line in (SRC / "charset.txt").read_text(encoding="utf-8").splitlines():
        m = re.match(r"U\+([0-9A-Fa-f]{4,6})(?:-([0-9A-Fa-f]{4,6}))?", line)
        if m:
            first = int(m[1], 16)
            codes += range(first, int(m[2] or m[1], 16) + 1)
    return codes


for face in FACES:
    otf = SRC / f"texgyreheros-{face}.otf"
    font = TTFont(otf)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    cut = subset.Subsetter(options)
    cut.populate(unicodes=charset())
    cut.subset(font)
    font.flavor = "woff2"
    out = OUT / (otf.stem + ".woff2")
    font.save(out)
    print(f"{otf.name}: {otf.stat().st_size // 1024} KB -> {out.name}: {out.stat().st_size / 1024:.1f} KB")
