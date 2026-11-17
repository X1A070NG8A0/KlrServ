# Authoring guide: the KLR650 service wiki

This guide is for every writer of `data/`, human or agent. Read all of it
before you write a file.

## 1. What the wiki is

The wiki is a paraphrase of the Clymer KLR650 1987-2006 manual (M474-2) in
ASD-STE100 Simplified Technical English, for one bike: a 2006 KLR650 (KL650A).
The Kawasaki manuals and klr650.net threads supply errata and supplements.
The site does not show pages of the book. It shows our STE text, with links
that resolve dependencies: the section that a step needs, the torque value,
the parts.

## 2. Sources

| Source id | What | Where |
| --- | --- | --- |
| `clymer` | Clymer manual, 348 PDF pages. Printed page = PDF page - 12. | Text layer per page: `doc/text/clymer/pNNN.txt` (column order, OCR). Page image: `doc/pages/clymer/pNNN.jpg`. |
| `kaw-600` | Kawasaki KLR600 base service manual (scan, OCR). | `doc/text/kawasaki-klr600/`, `doc/pages/kaw-600/` |
| `kaw-supp` | Kawasaki KLR650/500 supplement, to 2002. A re-typed copy: some tables lost columns. | `doc/text/kawasaki-klr650-supplement/`, `doc/pages/kaw-supp/` |
| `forum` | klr650.net threads, posts numbered. | `doc/community/<slug>.md` |

`doc/book/clymer.json` splits the Clymer text into chapters, sections (with
ids and approximate PDF page ranges) and blocks. Use it to find the text. The
page ranges are approximate: confirm the start and end of a section in the
text files.

Always cite the PDF page number (`p`), not the printed page number.

## 3. The rules for facts

1. Do not write a fact unless the cited page states it. If a step needs a value that no source gives, write a `gap:` that says so. Do not fill it in from memory.
2. Every number in a step must appear in the text layer of the cited page. The build reports each miss. If the OCR garbled the number, look at the page image, and keep the correct value only if the image shows it.
3. Torque values and specifications: use `spec_ref` to a row in `data/specs/*.yaml` where the row exists. Read those files for the table ids and row names. If the value is not in a table, write it in the step with its citation.
4. When sources disagree, the Clymer value comes first, because Clymer is the only manual that covers 2003-2006. Put the other values in `conflict:`. If another source agrees and adds detail, use `conflict:` with `agrees: true`.
5. Year-specific values: the bike is a 2006. If Clymer gives values for "1987-1995" and "1996-on", use the 1996-on value and say so.
6. Quoted text from a forum post must be verbatim. The build fails if the quote is not in the post. Prefer an STE paraphrase. Quote only short phrases where the exact words matter.

## 4. The rules for language (ASD-STE100)

No tool can guarantee ASD-STE100 compliance. The full approved dictionary is a
free download at asd-ste100.org. Apply these rules.

Procedural text (steps):

1. One instruction per step. Imperative mood. 20 words or fewer per sentence.
2. Condition before command, with a comma: "If the pin is worn, replace it."
3. Warnings and cautions: the command first, then the risk. "Do not drain the float chamber when the engine is hot. The fuel can ignite."
4. A step does one thing. Put the next action in the next step.

Descriptive text (summaries, notes):

1. Simple tenses, active voice, 25 words or fewer per sentence.
2. One topic per paragraph.

Words:

1. Modals: can, will, must. Do not use should, would, may, might, could.
2. No contractions. No semicolons. No em-dashes. No present perfect.
3. Use these words: "make sure that" (not check, verify, ensure, confirm), "examine" (look for damage), "measure" (get a value), "do a test" (not test as a verb), "do" (not perform), "put" (not insert), "prevent" (not avoid), "do again" (not repeat), "get to" (not reach), "but" (not however), "because" (not since), "more than / less than" for limits (not above / below), "lubricate" for the verb (oil is a noun only), "remove" (not take off), "install" (not put on or fit), "tighten", "loosen", "turn".
4. Technical nouns stay as the manual names them: "banjo bolt", "seal washer", "tensioner bolt", "fuel valve". Use one name for one part in the whole wiki.
5. Paraphrase. Do not copy sentences from the manual. Values, part names and labels stay exact.
6. American spelling. No marketing words. No "simply", "easily", "carefully" without a fact.

Format:

1. No bold, no emoji, no headings over fewer than three steps.
2. A section title is a noun phrase: "Cylinder head cover removal", "Fork oil replacement".

## 5. Files and ownership

Each chapter writer owns exactly these files, and must not edit others:

| File | Content |
| --- | --- |
| `data/book/chNN.yaml` | The chapter: sections in book order, each with an STE summary and the ids of its operations. |
| `data/operations/chNN-<slug>.yaml` | Operations (procedures) for the chapter. |
| `doc/figures/clymer/labels-chNN.yaml` | Figure numbers for detected photo regions in the chapter. |

Chapter 3 already has operations in `data/operations/` with ids that the
schedule and the issue pages use (for example `engine-oil-and-filter`). The
chapter 3 writer rewrites those files in place and keeps every id, part name
and `spec_ref`. New operation ids in other chapters start with `cNN-`, for
example `c04-cylinder-head-cover`.

