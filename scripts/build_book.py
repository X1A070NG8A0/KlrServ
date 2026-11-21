"""Turn the Clymer PDF's text layer into a structured book: chapters, sections
(from the transcribed table of contents), sub-headings, paragraphs, numbered
steps and NOTE/CAUTION/WARNING callouts, each tagged with its PDF page.

Input:  the Clymer PDF, doc/book/clymer-toc.yaml, doc/figures/clymer/index.yaml
Output: doc/book/clymer.json

The text is the scan's OCR layer, re-flowed. Writers read it when they
paraphrase a chapter into pagedef/book/chNN/index.yaml, and the data checks
take the section ids from it. It is never the source of a spec value: those
come from the hand-transcribed tables in pagedef/specs/. Lines inside detected
photo regions (callout letters, labels) and the running header are dropped.
Chapter-end spec tables are replaced by references to the transcribed tables.

A small, fixed set of OCR corrections is applied (see FIXES). Each one maps a
recurring scan artifact to the character actually printed (e.g. "Nem" for
"N•m"); nothing else in the text is altered.

Usage: .venv/Scripts/python.exe -I scripts/build_book.py
"""
import json
import re
import statistics
from pathlib import Path

import pymupdf
import yaml

ROOT = Path(__file__).resolve().parent.parent
SOURCES = yaml.safe_load((ROOT / "data/sources.yaml").read_text(encoding="utf-8"))
TOC = yaml.safe_load((ROOT / "doc/book/clymer-toc.yaml").read_text(encoding="utf-8"))
FIG_INDEX = yaml.safe_load((ROOT / "doc/figures/clymer/index.yaml").read_text(encoding="utf-8")) or []
OFFSET = 12  # PDF page = printed page + 12

FIXES = [
    (re.compile(r"(\d)\s*N[e•·*]m\b"), r"\1 N•m"),  # "23 Nem" -> "23 N•m"
    (re.compile(r"\b(ft|in)\.-\s*Ib\."), r"\1.-lb."),  # "ft.-Ib." -> "ft.-lb."
    (re.compile(r"\bIf(the|it|a|any|necessary)\b"), r"If \1"),  # "Ifthe" -> "If the"
]
CALLOUTS = {"NOTE": "note", "CAUTION": "caution", "WARNING": "warning"}
SMALL = {"a", "an", "and", "the", "of", "to", "in", "on", "for", "or", "with", "at", "by", "from"}


def norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def fix(s: str) -> str:
    for pat, rep in FIXES:
        s = pat.sub(rep, s)
    return s


def page_lines(page: pymupdf.Page, figs: list[list[float]]) -> list[dict]:
    """Text lines in reading order (left column, then right), with geometry."""
    h, w = page.rect.height, page.rect.width
    mid = w / 2
    out = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            text = "".join(sp["text"] for sp in ln["spans"]).strip()
            if not text:
                continue
            x0, y0, x1, y1 = ln["bbox"]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if y1 < h * 0.075:  # running header
                continue
            if any(f[0] <= cx <= f[2] and f[1] <= cy <= f[3] for f in figs):
                continue  # text inside a photo (callout letters etc.)
            full = x0 < mid - 20 and x1 > mid + 20
            col = 0 if (x0 < mid - 10 or full) else 1
            out.append({"t": text, "x0": x0, "x1": x1, "y0": y0, "y1": y1, "col": col, "full": full})
    # Full-width lines (tables, wide headings) split the page into horizontal
    # bands; within a band read the left column, then the right.
    seps = sorted(l["y0"] for l in out if l["full"])
    def band(l: dict) -> int:
        return sum(1 for s in seps if s < l["y0"] - 1)
    out.sort(key=lambda l: (band(l), 0 if l["full"] else 1, l["col"], round(l["y0"] / 3), l["x0"]))
    merged: list[dict] = []
    for l in out:
        if merged and merged[-1]["col"] == l["col"] and abs(merged[-1]["y0"] - l["y0"]) < 3:
            merged[-1]["t"] += " " + l["t"]
            merged[-1]["x1"] = max(merged[-1]["x1"], l["x1"])
        else:
            merged.append(dict(l))
    return merged


def is_subheading(line: dict, prev_gap: float, lh: float) -> bool:
    t = line["t"].strip()
    if len(t) > 55 or len(t) < 4 or t.endswith((".", ",", ":", ";", "-")) or re.match(r"^(\d+[A-Z]?|[a-z])\.", t):
        return False
    if t.upper() == t:
        return False
    words = re.findall(r"[A-Za-z][A-Za-z'/()-]*", t)
    if not words or not words[0][0].isupper():
        return False
    caps = sum(1 for w in words if w[0].isupper() or w.lower() in SMALL)
    return caps == len(words) and prev_gap > lh * 0.9


