"""Extract each PDF page's text layer in reading order to doc/text/<source>/pNNN.txt.

The manuals are two-column layouts. A plain text dump interleaves the columns
line by line, so blocks are sorted into left and right columns first (by the
x position of the block's left edge against the page midline), then read top
to bottom. Tables still come out scrambled: table values are always
transcribed from the page images in doc/pages/, never from these files.

Also writes doc/text/<source>/labels.tsv mapping PDF page -> printed page
label, found from the running header/footer.

Usage: .venv/Scripts/python.exe -I scripts/extract_text.py [source-id ...]
"""
import re
import sys
from pathlib import Path

import pymupdf
import yaml

ROOT = Path(__file__).resolve().parent.parent
LABEL_PATTERNS = [
    re.compile(r"^\s*(\d{1,2}-\d{1,3})\b"),  # Kawasaki "1-6 GENERAL INFORMATION"
    re.compile(r"\b(\d{1,2}-\d{1,3})\s*$"),  # Kawasaki "GENERAL INFORMATION 1-7"
    re.compile(r"^\s*(\d{1,3})\s+[A-Z]"),  # Clymer "76 CHAPTER THREE"
    re.compile(r"[A-Z]\s+(\d{1,3})\s*$"),  # Clymer "...TUNE-UP 77"
]


def page_text(page: pymupdf.Page) -> str:
    mid = page.rect.width / 2
    blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
    left = sorted((b for b in blocks if b[0] < mid - 10), key=lambda b: (b[1], b[0]))
    right = sorted((b for b in blocks if b[0] >= mid - 10), key=lambda b: (b[1], b[0]))
    # Full-width blocks (headers, tables spanning the page) start left of mid
    # but end right of it; keep them in the left stream, which is read first.
    parts = [b[4].strip() for b in left] + ["", "-----"] + [b[4].strip() for b in right]
    return "\n\n".join(parts).strip() + "\n"


def label_for(page: pymupdf.Page) -> str:
    top = [b[4].strip().splitlines()[0] for b in page.get_text("blocks") if b[1] < page.rect.height * 0.08 and b[4].strip()]
    bottom = [b[4].strip().splitlines()[-1] for b in page.get_text("blocks") if b[3] > page.rect.height * 0.93 and b[4].strip()]
    for line in top + bottom:
        for pat in LABEL_PATTERNS:
            m = pat.search(line)
            if m:
                return m.group(1)
    return ""


def main(only: list[str]) -> None:
    sources = yaml.safe_load((ROOT / "doc" / "sources.yaml").read_text(encoding="utf-8"))
    for sid, meta in sources.items():
        if only and sid not in only:
            continue
        doc = pymupdf.open(ROOT / meta["file"])
        out = ROOT / meta["text"]
        out.mkdir(parents=True, exist_ok=True)
        labels = []
        empty = 0
        for i, page in enumerate(doc, start=1):
            text = page_text(page)
            if not text.strip():
                empty += 1
                continue  # scanned page without a text layer: left to OCR
            (out / f"p{i:03d}.txt").write_text(text, encoding="utf-8")
            labels.append(f"{i}\t{label_for(page)}")
        (out / "labels.tsv").write_text("pdf_page\tprinted\n" + "\n".join(labels) + "\n", encoding="utf-8")
        print(f"{sid}: {doc.page_count} pages, {empty} without text layer")


if __name__ == "__main__":
    main(sys.argv[1:])
