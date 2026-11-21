"""Contact sheets for labelling Clymer figures by eye.

Input on stdin: the output of `node build.ts --check`. The script reads
each warning "Clymer Ch.C Fig. N (cited pP) has no extracted photo".

Modes:
  corners  One tile per unlabelled region (index.yaml and index-drawings.yaml)
           on a cited page, the page before or the page after. Each tile is the
           top-left corner of the region, widened by --left and --up points,
           so that a circled figure number in the margin shows.
  pages    One thumbnail per cited page, with each region drawn as a box:
           green with its label, red if it has no label.

Output: PNG sheets in --out, plus corners.json (tile number -> region stem,
page) for corners mode. Read the sheets, then add labels to
data/figures/labels-corners.yaml under "chapter-C". Only add a label if
a step on the same page, or the next or previous page, cites that figure.

Usage:
  node build.ts --check | .venv/Scripts/python.exe -I scripts/figure_review.py corners --out DIR [--left 70] [--up 20]
  node build.ts --check | .venv/Scripts/python.exe -I scripts/figure_review.py pages --out DIR
"""
import argparse
import json
import re
import sys
from pathlib import Path

import pymupdf
import yaml
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FIG = ROOT / "doc" / "figures" / "clymer"  # index.yaml and index-drawings.yaml
LABELS = ROOT / "data" / "figures"


def load():
    idx = yaml.safe_load((FIG / "index.yaml").read_text(encoding="utf-8"))
    extra = FIG / "index-drawings.yaml"
    if extra.exists():
        idx += yaml.safe_load(extra.read_text(encoding="utf-8"))
    labels = {}
    for f in LABELS.glob("labels*.yaml"):
        for m in (yaml.safe_load(f.read_text(encoding="utf-8")) or {}).values():
            labels.update(m)
    src = yaml.safe_load((ROOT / "data" / "sources.yaml").read_text(encoding="utf-8"))["clymer"]
    return idx, labels, pymupdf.open(ROOT / src["file"])


def sheet(tiles, path, cols, w, h):
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new("RGB", (cols * w, rows * (h + 14)), "white")
    d = ImageDraw.Draw(out)
    for j, (caption, im) in enumerate(tiles):
        im = im.copy()
        im.thumbnail((w - 4, h - 4))
        x, y = (j % cols) * w, (j // cols) * (h + 14)
        out.paste(im.convert("RGB"), (x + 2, y + 2))
        d.text((x + 3, y + h), caption, fill="red")
    out.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["corners", "pages"])
    ap.add_argument("--out", required=True)
    ap.add_argument("--left", type=float, default=70)
    ap.add_argument("--up", type=float, default=20)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    cited = {(int(c), int(n), int(p)) for c, n, p in re.findall(r"Ch\.(\d+) Fig\. (\d+) \(cited p(\d+)\)", sys.stdin.read())}
    pages = sorted({p for _, _, p in cited})
    print(f"{len({(c, n) for c, n, _ in cited})} figures without a crop, cited on {len(pages)} pages")
    idx, labels, doc = load()
    if a.mode == "pages":
        sc = 60 / 72
        tiles = []
        for p in pages:
            pix = doc[p - 1].get_pixmap(dpi=60)
            im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            d = ImageDraw.Draw(im)
            for e in (e for e in idx if e["page"] == p):
                n = labels.get(Path(e["file"]).stem)
                box = [v * sc for v in e["bbox_pt"]]
                col = (0, 150, 0) if n else (220, 0, 0)
                d.rectangle(box, outline=col, width=3)
                d.text((box[0] + 4, box[1] + 4), f"{n or '?'} {Path(e['file']).stem}", fill=col)
            tiles.append((f"p{p}", im))
        for s in range(0, len(tiles), 4):
            sheet(tiles[s:s + 4], out / f"pages{s // 4 + 1}.png", 4, 520, 680)
        return
    near = {p + d for p in pages for d in (-1, 0, 1)}
    regions = [e for e in idx if e["page"] in near and Path(e["file"]).stem not in labels]
    tiles, keys = [], []
    for i, e in enumerate(regions):
        x0, y0 = e["bbox_pt"][:2]
        page = doc[e["page"] - 1]
        clip = pymupdf.Rect(x0 - a.left, y0 - a.up, x0 + 45, y0 + 45) & page.rect
        pix = page.get_pixmap(dpi=200, clip=clip, colorspace=pymupdf.csGRAY)
        tiles.append((f"#{i + 1} p{e['page']}", Image.frombytes("L", (pix.width, pix.height), pix.samples)))
        keys.append({"tile": i + 1, "stem": Path(e["file"]).stem, "page": e["page"]})
    for s in range(0, len(tiles), 60):
        sheet(tiles[s:s + 60], out / f"corners{s // 60 + 1}.png", 10, 150, 150)
    (out / "corners.json").write_text(json.dumps(keys, indent=1), encoding="utf-8")
    print(f"{len(regions)} unlabelled regions in {(len(tiles) + 59) // 60} sheets")


if __name__ == "__main__":
    main()
