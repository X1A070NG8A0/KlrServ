# KLR Service Explorer

A local service and repair reference for the Kawasaki KLR650 only, first generation (KL650A), set up for a 2006 model.
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
type-checks the build (TypeScript, run by Node directly) and the browser code.

The browser code in `site/client/` is plain JavaScript with JSDoc types, so
the build copies it as written. The site uses no libraries. Each module
defines one custom element, and each element wraps HTML that works without
JavaScript:

| Element | With JavaScript | Without JavaScript |
| --- | --- | --- |
| `<pop-link>` | Pointing to the link opens a popup window (`<pop-window>`) | A link |
| `<check-list>` | Keeps the ticks and moves ticked items down | Checkboxes |
| `<list-filter>` | Filters the list on the page | Hidden |
| `<site-search>` | Searches `search-index.json` | Hidden, with a note on the search page |
| `<mileage-picker>` | Swaps a service checklist in place from its binder tab | Links to `/maintenance/<miles>.html` and `/maintenance/every-<miles>.html` |
| `<bolt-sequence>` | Steps through a tightening order in the drawing | Drawing and numbered list |
| `<photo-zoom>` | Opens the photo large in a dialog | A link to the image file |

Static content (procedures, steps, parts, specification tables) is native
HTML.

On 2026-11-17 a scripted test of each element passed in Chromium 156,
Firefox 160 and WebKit 27.2 (the Playwright build of the Safari engine, on
Windows). Firefox 143, which has no anchor positioning and no invoker
commands, tested the JavaScript fallbacks. Real Safari on a Mac or an
iPhone is not tested. `site/REFACTOR.md` gives the reasons for these choices.

## What the site does

The site has four sections, each with a search bar:

1. Routine maintenance: the service schedule, and a checklist for each mileage.
2. Common repairs: repairs off the schedule (flats, cables, brakes, bulbs, crash damage, first-generation weak points), from `data/common-repairs.yaml`.
3. Full reference: every chapter and procedure of the manual, the specifications, photos, and the errata (owner reports from klr650.net, source disagreements, and values that no source gives).
4. Tool list: each tool that a procedure names, with the procedures that use it.

Each procedure shows its specifications, its parts (always replace, replace if worn or damaged, consumables), its tools, what you must do first, and which procedures need it. The tool list comes from `data/tools.yaml`: the build finds each tool in the cited step text, and adds a torque wrench where a step has a torque value.

If you hover a link to a section, a procedure, a torque value or a forum post, a window opens with the full content. Links in that window open more windows. Pin a window to keep it, and drag it by its title bar. Drawn sequences, for example the cylinder head tightening order, are SVG diagrams with a numbered legend (`data/diagrams/`). The site shows photos cropped from Clymer, but no scans of book pages.

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
| `scripts/make_woff2.py` | WOFF2 fonts in `site/static/fonts/` from the OpenType sources in `site/fonts-src/` |
| `scripts/extract_drawings.py` | Crops of framed line drawings that the first pass misses, `index-drawings.yaml` |
| `scripts/figure_contact_sheet.py` | Contact sheet to read figure numbers into `labels-chNN.yaml` |
| `scripts/save_forum_threads.py` | Saved threads in `doc/community/` |

## Known limits

- Every figure that a step cites has a crop. Some figure numbers were read by eye, from widened corners of the detector crops or from page thumbnails. `labels-corners.yaml` holds these labels. Each label matches a step on the same page, the page before or the page after, that cites that figure. Light photos on a white background have no frame, so no detector finds them. Their boxes were measured by hand and are in `index-manual.yaml`.