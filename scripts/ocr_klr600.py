"""OCR the scanned KLR600 base manual into doc/text/kawasaki-klr600/pNNN.txt.

The PDF has no text layer. Each page is rendered at 300 dpi and run through
Tesseract (--psm 4: one column of variable-size text, which handles the
manual's two-column body better than auto mode on these scans). The output
is a search aid only: values cited in data/ are checked against the page
image, never taken from OCR alone.

Usage: .venv/Scripts/python.exe -I scripts/ocr_klr600.py
"""
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "doc" / "KLR600manual.pdf"
OUT = ROOT / "doc" / "text" / "kawasaki-klr600"
TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def ocr_page(index: int, png: Path) -> str:
    dest = OUT / f"p{index:03d}"
    subprocess.run(
        [TESSERACT, str(png), str(dest), "--psm", "4", "-l", "eng"],
        check=True,
        capture_output=True,
    )
    return dest.name


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(PDF)
    with tempfile.TemporaryDirectory() as tmp:
        jobs = []
        for i, page in enumerate(doc, start=1):
            if (OUT / f"p{i:03d}.txt").exists():
                continue
            png = Path(tmp) / f"p{i:03d}.png"
            page.get_pixmap(dpi=300, colorspace=pymupdf.csGRAY).save(png)
            jobs.append((i, png))
        with ThreadPoolExecutor(max_workers=6) as pool:
            for name in pool.map(lambda j: ocr_page(*j), jobs):
                print(name, flush=True)


if __name__ == "__main__":
    main()
