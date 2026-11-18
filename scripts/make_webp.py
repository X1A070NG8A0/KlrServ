"""Write a WebP copy of each figure crop in doc/figures/clymer/.

The JPEG crops stay the source: the figure scripts make JPEGs, and this
script makes pNNN-xK.webp next to each pNNN-xK.jpg. WebP at quality 80 is
about half the size at the same look. The build uses the WebP file when it
exists. Run this again after new crops are made; it skips crops whose WebP
copy is newer than the JPEG.

Usage: .venv/Scripts/python.exe -I scripts/make_webp.py
"""
from pathlib import Path

from PIL import Image

FIG = Path(__file__).resolve().parent.parent / "doc" / "figures" / "clymer"

made = before = after = 0
for jpg in sorted(FIG.glob("*.jpg")):
    webp = jpg.with_suffix(".webp")
    if webp.exists() and webp.stat().st_mtime >= jpg.stat().st_mtime:
        continue
    Image.open(jpg).save(webp, "WEBP", quality=80, method=6)
    made += 1
    before += jpg.stat().st_size
    after += webp.stat().st_size
if made:
    print(f"{made} WebP files: {before / 1024:.0f} KB of JPEG -> {after / 1024:.0f} KB of WebP")
else:
    print("All WebP files are up to date.")
