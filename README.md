# KLR650 service wiki

A local, cited service reference for a 2006 (gen 1, KL650A) Kawasaki KLR650.
It's a static HTMX + TypeScript site built from the manuals in `doc/`. Every
procedure step, spec and part links to the page or forum post it came from.

**Personal use only.** The site embeds pages from copyrighted manuals. It
serves on `127.0.0.1` only and should not be deployed or pushed anywhere
public.

## Run it

```sh
npm install
npm run build      # validates citations, writes dist/
npm run serve      # http://127.0.0.1:4650
```

`npm run check` type-checks the generator and the client.

## Rebuilding the source layer

The Python scripts need the venv: `py -3.12 -m venv .venv` followed by
`.venv/Scripts/pip install pymupdf beautifulsoup4 pyyaml pillow numpy scipy`.
OCR also needs Tesseract at `C:\Program Files\Tesseract-OCR`.

| Script | Output |
| --- | --- |
| `scripts/render_pages.py` | `doc/pages/<source>/pNNN.jpg`, one image per PDF page (gitignored, regenerable) |
| `scripts/extract_text.py` | `doc/text/<source>/pNNN.txt`, the text layer in column order |
| `scripts/ocr_klr600.py` | `doc/text/kawasaki-klr600/`: Tesseract OCR of the scanned KLR600 manual |
| `scripts/extract_figures.py` | `doc/figures/clymer/`: photo crops detected on each page |
| `scripts/figure_contact_sheet.py` | Contact sheet for reading figure numbers into `doc/figures/clymer/labels.yaml` |
| `scripts/save_forum_threads.py` | `doc/community/<slug>.md` for the threads in `threads.yaml` |

The text layers are for search and prose only. **Table values are always
transcribed from the page images.** The Clymer text layer scrambles tables,
and the Kawasaki 650 supplement PDF is a re-typeset copy whose maintenance
chart lost its interval columns.

## Data (`data/`)

- `schedule.yaml`: Clymer Table 1. Each task links to an operation; `parts:` limits which of that operation's parts the task uses.
- `specs/*.yaml`: every spec, limit and torque table. `years:` marks model-year rows.
- `operations/*.yaml`: procedures as sections of steps. Steps can carry `figs`, `spec_ref`, `op`, `conflict` and `gap`.
- `issues/*.yaml`: known gen 1 problems, sourced from saved forum threads.

### Citation rules (enforced by `npm run build`)

- Every step, part, summary and table must have a citation that resolves: either `{s: <source>, p: <pdf page>}` with `s` from `doc/sources.yaml`, or `{s: forum, id: <thread>, post: <n>}`. Otherwise the build fails.
- Every `spec_ref` (`table:item` or `table:group/item`) must match a transcribed row.
- Text in quotes attributed to a forum post must appear in that post verbatim.
- If the sources don't give a value, write a `gap:` instead of filling one in.
- When sources disagree, the Clymer value goes first (it is the only manual covering 2003–2006). Show the others with `conflict:`.

The build also reports, on `/verify.html`, any number in a step that doesn't
appear in the cited page's text layer. Treat each one as a prompt to check the
page image.

## Status

- Every task in Clymer Table 1 links to a cited procedure. Brake hose and fuel hose replacement have no stand-alone section in any manual, so they are assembled from the cited hose steps in the caliper, master cylinder, fuel tank and fuel valve procedures, and they say so.
- Figures are labelled for the pages used so far: Chapter Three, plus parts of Chapters Nine, Fourteen and Fifteen. Undetected figures (mostly line drawings) link to their page instead.
- There are no hand-drawn SVG recreations of figures yet. The schedule table, spec tables and mileage timeline are HTML/SVG generated from the data.
