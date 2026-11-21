"""Render every page of the source PDFs to doc/pages/<source>/pNNN.jpg.

These images are what citations link to, and what gets read when a table's
text layer is unreliable. They are regenerable, so doc/pages/ is gitignored.

Usage: .venv/Scripts/python.exe -I scripts/render_pages.py [source-id ...]
"""
import sys
from pathlib import Path

import pymupdf
import yaml

ROOT = Path(__file__).resolve().parent.parent
TARGET_WIDTH_PX = 1400


def main(only: list[str]) -> None:
    sources = yaml.safe_load((ROOT / "data" / "sources.yaml").read_text(encoding="utf-8"))
    for sid, meta in sources.items():
        if only and sid not in only:
            continue
        out = ROOT / "doc" / "pages" / sid
        out.mkdir(parents=True, exist_ok=True)
        doc = pymupdf.open(ROOT / meta["file"])
        for i, page in enumerate(doc, start=1):
            dest = out / f"p{i:03d}.jpg"
            if dest.exists():
                continue
            zoom = TARGET_WIDTH_PX / page.rect.width
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
            pix.save(dest, jpg_quality=82)
        print(f"{sid}: {doc.page_count} pages -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])
