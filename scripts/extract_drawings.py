"""Find the framed line drawings that extract_figures.py misses.

extract_figures.py keeps only dense regions, so sparse line drawings in a
thin frame are dropped. This second pass masks the text layer first (so that
body text cannot join a region), closes larger gaps, and keeps each large
region that does not overlap a region in index.yaml.

The circled figure number is often just outside the region, so no number is
read here. Labels are added by hand to data/figures/labels-corners.yaml
after a look at a widened corner of each region (see the note in that file).

Output: the crops in static/figures/clymer/p{page}-d{k}.jpg, plus
doc/figures/clymer/index-drawings.yaml with page, bbox in PDF points, ink
density and file.

Usage: .venv/Scripts/python.exe -I scripts/extract_drawings.py PAGE [PAGE ...]
"""
import sys
from pathlib import Path

import numpy as np
import pymupdf
import yaml
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = yaml.safe_load((ROOT / "data" / "sources.yaml").read_text(encoding="utf-8"))["clymer"]
OUT = ROOT / "doc" / "figures" / "clymer"  # index.yaml and index-drawings.yaml
CROPS = ROOT / "static" / "figures" / "clymer"
DPI = 150


def find_drawings(page: pymupdf.Page, old: list[list[float]]) -> list[tuple[list[float], float]]:
    sc = 72 / DPI
    pix = page.get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY)
    gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    ink = gray < 200
    for x0, y0, x1, y1, *_ in page.get_text("words"):
        ink[int(y0 / sc):int(y1 / sc) + 1, int(x0 / sc):int(x1 / sc) + 1] = False
    closed = ndimage.binary_closing(ink, structure=np.ones((15, 15)))
    labels, _ = ndimage.label(ndimage.binary_fill_holes(closed))
    h, w = gray.shape
    out = []
    for sl in ndimage.find_objects(labels):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (x1 - x0) < w * 0.2 or (y1 - y0) < h * 0.06:
            continue
        b = [x0 * sc, y0 * sc, x1 * sc, y1 * sc]
        if any(not (b[2] < o[0] or b[0] > o[2] or b[3] < o[1] or b[1] > o[3]) for o in old):
            continue
        out.append(([round(v, 1) for v in b], round(float(ink[y0:y1, x0:x1].mean()), 3)))
    return out


def main(pages: list[int]) -> None:
    CROPS.mkdir(parents=True, exist_ok=True)
    index = yaml.safe_load((OUT / "index.yaml").read_text(encoding="utf-8"))
    path = OUT / "index-drawings.yaml"
    drawings = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else []
    drawings = [e for e in drawings if e["page"] not in pages]
    doc = pymupdf.open(ROOT / SRC["file"])
    for pno in pages:
        page = doc[pno - 1]
        old = [e["bbox_pt"] for e in index if e["page"] == pno]
        for k, (bbox, density) in enumerate(find_drawings(page, old)):
            pix = page.get_pixmap(dpi=DPI, clip=pymupdf.Rect(*bbox))
            name = f"p{pno:03d}-d{k}.jpg"
            Image.frombytes("RGB", (pix.width, pix.height), pix.samples).save(CROPS / name, quality=85)
            drawings.append({"page": pno, "figure": None, "bbox_pt": bbox, "density": density, "file": f"static/figures/clymer/{name}"})
    drawings.sort(key=lambda e: e["file"])
    path.write_text(yaml.safe_dump(drawings, sort_keys=False), encoding="utf-8")
    print(f"{len(drawings)} drawing regions in index-drawings.yaml")


if __name__ == "__main__":
    main([int(p) for p in sys.argv[1:]])
