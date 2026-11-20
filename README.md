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

The site is built with [GGASS](../ggass), a static site generator that a
site uses as a library. You need Node 24 or later, and the GGASS repository
beside this one (`../ggass`), because `package.json` links it as a folder.

```sh
npm install
npm run build      # validate all citations, then write dist/
npm run serve      # build, then http://127.0.0.1:4650
npm run lint       # list the data checks and the link errors, write nothing
npm run check      # type-check the build
```

The build has two parts:

1. `lib/pages.ts` reads `data/` and `doc/`, validates the citations,
   and writes each page as an HTML file with a YAML header into `content/`.
   It also copies the cited figure crops there. `content/` is generated, so
   Git ignores it. Do not edit it.
2. GGASS (`build.ts`) builds `content/` into `dist/`. It adds the layout,
   the table of contents, the popup fragments under `/frag/`, the search
   index, and the link check. It also processes `style.css`, cuts the TeX
   Gyre Heros fonts in `fonts/` to the characters that the pages use, and
   writes AVIF and WebP copies of the figure crops.

| Path | What it holds |
| --- | --- |
| `build.ts` | The GGASS site configuration and the build command |
| `lib/data.ts` | Loads `data/` and `doc/` and checks the references |
| `lib/html.ts` | HTML helpers: citations, spec values |
| `lib/pages.ts` | The page generator and the data checks |
| `style.css` | The rules that this site adds to the GGASS stylesheet |
| `fonts/` | TeX Gyre Heros (GUST Font License) |

The browser code comes from GGASS. Each element wraps HTML that works without
JavaScript. The pages use `<pop-link>` (popup windows for procedures,
sections, spec tables and forum posts), `<check-list>`, `<list-filter>`,
`<site-search>`, `<section-tabs>` (the service checklist tabs),
`<step-sequence>` (tightening orders) and `<photo-zoom>`. The GGASS README
describes each one.

Each spec table has its own page under `/specs/`, and each cited forum post
has its own page under `/threads/<thread>/`, so that a popup window shows
only that table or post. The full threads are under `/threads/`.

The element tests of 2026-11-17 and the accessibility checks of 2026-11-18
were done on the site code before GGASS. They are not repeated on this build.

## What the site does

The site has four sections, each with a search bar:

1. Routine maintenance: the service schedule, and a checklist for each mileage.
2. Common repairs: repairs off the schedule (flats, cables, brakes, bulbs, crash damage, first-generation weak points), from `data/common-repairs.yaml`.
3. Full reference: every chapter and procedure of the manual, the specifications and the errata (owner reports from klr650.net, source disagreements, and values that no source gives).
4. Tool list: each tool that a procedure names, with the procedures that use it.

Each procedure shows its specifications, its parts (always replace, replace if worn or damaged, consumables), its tools, what you must do first, and which procedures need it. The tool list comes from `data/tools.yaml`: the build finds each tool in the cited step text, and adds a torque wrench where a step has a torque value.

If you hover a link to a section, a procedure, a torque value or a forum post, a window opens with the full content. Links in that window open more windows. Pin a window to keep it, and drag it by its title bar. Drawn sequences, for example the cylinder head tightening order, are SVG diagrams with a numbered legend (`data/diagrams/`). Each step shows its photos, cropped from Clymer, but no scans of book pages.

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
| `scripts/extract_drawings.py` | Crops of framed line drawings that the first pass misses, `index-drawings.yaml` |
| `scripts/figure_contact_sheet.py` | Contact sheet to read figure numbers into `labels-chNN.yaml` |
| `scripts/save_forum_threads.py` | Saved threads in `doc/community/` |

## Known limits

- Every figure that a step cites has a crop. Some figure numbers were read by eye, from widened corners of the detector crops or from page thumbnails. `labels-corners.yaml` holds these labels. Each label matches a step on the same page, the page before or the page after, that cites that figure. Light photos on a white background have no frame, so no detector finds them. Their boxes were measured by hand and are in `index-manual.yaml`.