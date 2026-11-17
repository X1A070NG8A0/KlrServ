# KLR650 service wiki

A local service wiki for a 2006 (first generation, KL650A) Kawasaki KLR650.
The text is a paraphrase of the Clymer KLR650 1987-2006 manual in ASD-STE100
Simplified Technical English. The Kawasaki manuals and saved klr650.net threads
supply corrections and additions. Each step cites the page or post that it
comes from.

This is for personal use only. The repository holds copyrighted manuals and
text taken from them. The server listens on `127.0.0.1` only. Do not deploy
the site, and keep the GitHub repository private.

## Run the site

```sh
npm install
npm run build      # validate all citations, then write dist/
npm run serve      # http://127.0.0.1:4650
```

`node site/build.ts --check` validates and writes nothing. `npm run check`
type-checks the TypeScript.

## What the site does

- The Book has the 15 Clymer chapters and their sections. Each section has its procedures.
- If you hover a link to a section, a procedure, a torque value or a forum post, a window opens with the full content. Links in that window open more windows. Pin a window to keep it on the screen, and drag it by its title bar.
- Each procedure shows what you must do first, which procedures need it, its specifications and its parts. The parts are in three groups: always replace, replace if worn or damaged, and consumables.
- The schedule, the parts list for each mileage, the specification tables, the known-issue pages and search link to the same procedures.
- Some sequences exist only in a drawing, for example the cylinder head tightening order. These are recreated as SVG diagrams with a numbered legend (`data/diagrams/`).
- The site shows photos cropped from Clymer. It does not show scans of book pages.

## Data and rules

`data/AUTHORING.md` is the contract for every writer. It gives the sources,
the fact rules, the ASD-STE100 rules, the YAML schema and the rules for an
interrupt. The build enforces these rules:

- Each step, part, summary and table must have a citation that resolves. If not, the build fails.
- Each `spec_ref`, `op`, `ref` (book section) and `diagram` must exist.
- Quoted forum text must be in the cited post word for word.
- Each number in a step must be in the text layer of the cited page. A reviewer can mark a step `image_checked` after a comparison with the page image.
- The check lists words that ASD-STE100 rejects (should, may, verify, ensure, semicolons and others).
- When sources disagree, Clymer is first. The other source is shown next to it as a `conflict`.

## Progress and interrupts

`data/progress.yaml` holds the chapter queue, the status of each chapter and
the review list. Writers save each section when it is finished.
`scripts/checkpoint.sh <chapter> [next]` runs the check, marks the chapter
done and makes a local commit. Nothing is pushed.

## Source layer (Python scripts)

Use the venv: `py -3.12 -m venv .venv`, then
`.venv/Scripts/pip install pymupdf beautifulsoup4 pyyaml pillow numpy scipy`.
The KLR600 OCR also needs Tesseract.

| Script | Output |
| --- | --- |
| `scripts/render_pages.py` | Page images in `doc/pages/` (not committed) |
| `scripts/extract_text.py` | Text layers in `doc/text/` |
| `scripts/ocr_klr600.py` | OCR of the scanned KLR600 manual |
| `scripts/build_book.py` | Book sections from the Clymer text, `doc/book/clymer.json` |
| `scripts/extract_figures.py` | Photo crops in `doc/figures/clymer/` |
| `scripts/figure_contact_sheet.py` | Contact sheet to read figure numbers into `labels-chNN.yaml` |
| `scripts/save_forum_threads.py` | Saved threads in `doc/community/` |

## Known limits

- About 240 figures have no cropped photo, because the detector did not find them. These are mostly line drawings. The step names the figure.
- Clymer contradicts itself on the direction of the snap ring on the rear balancer shaft (PDF p133 and p136). The procedure shows both and marks a gap.
- For 2006, the Clymer serial number table gives the model code (KL650-A20) but no serial number range.
