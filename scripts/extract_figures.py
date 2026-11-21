"""Find and crop the numbered photos/illustrations on Clymer pages.

Clymer figures are rectangular photos or line drawings with a circled figure
number in the top-left corner. The scan's text layer does not contain those
numbers, so detection is image based:

1. Render the page in grayscale and mark "ink" pixels (darker than paper).
2. Close small gaps and label connected regions. Body text forms regions too,
   so keep only large regions that are wide, tall and densely inked.
3. Crop each region. The figure number is not read here. OCR of the corner
   (read_number) is not reliable on these scans, so the numbers are read by
   eye (scripts/figure_contact_sheet.py and scripts/figure_review.py) and
   kept in data/figures/labels*.yaml.

Output: the crops in static/figures/clymer/p{page}-r{k}.jpg, which the site
serves at /figures/clymer/, plus doc/figures/clymer/index.yaml, which lists
the page, `figure: null`, the bbox in PDF points and the file of each region.

Usage: .venv/Scripts/python.exe -I scripts/extract_figures.py [first_page last_page]
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pymupdf
import yaml
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = yaml.safe_load((ROOT / "data" / "sources.yaml").read_text(encoding="utf-8"))["clymer"]
OUT = ROOT / "doc" / "figures" / "clymer"  # index.yaml
CROPS = ROOT / "static" / "figures" / "clymer"
TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
DPI = 150


def find_regions(gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    ink = gray < 200
    closed = ndimage.binary_closing(ink, structure=np.ones((9, 9)))
    filled = ndimage.binary_fill_holes(closed)
    labels, n = ndimage.label(filled)
    h, w = gray.shape
    boxes = []
    for sl in ndimage.find_objects(labels):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        bw, bh = x1 - x0, y1 - y0
        if bw < w * 0.25 or bh < h * 0.08:
            continue
        density = ink[y0:y1, x0:x1].mean()
        # photos are dense; line drawings are sparse but have a large
        # bounding frame. Body text sits around 0.10-0.18.
        mean_gray = gray[y0:y1, x0:x1].mean()
        if density < 0.30 and mean_gray > 200:
            continue
        boxes.append((x0, y0, x1, y1))
    return boxes


def read_number(img: Image.Image) -> int | None:
    w, h = img.size
    corner = img.crop((0, 0, max(40, int(w * 0.22)), max(40, int(h * 0.22))))
    corner = corner.resize((corner.width * 3, corner.height * 3))
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "c.png"
        corner.save(p)
        r = subprocess.run(
            [TESSERACT, str(p), "stdout", "--psm", "6", "-c", "tessedit_char_whitelist=0123456789"],
            capture_output=True,
            text=True,
        )
    m = re.search(r"\d{1,3}", r.stdout)
    return int(m.group()) if m else None


def main(first: int, last: int) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CROPS.mkdir(parents=True, exist_ok=True)
    index_path = OUT / "index.yaml"
    index = yaml.safe_load(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
    index = [e for e in index if not (first <= e["page"] <= last)]
    doc = pymupdf.open(ROOT / SRC["file"])
    scale = 72 / DPI
    for pno in range(first, last + 1):
        page = doc[pno - 1]
        pix = page.get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY)
        gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
        cpix = page.get_pixmap(dpi=DPI)
        color = Image.frombytes("RGB", (cpix.width, cpix.height), cpix.samples)
        for k, (x0, y0, x1, y1) in enumerate(find_regions(gray)):
            name = f"p{pno:03d}-r{k}.jpg"
            color.crop((x0, y0, x1, y1)).save(CROPS / name, quality=82)
            index.append(
                {
                    "page": pno,
                    "figure": None,  # read by eye into data/figures/labels*.yaml
                    "bbox_pt": [round(x0 * scale, 1), round(y0 * scale, 1), round(x1 * scale, 1), round(y1 * scale, 1)],
                    "file": f"static/figures/clymer/{name}",
                }
            )
    index.sort(key=lambda e: (e["page"], e["bbox_pt"][1]))
    index_path.write_text(yaml.safe_dump(index, sort_keys=False), encoding="utf-8")
    print(f"pages {first}-{last}: {sum(1 for e in index if first <= e['page'] <= last)} regions")


if __name__ == "__main__":
    a = sys.argv[1:]
    main(int(a[0]), int(a[1])) if len(a) == 2 else main(13, 330)
