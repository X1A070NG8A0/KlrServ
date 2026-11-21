# KLR Service Explorer

A local service and repair reference for the Kawasaki KLR650 only, first generation (KL650A), set up for a 2006 model.
The text is a paraphrase of the Clymer KLR650 1987-2006 manual in ASD-STE100
Simplified Technical English. The Kawasaki manuals and saved klr650.net threads
supply corrections and additions. Each step cites the page or post that it
comes from.

This is for personal use only. The repository holds copyrighted manuals and
text taken from them. The server listens on `127.0.0.1` only, and `build.ts`
refuses `--host`. Do not deploy the site, and keep the GitHub repository
private.

## Run the site

The site is built with [GGASS](../ggass), a static site generator that a
site uses as a library. You need Node 24 or later, and the GGASS repository
beside this one (`../ggass`), because `package.json` links it as a folder.

```sh
npm install
npm run build      # run the data checks, then write dist/
npm run serve      # build, serve on http://127.0.0.1:4650, rebuild and reload after each save
npm run lint       # list the data checks, check the pages and the links, write nothing
npm run check      # type-check the build script, the checks and the templates
```

Each page is a YAML file in `pagedef/`, a pagedef. A TSX template in
`template/` renders it, and GGASS adds the frame, the table of contents, the
popup fragments under `/frag/`, the search index and the link check. GGASS
also processes `style.css`, cuts the TeX Gyre Heros fonts in `fonts/` to the
characters that the pages use, and writes AVIF and WebP copies of the
figure crops.

`build.ts` runs the data checks of `lib/checks.ts` first. If a check finds an
error, the build stops before GGASS starts. With `--serve`, a step runs the
checks again in each rebuild, and an error stops that rebuild.

| Path | What it holds |
| --- | --- |
| `build.ts` | The GGASS site configuration, the data checks step and the build command |
| `pagedef/` | One YAML file for each page. See "Pages". |
| `data/` | Shared YAML that the templates read: `tools.yaml`, `schedule.yaml`, `substitutes.yaml`, `common-repairs.yaml`, `sources.yaml`, the diagrams and the figure labels. `progress.yaml` is the queue of the writers. |
| `template/` | The TSX templates, one for each kind of page. `template/lib/` holds the shared render code and the schema fields. |
| `static/figures/clymer/` | The figure crops from Clymer, served at `/figures/clymer/` |
| `lib/model.ts` | The site model: procedures, sections, spec tables, threads, and the links between them. The templates and the checks both use it. |
| `lib/checks.ts` | The data checks |
| `style.css` | The rules that this site adds to the GGASS stylesheet |
| `fonts/` | TeX Gyre Heros (GUST Font License) |
| `doc/` | The source layer: the manuals, their text layers, the page images (not committed), the book skeleton and the figure regions |

The browser code comes from GGASS. Each element wraps HTML that works without
JavaScript. The pages use `<pop-link>` (popup windows for procedures,
sections, spec tables and forum posts), `<check-list>`, `<list-filter>`,
`<site-search>`, `<section-tabs>` (the service checklist tabs),
`<step-sequence>` (tightening orders) and `<photo-zoom>`. The GGASS README
describes each one.

The element tests of 2026-11-17 and the accessibility checks of 2026-11-18
were done on the site code before GGASS. They are not repeated on this build.
After the port to pagedefs on 2026-11-20, a browser test covered the home
page, a procedure, the service tabs, the spec popups, search and the phone
layout.

## Pages

| Pagedef | Template | Address |
| --- | --- | --- |
| `index.yaml` | `home` | `/` |
| `maintenance.yaml`, with one child page for each service tab | `maintenance`, `service` | `/maintenance.html`, `/maintenance/500.html`, `/maintenance/every-3000.html` |
| `repairs.yaml`, `tools.yaml`, `specs.yaml` | `repairs`, `tools`, `specs` | `/repairs.html`, `/tools.html`, `/specs.html` |
| `book/index.yaml`, `book/errata.yaml` | `book`, `errata` | `/book/`, `/book/errata.html` |
| `book/chNN/index.yaml`, with one child page for each section | `chapter`, `section` | `/book/ch04/`, `/book/ch04/cylinder-head-cover.html` |
| `ops/<id>.yaml` | `procedure` | `/ops/<id>.html` |
| `issues/<id>.yaml` | `issue` | `/issues/<id>.html` |
| `specs/<group>.yaml`, with one child page for each table | `spec-group`, `spec-table` | `/specs/<group>.html`, `/specs/<group>/<table>.html` |
| `threads/<slug>.yaml`, with one child page for each post | `thread`, `post` | `/threads/<slug>.html`, `/threads/<slug>/<post>.html` |