def blocks_for_pages(doc: pymupdf.Document, pages: list[int]) -> list[dict]:
    """Flatten pages into typed blocks: h2, h3, p, step, sub, note/caution/warning, table."""
    figs_by_page: dict[int, list] = {}
    for e in FIG_INDEX:
        figs_by_page.setdefault(e["page"], []).append(e["bbox_pt"])
    blocks: list[dict] = []
    table_mode = False
    for p in pages:
        lines = page_lines(doc[p - 1], figs_by_page.get(p, []))
        if not lines:
            continue
        heights = [l["y1"] - l["y0"] for l in lines]
        lh = statistics.median(heights) if heights else 10
        cur: dict | None = None
        prev_y1, prev_col = None, None
        for l in lines:
            t = fix(l["t"])
            gap = (l["y0"] - prev_y1) if (prev_y1 is not None and prev_col == l["col"]) else 99
            prev_y1, prev_col = l["y1"], l["col"]
            if re.match(r"^Table\s+\d+\s+[A-Z][A-Z ,/()-]{4,}", t):
                table_mode = True
                blocks.append({"k": "table", "p": p, "t": t})
                cur = None
                continue
            if table_mode:
                continue
            word = t.strip().rstrip(":").upper()
            if word in CALLOUTS:
                cur = {"k": CALLOUTS[word], "p": p, "t": ""}
                blocks.append(cur)
                continue
            if t.upper() == t and len(t) > 3 and re.search(r"[A-Z]{3}", t) and not re.search(r"\d", t):
                prev = blocks[-1] if blocks else None
                if prev and prev["k"] == "caps" and prev["p"] == p and gap < lh * 1.6:
                    prev["t"] += " " + t.strip()  # heading wrapped onto a second line
                    continue
                if gap > lh * 0.9:
                    blocks.append({"k": "caps", "p": p, "t": t.strip()})
                    cur = None
                    continue
            if is_subheading(l, gap, lh):
                blocks.append({"k": "h3", "p": p, "t": t.strip()})
                cur = None
                continue
            m = re.match(r"^(\d+[A-Z]?)\.\s+(.*)$", t) or re.match(r"^(\d+[A-Z]?),\s+(.*)$", t)
            sm = re.match(r"^([a-z])\.\s+(.*)$", t)
            if m:
                cur = {"k": "step", "p": p, "n": m.group(1), "t": m.group(2)}
                blocks.append(cur)
                continue
            if sm and (cur is None or cur["k"] in ("step", "sub", "p")):
                cur = {"k": "sub", "p": p, "n": sm.group(1), "t": sm.group(2)}
                blocks.append(cur)
                continue
            new_para = gap > lh * 0.9 and not (cur and cur["k"] in CALLOUTS.values() and gap < lh * 1.6)
            if cur is None or (new_para and cur["k"] not in CALLOUTS.values()):
                cur = {"k": "p", "p": p, "t": t}
                blocks.append(cur)
                continue
            # continuation line: join, removing end-of-line hyphenation
            if cur["t"].endswith("-") and t[:1].islower():
                cur["t"] = cur["t"][:-1] + t
            else:
                cur["t"] = (cur["t"] + " " + t).strip()
    return [b for b in blocks if b["t"].strip() or b["k"] == "table"]


def main() -> None:
    doc = pymupdf.open(ROOT / SOURCES["clymer"]["file"])
    chapters = TOC["chapters"]
    starts = [c["printed"] + OFFSET for c in chapters] + [TOC["back"][0]["printed"] + OFFSET]
    book = {"cite": TOC["cite"], "chapters": [], "unmatched": []}
    for i, ch in enumerate(chapters):
        first, last = starts[i], starts[i + 1] - 1
        blocks = blocks_for_pages(doc, list(range(first, last + 1)))
        # Assign blocks to TOC sections. A heading matches a not-yet-used TOC
        # entry exactly (all-caps or title-case line), or is the first line of
        # one that wrapped. Sections keep body order, which can differ from
        # the two-column contents page.
        targets = {norm(s): s for s in ch["sections"]}
        used: set[str] = set()
        sections = [{"title": "Introduction", "blocks": []}]
        for b in blocks:
            if b["k"] in ("caps", "h3"):
                nb = norm(b["t"])
                hit = nb if nb in targets and nb not in used else None
                if hit is None and b["k"] == "caps" and len(nb) >= 10:
                    hit = next((k for k in targets if k not in used and k.startswith(nb)), None)
                if hit is not None:
                    used.add(hit)
                    sections.append({"title": targets[hit], "blocks": []})
                    continue
                if b["k"] == "caps":
                    # an all-caps line that is not a TOC section: figure title or legend heading
                    b = {**b, "k": "caption"}
            sections[-1]["blocks"].append(b)
        for k, s in targets.items():
            if k not in used:
                book["unmatched"].append(f"Chapter {ch['n']}: '{s}' heading not found")
        if not sections[0]["blocks"]:
            sections.pop(0)
        for s in sections:
            s["id"] = re.sub(r"[^a-z0-9]+", "-", s["title"].lower()).strip("-")
            ps = [b["p"] for b in s["blocks"]] or [first]
            s["pages"] = [min(ps), max(ps)]
        book["chapters"].append({"n": ch["n"], "title": ch["title"], "pages": [first, last], "sections": sections})
    out = ROOT / "doc/book/clymer.json"
    out.write_text(json.dumps(book, indent=1, ensure_ascii=False), encoding="utf-8")
    n_sec = sum(len(c["sections"]) for c in book["chapters"])
    n_blk = sum(len(s["blocks"]) for c in book["chapters"] for s in c["sections"])
    print(f"{len(book['chapters'])} chapters, {n_sec} sections, {n_blk} blocks -> {out.relative_to(ROOT)}")
    for u in book["unmatched"]:
        print("  unmatched:", u)


if __name__ == "__main__":
    main()
