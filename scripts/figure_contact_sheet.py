"""Build a contact sheet of figure-number corners for manual labelling.

Each detected figure region's top-left corner (where Clymer prints the
circled figure number) is tiled into one image with the region's file stem
printed under it, so the numbers can be read in one pass and recorded in
data/figures/labels.yaml.

Usage: .venv/Scripts/python.exe -I scripts/figure_contact_sheet.py first last out.png
"""
import sys
from pathlib import Path

import yaml
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
first, last, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
index = yaml.safe_load((ROOT / "doc/figures/clymer/index.yaml").read_text(encoding="utf-8"))
items = [e for e in index if first <= e["page"] <= last]
TILE, COLS = 110, 8
rows = (len(items) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * TILE, rows * (TILE + 18)), "white")
draw = ImageDraw.Draw(sheet)
for i, e in enumerate(items):
    img = Image.open(ROOT / e["file"])
    c = img.crop((0, 0, min(img.width, 70), min(img.height, 70))).resize((TILE - 6, TILE - 6))
    x, y = (i % COLS) * TILE, (i // COLS) * (TILE + 18)
    sheet.paste(c, (x + 3, y + 3))
    draw.text((x + 4, y + TILE), Path(e["file"]).stem, fill="red")
sheet.save(out)
print(len(items), "tiles")
