"""Convert the TeX Gyre Heros OpenType fonts to WOFF2 for the site.

WOFF2 is a lossless, compressed wrapper for a font, so the glyphs do not
change. The sources (from CTAN, GUST Font License) are in site/fonts-src/.
The output goes to site/static/fonts/, which the build copies to the site.

Usage: .venv/Scripts/python.exe -I scripts/make_woff2.py
Needs: pip install fonttools brotli
"""
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "site" / "fonts-src"
OUT = ROOT / "site" / "static" / "fonts"
# Only the faces that the site uses. The logo slants the bold face with CSS,
# so the italic sources stay in fonts-src but are not converted.
FACES = ["regular", "bold"]

for otf in [SRC / f"texgyreheros-{face}.otf" for face in FACES]:
    font = TTFont(otf)
    font.flavor = "woff2"
    out = OUT / (otf.stem + ".woff2")
    font.save(out)
    print(f"{otf.name}: {otf.stat().st_size // 1024} KB -> {out.name}: {out.stat().st_size // 1024} KB")