A `_defaults.yaml` file in `ops/`, `issues/`, `specs/`, `threads/` and `book/`
gives the template and the search label of each pagedef in that folder.
Each spec table and each forum post has its own page, so that a popup window
shows only that table or post.

The ids of the service tabs in `maintenance.yaml` must match the intervals in
`data/schedule.yaml`. The data checks report a difference.

## What the site does

The site has four sections, each with a search bar:

1. Routine maintenance: the service schedule, and a checklist for each mileage.
2. Common repairs: repairs off the schedule (flats, cables, brakes, bulbs, crash damage, first-generation weak points), from `data/common-repairs.yaml`.
3. Full reference: every chapter and procedure of the manual, the specifications and the errata (owner reports from klr650.net, source disagreements, and values that no source gives).
4. Tool list: each tool that a procedure names, with the procedures that use it.

Each procedure shows its specifications, its parts (always replace, replace if worn or damaged, consumables), its tools, what you must do first, and which procedures need it. The tool list comes from `data/tools.yaml`: the build finds each tool in the cited step text, and adds a torque wrench where a step has a torque value.

If you hover a link to a section, a procedure, a torque value or a forum post, a window opens with the full content. Links in that window open more windows. Pin a window to keep it, and drag it by its title bar. Drawn sequences, for example the cylinder head tightening order, are SVG diagrams with a numbered legend (`data/diagrams/`). Each step shows its photos, cropped from Clymer, but no scans of book pages.

## Data and rules

`AUTHORING.md` is the contract for every writer. It gives the sources, the
fact rules, the ASD-STE100 rules, the YAML schema and the rules for an
interrupt. GGASS checks the shape of each pagedef against the fields of its
template, and an error names the file and the line. The data checks in
`lib/checks.ts` enforce these rules:

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
The KLR600 OCR also needs Tesseract. The scripts read `data/sources.yaml`.

| Script | Output |
| --- | --- |
| `scripts/render_pages.py` | Page images in `doc/pages/` (not committed) |
| `scripts/extract_text.py` | Text layers in `doc/text/` |
| `scripts/ocr_klr600.py` | OCR of the scanned KLR600 manual |
| `scripts/build_book.py` | Book sections from the Clymer text, `doc/book/clymer.json` |
| `scripts/extract_figures.py` | Photo crops in `static/figures/clymer/`, regions in `doc/figures/clymer/index.yaml` |
| `scripts/extract_drawings.py` | Crops of framed line drawings that the first pass misses, regions in `doc/figures/clymer/index-drawings.yaml` |
| `scripts/figure_contact_sheet.py` | Contact sheet to read figure numbers into `data/figures/labels-chNN.yaml` |
| `scripts/figure_review.py` | Contact sheets of the figures that a step cites and that have no label |
| `scripts/save_forum_threads.py` | Saved threads in `pagedef/threads/`, one child page for each post |

On 2026-11-20, a fresh run of the text extraction, the KLR600 OCR, the
figure detector and the book script gave the same output as the committed
files.

## Known limits

- Every figure that a step cites has a crop. Some figure numbers were read by eye, from widened corners of the detector crops or from page thumbnails. `data/figures/labels-corners.yaml` holds these labels. Each label matches a step on the same page, the page before or the page after, that cites that figure. Light photos on a white background have no frame, so no detector finds them. Their boxes were measured by hand and are in `doc/figures/clymer/index-manual.yaml`.
- The tool list reads the text layers in `doc/text/` directly, outside GGASS. A watch build does not see a change there. Start the build again after you run the text scripts.
- A watch build renders again most pages after a change to any procedure, because the links between procedures, sections and tools come from all of them.