## 6. Schema

### data/book/chNN.yaml

```yaml
chapter: 4
title: "Engine Top End"
sections:
  - id: cylinder-head-cover          # the id from doc/book/clymer.json
    title: "Cylinder head cover"
    pages: [92, 95]                  # PDF pages that the section covers
    summary:                         # STE descriptive text, 1-4 sentences
      - {t: "The cylinder head cover holds the ...", cite: {p: 92}}
    ops: [c04-cylinder-head-cover]   # operations for this section, in book order
```

Every TOC section of the chapter must be in this file, also a section without
procedures (give it a summary). If `doc/book/clymer.json` missed a section,
add it with its id (lowercase title, hyphens) and pages.

### data/operations/chNN-<slug>.yaml

One operation per procedure in the book (removal, installation, inspection,
adjustment, disassembly). One file can hold several operations under
`operations:`.

```yaml
operations:
  - id: c04-cylinder-head-cover
    title: "Cylinder head cover removal and installation"
    system: "Engine top end"          # use the chapter title in lowercase
    source: clymer
    chapter: 4                         # Clymer chapter, for figure numbers
    section: "04/cylinder-head-cover"  # book section that holds it
    summary: {t: "STE description of what the procedure does.", cite: {p: 92}}
    spec_refs: ["top-end-torque:Cylinder head cover bolts"]
    parts:
      - {name: "Cylinder head cover gasket", replace: always, cite: {p: 94}, note: "STE note."}
      - {name: "Spark plug", replace: inspect, cite: {p: 94}}
      - {name: "Silicone sealant", replace: consumable, cite: {p: 94}}
    sections:
      - title: "Removal"
        steps:
          - {t: "Remove the fuel tank.", cite: {p: 92}, ref: "15/fuel-tank"}
          - {t: "Remove the spark plug.", cite: {p: 92}, op: spark-plug}
          - {t: "Remove the bolts from the cylinder head cover.", cite: {p: 92}, figs: [5]}
          - {kind: caution, t: "Do not pry the cover with a screwdriver. This can cause damage to the gasket surface.", cite: {p: 93}}
      - title: "Installation"
        steps:
          - {t: "Tighten the cover bolts in a crossing pattern.", cite: {p: 94}, spec_ref: "top-end-torque:Cylinder head cover bolts"}
```

Step fields:

| Field | Use |
| --- | --- |
| `t` | The STE text. Required. |
| `cite` | `{p: N}` (source = the operation's `source`), or `{s: kaw-600, p: N}`, or `{s: forum, id: slug, post: N}`. Required. |
| `kind` | `note`, `caution` or `warning`. |
| `ref` | A dependency on a book section: `"NN/section-id"`. Use it when the book says "(Chapter Fifteen)" or "as described in X in Chapter Y". The site links it. |
| `op` | A dependency on an operation id in your chapter or a chapter 3 id. |
| `spec_ref` | `"table-id:Item"` or `"table-id:Group/Item"`. The site shows the value. |
| `figs` | Clymer figure numbers in the operation's `chapter` (or the step's `chapter`). |
| `chapter` | Override the Clymer chapter for `figs` in this step. |
| `gap` | STE text: a value or step that no source gives. |
| `image_checked` | `true` only after a reviewer compared every number in the step with the page image (for values that exist only in a drawing). The number check then skips the step. |
| `conflict` | `{note: "...", agrees: false, others: [{t: "...", cite: {...}}]}` |

Part `replace` values: `always` (the book says install a new one), `inspect`
(replace if worn or damaged, or if out of limit), `consumable` (fluids,
sealant, grease, locking agent).

### doc/figures/clymer/labels-chNN.yaml

```yaml
chapter-4:
  p093-r0: 5     # detected region file stem: figure number
```

Make a contact sheet of the chapter's detected regions with
`.venv/Scripts/python.exe -I scripts/figure_contact_sheet.py FIRST LAST OUT.png`
(FIRST and LAST are PDF pages, OUT.png in your scratch folder), read the
circled number in each tile, and record it. Leave out tiles with no readable
number. `doc/figures/clymer/index.yaml` lists the regions.

## 7. Work so that an interrupt loses little

A usage limit or a crash can stop you at any time. Structure the work so that
a stop loses at most one section:

1. Before you start, read the files that you own. If some already exist, a
   previous writer stopped. Continue from where it stopped. Do not start again.
2. Work one book section at a time. When a section is finished, write its
   operations file (`data/operations/chNN-<section-id>.yaml`) and add the
   section to `data/book/chNN.yaml` at once. Do not keep finished work only in
   memory.
3. In `data/book/chNN.yaml`, list only finished sections. A section that is not
   in the file shows as "not written" on the site, and the next writer does it.
4. Run the check after each section, so that each saved state builds.

## 8. Check your work

Run `"C:\Program Files\nodejs\node.exe" site/build.ts --check` from the repo
root. It validates without writing `dist/`. Fix every error and every number
miss that names your ids or files. A figure that has no label is a warning
only.
