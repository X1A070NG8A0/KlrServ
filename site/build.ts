// Static site generator. Reads data/ and doc/, validates citations, writes dist/.
// `node site/build.ts --check` validates only and writes nothing.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BookChapter, BookSection, Cite, Figure, Operation, Part, Section, Step, Task } from "./lib/data.ts";
import { ROOT, findSpec, load, printedLabel } from "./lib/data.ts";
import { esc, layout, rowLabel, specValue, srcLabel, supplementCite, yearClass } from "./lib/html.ts";

const DIST = join(ROOT, "dist");
const CHECK = process.argv.includes("--check");
const data = load();
if (data.errors.length && !CHECK) {
  console.error(`Build failed: ${data.errors.length} citation/reference error(s):`);
  for (const e of data.errors) console.error("  - " + e);
  process.exit(1);
}

// ---------- checks ----------
type C = { s?: string; p?: number; id?: string; post?: number };
function walkSteps(fn: (st: Step, src: string, where: string) => void): void {
  const walk = (sections: Section[], src: string, id: string) =>
    sections.forEach((sec, si) => sec.steps.forEach((st, i) => fn(st, src, `${id} §${si + 1} step ${i + 1}`)));
  for (const op of data.ops.values()) walk(op.sections, op.source, op.id);
  for (const is of data.issues.values()) walk(is.sections, "forum", `issue ${is.id}`);
}
// Every number in a step must appear on the cited page (text layer) or post.
function numberChecks(): string[] {
  const misses: string[] = [];
  const check = (text: string, c: C, src: string, where: string) => {
    const s = c.s ?? src;
    const hay = s === "forum" ? data.threads.get(c.id!)?.posts.get(c.post!)?.text ?? "" : data.pageText(s, c.p!) ?? "";
    const norm = hay.replace(/\s+/g, "");
    for (const num of text.match(/\d+(?:\.\d+)?(?:\/\d+)?/g) ?? [])
      if (!norm.includes(num)) misses.push(`${where}: "${num}" not found in ${s} ${s === "forum" ? `${c.id}#${c.post}` : `p${c.p}`}`);
  };
  walkSteps((st, src, w) => {
    if (!st.image_checked) check(st.t, st.cite, src, w); // numbers compared with the page image by a reviewer
    st.conflict?.others.forEach((o) => check(o.t.replace(/^"|"$/g, ""), o.cite, src, `${w} (conflict)`));
  });
  return misses;
}
// Quoted forum text must appear verbatim in the cited post.
function quoteErrors(): string[] {
  const errs: string[] = [];
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const check = (text: string, c: C, where: string) => {
    if (c.s !== "forum") return;
    const post = norm(data.threads.get(c.id!)?.posts.get(c.post!)?.text ?? "");
    for (const m of text.matchAll(/"([^"]{12,})"/g)) if (!post.includes(norm(m[1]))) errs.push(`${where}: quote not verbatim in ${c.id}#${c.post}: "${m[1].slice(0, 60)}…"`);
  };
  walkSteps((st, _src, w) => {
    check(st.t, st.cite, w);
    st.conflict?.others.forEach((o) => check(o.t, o.cite, `${w} (conflict)`));
  });
  for (const is of data.issues.values()) is.summary.forEach((s, i) => check(s.t, s.cite, `issue ${is.id} summary ${i + 1}`));
  return errs;
}
// ASD-STE100 lint: words and marks the standard rejects (AUTHORING.md §4).
// Quoted forum text is exempt. Reported as warnings.
const STE_BAD: [RegExp, string][] = [
  [/\b(should|would|may|might|could)\b/i, "modal (use can, will or must)"],
  [/\b(verify|verified|verifies|ensure|ensures|confirm|confirms|perform|performs|performed)\b/i, "rejected verb (make sure that, do)"],
  [/\b(however|therefore|in order to)\b/i, "rejected connector"],
  [/\b(has|have) been\b/i, "present perfect"],
  [/[;—]/, "semicolon or em-dash"],
  [/\b\w+n't\b/i, "contraction"],
];
function steLint(): string[] {
  const out: string[] = [];
  const lint = (text: string | undefined, where: string) => {
    if (!text) return;
    const plain = text.replace(/"[^"]*"/g, "");
    for (const [re, why] of STE_BAD) { const m = plain.match(re); if (m) out.push(`${where}: STE ${why}: "${m[0]}"`); }
  };
  walkSteps((st, _src, w) => { lint(st.t, w); lint(st.gap, `${w} gap`); });
  for (const op of data.ops.values()) { lint(op.summary?.t, `${op.id} summary`); op.parts?.forEach((p) => lint(p.note, `${op.id} part "${p.name}"`)); }
  for (const c of data.book) for (const s of c.sections) s.summary?.forEach((x, i) => lint(x.t, `book ch${c.n} ${s.id} summary ${i + 1}`));
  return out;
}
const qerr = quoteErrors();
const misses = numberChecks();
const ste = steLint();
if (CHECK) {
  const show = (title: string, list: string[]) => {
    console.log(`${title} (${list.length})`);
    for (const x of list) console.log("  - " + x);
  };
  show("ERRORS", [...data.errors, ...qerr]);
  show("NUMBER MISSES", misses);
  show("STE", ste);
  show("WARNINGS", data.warnings);
  process.exit(data.errors.length || qerr.length ? 1 : 0);
}
if (qerr.length) {
  console.error(`Build failed: ${qerr.length} misquoted forum post(s):`);
  for (const e of qerr) console.error("  - " + e);
  process.exit(1);
}

rmSync(DIST, { recursive: true, force: true });
const write = (rel: string, html: string): void => {
  const path = join(DIST, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
};

// ---------- book index and dependency graph ----------
const nn = (n: number) => String(n).padStart(2, "0");
const sectionKey = (c: BookChapter, s: BookSection) => `${nn(c.n)}/${s.id}`;
const sections = new Map<string, { c: BookChapter; s: BookSection }>();
for (const c of data.book) for (const s of c.sections) sections.set(sectionKey(c, s), { c, s });
const sectionHref = (key: string) => `/book/ch${key.replace("/", "/")}.html`;
const opSection = new Map<string, string>(); // op id -> section key
for (const [key, { s }] of sections) for (const o of s.ops ?? []) if (!opSection.has(o)) opSection.set(o, key);
for (const op of data.ops.values()) if (op.section && !opSection.has(op.id)) opSection.set(op.id, op.section);

type Dep = { kind: "op" | "ref"; id: string };
const depsOf = (op: Operation): Dep[] => {
  const seen = new Map<string, Dep>();
  for (const sec of op.sections) for (const st of sec.steps) {
    if (st.op && st.op !== op.id) seen.set(`op:${st.op}`, { kind: "op", id: st.op });
    if (st.ref) seen.set(`ref:${st.ref}`, { kind: "ref", id: st.ref });
  }
  return [...seen.values()];
};
const neededBy = new Map<string, Set<string>>(); // "op:id" or "ref:NN/sec" -> op ids
for (const op of data.ops.values())
  for (const d of depsOf(op)) {
    const k = `${d.kind}:${d.id}`;
    if (!neededBy.has(k)) neededBy.set(k, new Set());
    neededBy.get(k)!.add(op.id);
  }
// An op is also "needed" by anything that needs its whole section.
const neededByOp = (id: string): string[] => {
  const out = new Set(neededBy.get(`op:${id}`) ?? []);
  const sk = opSection.get(id);
  if (sk) for (const x of neededBy.get(`ref:${sk}`) ?? []) out.add(x);
  out.delete(id);
  return [...out];
};

// ---------- link helpers (hover = preview of the dependency) ----------
// Hovering a dependency opens a floating window with the full target
// (site/client/main.ts). Clicking follows the link as usual.
const preview = (href: string, frag: string, label: string, cls = "dep") =>
  `<span class="${cls}"><a href="${href}" data-pop="${frag}">${label}</a></span>`;
const opLink = (id: string, label?: string): string => {
  const op = data.ops.get(id);
  return op ? preview(`/ops/${id}.html`, `/frag/op/${id}.html`, esc(label ?? op.title)) : `<span class="unwritten">${esc(label ?? id)}</span>`;
};
const refLink = (key: string, label?: string): string => {
  const hit = sections.get(key);
  if (!hit) return `<span class="unwritten">${esc(label ?? key)}</span>`;
  return preview(sectionHref(key), `/frag/section/${key.replace("/", "-")}.html`, `${esc(label ?? hit.s.title)} <span class="ch">Ch. ${hit.c.n}</span>`);
};
const specLink = (ref: string): string => {
  const hit = findSpec(data, ref);
  if (!hit) return "";
  return `<span class="spec${yearClass(hit.row)}">${preview(`/specs.html#${hit.table.id}`, `/frag/spec/${hit.table.id}.html`, `<b>${specValue(hit.row, hit.table.kind)}</b>`, "dep dep-spec")}</span>`;
};
const depLink = (d: Dep) => (d.kind === "op" ? opLink(d.id) : refLink(d.id));

// ---------- figures (demonstration photos cropped from Clymer) ----------
const figFor = (chapter: number | undefined, n: number): Figure | undefined => data.figures.find((f) => f.chapter === chapter && f.n === n);
const photo = (f: Figure) => `<figure class="photo"><img src="/${f.file}" alt="Clymer Chapter ${f.chapter} figure ${f.n}" loading="lazy"><figcaption>Clymer fig. ${f.chapter}-${f.n}</figcaption></figure>`;

// ---------- steps and operations ----------
function stepHtml(st: Step, src: string, chapter?: number): string {
  const kind = st.kind ? ` class="${st.kind}"` : "";
  const label = st.kind ? `<span class="kind">${st.kind}</span> ` : "";
  const deps = [st.ref && refLink(st.ref), st.op && opLink(st.op), st.spec_ref && specLink(st.spec_ref)].filter(Boolean).join(" ");
  const figs = (st.figs ?? []).map((n) => figFor(st.chapter ?? chapter, n)).filter((f): f is Figure => !!f).map(photo).join("");
  const external = st.cite.s && st.cite.s !== "clymer" && st.cite.s !== src ? ` ${supplementCite(data, st.cite, src)}` : (src !== "clymer" ? ` ${supplementCite(data, st.cite, src)}` : "");
  const gap = st.gap ? `<p class="gap">Gap: ${esc(st.gap)}</p>` : "";
  const conflict = st.conflict
    ? `<div class="conflict${st.conflict.agrees ? " agrees" : ""}"><p class="conflict-note">${st.conflict.agrees ? "Other sources agree." : "Sources disagree."} ${esc(st.conflict.note)}</p><div class="parallel">${st.conflict.others.map((o) => `<blockquote>${esc(o.t)} ${supplementCite(data, o.cite, src)}</blockquote>`).join("")}</div></div>`
    : "";
  return `<li${kind} title="${esc(srcLabel(data, st.cite, src))}"><p>${label}${esc(st.t)}${external}${deps ? ` <span class="deps">${deps}</span>` : ""}</p>${conflict}${gap}${figs ? `<div class="figs">${figs}</div>` : ""}</li>`;
}
const sectionsHtml = (secs: Section[], src: string, chapter?: number) =>
  secs.map((s) => `${s.title ? `<h3>${esc(s.title)}</h3>` : ""}<ol class="steps">${s.steps.map((st) => stepHtml(st, src, chapter)).join("")}</ol>`).join("");

function partsHtml(parts: Part[], src: string, check?: string): string {
  const groups: [Part["replace"], string][] = [["always", "Replace"], ["inspect", "Replace if worn or damaged"], ["consumable", "Consumables"]];
  return groups.map(([kind, title]) => {
    const list = parts.filter((p) => p.replace === kind);
    if (!list.length) return "";
    const items = list.map((p) => {
      const key = `${check ?? ""}:${p.name}`;
      const box = check ? `<input type="checkbox" data-done-key="${esc(key)}" aria-label="Done: ${esc(p.name)}"> ` : "";
      return `<li class="part part-${kind}" data-key="${esc(key)}" title="${esc(srcLabel(data, p.cite, src))}">${box}<span class="name">${esc(p.name)}</span>${p.spec_ref ? ` ${specLink(p.spec_ref)}` : ""}${p.note ? ` <span class="pnote">${esc(p.note)}</span>` : ""}</li>`;
    }).join("");
    return `<section class="parts parts-${kind}"><h4>${title}</h4><ul class="checklist">${items}</ul></section>`;
  }).join("");
}

const tasksFor = (id: string): Task[] => data.schedule.tasks.filter((t) => t.op === id);
const intervalLabel = (id: string) => data.schedule.intervals.find((i) => i.id === id)?.label ?? id;
const whenText = (t: Task) => [...t.at.map(intervalLabel), t.other].filter(Boolean).join(", ");

function sourcePages(op: Operation): string {
  const bySrc = new Map<string, Set<string>>();
  const add = (c: Cite) => {
    const s = c.s ?? op.source;
    if (s === "forum") return;
    const label = c.p ? printedLabel(data, s, c.p) || `PDF ${c.p}` : "";
    if (!bySrc.has(s)) bySrc.set(s, new Set());
    bySrc.get(s)!.add(label);
  };
  op.sections.forEach((s) => s.steps.forEach((st) => add(st.cite)));
  return [...bySrc.entries()].map(([s, ps]) => `${data.sources[s]?.short ?? s} p${[...ps].sort((a, b) => parseInt(a) - parseInt(b)).join(", ")}`).join("; ");
}

function opBody(op: Operation, full: boolean): string {
  const sk = opSection.get(op.id);
  const deps = depsOf(op);
  const users = neededByOp(op.id);
  const sched = tasksFor(op.id);
  const specs = op.spec_refs?.length
    ? `<section class="box"><h3>Specifications</h3><dl>${op.spec_refs.map((r) => { const h = findSpec(data, r); return h ? `<dt>${rowLabel(h.row)}</dt><dd>${specLink(r)}</dd>` : ""; }).join("")}</dl></section>`
    : "";
  const H = full ? "h1" : "h2";
  return `<article class="op" id="op-${op.id}">
  ${full && sk ? `<p class="crumb">${refLink(sk)}</p>` : ""}
  <${H}>${full ? esc(op.title) : `<a href="/ops/${op.id}.html">${esc(op.title)}</a>`}</${H}>
  ${sched.length ? `<p class="when">Schedule: ${sched.map((t) => `${esc(t.task)} (${esc(whenText(t))})`).join("; ")}.</p>` : ""}
  ${op.summary ? `<p class="summary">${esc(op.summary.t)}</p>` : ""}
  ${deps.length ? `<p class="needs"><span class="lbl">Do first or have ready:</span> ${deps.map(depLink).join(" ")}</p>` : ""}
  ${op.issue && data.issues.has(op.issue) ? `<p class="needs"><span class="lbl">Known issue:</span> <a href="/issues/${op.issue}.html">${esc(data.issues.get(op.issue)!.title)}</a></p>` : ""}
  ${specs}
  ${op.parts?.length ? `<section class="box"><h3>Parts and materials</h3>${partsHtml(op.parts, op.source)}</section>` : ""}
  ${full ? sectionsHtml(op.sections, op.source, op.chapter) : ""}
  ${full && users.length ? `<p class="needs"><span class="lbl">Needed by:</span> ${users.map((u) => opLink(u)).join(" ")}</p>` : ""}
  ${full ? `<p class="provenance">Paraphrased from ${esc(sourcePages(op))}.</p>` : ""}
</article>`;
}

// ---------- book pages ----------
function sectionBody(c: BookChapter, s: BookSection): string {
  const ops = (s.ops ?? []).map((o) => data.ops.get(o)).filter((o): o is Operation => !!o);
  const key = sectionKey(c, s);
  const users = [...(neededBy.get(`ref:${key}`) ?? [])];
  const parts = new Map<string, Part>();
  for (const op of ops) for (const p of op.parts ?? []) if (!parts.has(p.name)) parts.set(p.name, { ...p, cite: { s: op.source, ...p.cite } });
  return `${s.summary?.length ? s.summary.map((x) => `<p class="summary">${esc(x.t)}</p>`).join("") : ""}
  ${!s.written ? `<p class="gap">This section is not written yet.</p>` : ""}
  ${ops.length ? `<p class="toc">Procedures: ${ops.map((o) => `<a href="#op-${o.id}">${esc(o.title)}</a>`).join(" · ")}</p>` : ""}
  ${parts.size ? `<section class="box"><h3>Parts and materials in this section</h3>${partsHtml([...parts.values()], "clymer")}</section>` : ""}
  ${ops.map((o) => `<article class="op" id="op-${o.id}"><h2><a href="/ops/${o.id}.html">${esc(o.title)}</a></h2>${o.summary ? `<p class="summary">${esc(o.summary.t)}</p>` : ""}${depsOf(o).length ? `<p class="needs"><span class="lbl">Do first or have ready:</span> ${depsOf(o).map(depLink).join(" ")}</p>` : ""}${sectionsHtml(o.sections, o.source, o.chapter)}</article>`).join("")}
  ${users.length ? `<p class="needs"><span class="lbl">Other procedures need this section:</span> ${users.map((u) => opLink(u)).join(" ")}</p>` : ""}`;
}

function pagesBook(): void {
  const chList = data.book.map((c) => `<li><a href="/book/ch${nn(c.n)}/">Chapter ${c.n}: ${esc(c.title)}</a> <span class="meta">${c.sections.filter((s) => s.written).length} of ${c.sections.length} sections written</span><ul class="secs">${c.sections.map((s) => `<li class="${s.written ? "" : "unwritten"}">${refLink(sectionKey(c, s), s.title).replace(/ <span class="ch">.*?<\/span>/, "")}</li>`).join("")}</ul></li>`).join("");
  write("book/index.html", layout("Book", "book", `<h1>Book</h1><p>The chapters and sections of the Clymer manual, paraphrased in ASD-STE100 Simplified Technical English for a 2006 KLR650. Each procedure shows what you must do first and which parts you need.</p><ol class="chapters">${chList}</ol>`));
  for (const c of data.book) {
    write(`book/ch${nn(c.n)}/index.html`, layout(`Chapter ${c.n}`, "book", `<p class="crumb"><a href="/book/">Book</a></p><h1>Chapter ${c.n}: ${esc(c.title)}</h1><ol class="secs">${c.sections.map((s) => `<li>${refLink(sectionKey(c, s), s.title).replace(/ <span class="ch">.*?<\/span>/, "")}${s.summary?.[0] ? `<p class="meta">${esc(s.summary[0].t)}</p>` : ""}</li>`).join("")}</ol>`));
    c.sections.forEach((s, i) => {
      const prev = c.sections[i - 1], next = c.sections[i + 1];
      const pager = `<p class="pager">${prev ? `<a href="/book/ch${nn(c.n)}/${prev.id}.html" rel="prev">${esc(prev.title)}</a>` : ""} <a href="/book/ch${nn(c.n)}/">Chapter ${c.n}</a> ${next ? `<a href="/book/ch${nn(c.n)}/${next.id}.html" rel="next">${esc(next.title)}</a>` : ""}</p>`;
      write(`book/ch${nn(c.n)}/${s.id}.html`, layout(s.title, "book", `<p class="crumb"><a href="/book/">Book</a> · <a href="/book/ch${nn(c.n)}/">Chapter ${c.n}: ${esc(c.title)}</a></p><h1>${esc(s.title)}</h1>${sectionBody(c, s)}${pager}`));
      write(`frag/section/${nn(c.n)}-${s.id}.html`, `<p class="crumb">Chapter ${c.n}: ${esc(c.title)}</p><h1>${esc(s.title)}</h1>${sectionBody(c, s)}`);
    });
  }
}

// ---------- schedule, parts, milestones ----------
const MILESTONES = [500, ...Array.from({ length: 8 }, (_, i) => (i + 1) * 3000)];
const dueAt = (mi: number): Task[] =>
  data.schedule.tasks.filter((t) => t.at.some((a) => (a === "initial-500" ? mi === 500 : (() => { const e = data.schedule.intervals.find((i) => i.id === a)?.every_mi; return e ? mi % e === 0 : false; })())) || (t.every_mi ? mi % t.every_mi === 0 : false));
const timeOnly = () => data.schedule.tasks.filter((t) => !t.at.length && !t.every_mi);
function partsForTasks(tasks: Task[]): Part[] {
  const seen = new Map<string, Part>();
  for (const t of tasks) {
    const op = t.op ? data.ops.get(t.op) : undefined;
    for (const p of op?.parts ?? []) if ((!t.parts || t.parts.includes(p.name)) && !seen.has(p.name)) seen.set(p.name, { ...p, cite: { s: op!.source, ...p.cite } });
  }
  return [...seen.values()];
}
function milestoneFrag(mi: number): string {
  const tasks = dueAt(mi);
  const parts = partsForTasks(tasks);
  return `<section class="milestone"><h2>${mi.toLocaleString("en-US")} miles</h2>
  <ol class="due checklist">${tasks.map((t) => `<li data-key="${mi}:task:${esc(t.task)}"><input type="checkbox" data-done-key="${mi}:task:${esc(t.task)}" aria-label="Done: ${esc(t.task)}"> <span class="name">${t.op ? opLink(t.op, t.task) : esc(t.task)}</span></li>`).join("")}</ol>
  <h3>Parts and materials</h3>${parts.length ? partsHtml(parts, "clymer", String(mi)) : `<p class="gap">No parts are cited for these tasks yet.</p>`}
  <p class="hint">A ticked item moves to the bottom of its list. This browser keeps the ticks.</p></section>`;
}
function timelineSvg(): string {
  const W = 760, x0 = 30, x1 = W - 20, max = MILESTONES[MILESTONES.length - 1];
  const x = (mi: number) => x0 + ((x1 - x0) * mi) / max;
  const marks = MILESTONES.map((mi) => { const n = dueAt(mi).length, r = 6 + Math.min(n, 30) / 2.5; return `<a href="/parts.html?mi=${mi}" hx-get="/frag/milestone/${mi}.html" hx-target="#milestone" hx-push-url="/parts.html?mi=${mi}"><g class="mark"><title>${mi} miles: ${n} tasks</title><circle cx="${x(mi)}" cy="50" r="${r}"/><text x="${x(mi)}" y="${50 + r + 16}" text-anchor="middle">${mi >= 1000 ? `${mi / 1000}k` : mi}</text><text class="n" x="${x(mi)}" y="54" text-anchor="middle">${n}</text></g></a>`; }).join("");
  return `<svg class="timeline" viewBox="0 0 ${W} 120" role="img" aria-labelledby="tl"><title id="tl">Service milestones by odometer reading. The number in each circle is the quantity of tasks.</title><line x1="${x0}" y1="50" x2="${x1}" y2="50"/>${marks}</svg>`;
}

// ---------- other pages ----------
function pageHome(): string {
  const written = data.book.reduce((n, c) => n + c.sections.filter((s) => s.written).length, 0);
  const total = data.book.reduce((n, c) => n + c.sections.length, 0);
  return layout("Home", "home", `<h1>KLR650 service wiki</h1>
<p class="lede">Service procedures for a 2006 Kawasaki KLR650 (KL650A). The text is a paraphrase of the Clymer manual in ASD-STE100 Simplified Technical English. The Kawasaki manuals and klr650.net threads supply corrections and additions.</p>
<ul class="cards">
<li><a href="/book/">Book</a><span>${written} of ${total} sections written. Each procedure shows what you must do first.</span></li>
<li><a href="/schedule.html">Maintenance schedule</a><span>Each task links to its procedure.</span></li>
<li><a href="/parts.html">Parts per service</a><span>The parts and materials for each mileage.</span></li>
<li><a href="/specs.html">Specifications</a><span>${[...data.tables.values()].reduce((n, t) => n + t.rows.length, 0)} values from ${data.tables.size} tables, with torque values.</span></li>
<li><a href="/issues/">Known issues</a><span>Gen 1 problems that owners report.</span></li>
<li><a href="/search.html">Search</a><span>Procedures, specifications and photos.</span></li>
</ul>
<h2>Sources</h2>
<p>If the sources disagree, the Clymer value is first because Clymer is the only manual for 2003 to 2006. The other value is shown next to it.</p>
<ul class="sources">${Object.values(data.sources).map((s) => `<li>${esc(s.title)}${s.covers ? ` <span class="meta">(${esc(s.covers)})</span>` : ""}</li>`).join("")}<li>klr650.net: ${data.threads.size} threads, saved locally.</li></ul>`);
}

function pageSchedule(): string {
  const iv = data.schedule.intervals;
  const rows = data.schedule.tasks.map((t) => `<tr><th scope="row">${t.op ? opLink(t.op, t.task) : esc(t.task)}</th>${iv.map((i) => `<td class="x">${t.at.includes(i.id) ? "✕" : ""}</td>`).join("")}<td>${esc(t.other ?? "")}</td></tr>`).join("");
  return layout("Maintenance schedule", "schedule", `<h1>Maintenance schedule</h1>
<p>From Clymer Table 1 (${esc(srcLabel(data, data.schedule.cite))}). Point to a task to see its procedure.</p>
${timelineSvg()}
<table class="schedule"><thead><tr><th scope="col">Task</th>${iv.map((i) => `<th scope="col">${esc(i.label)}</th>`).join("")}<th scope="col">Other interval</th></tr></thead><tbody>${rows}</tbody></table>
${Object.entries(data.schedule.footnotes ?? {}).map(([k, v]) => `<p class="meta">${esc(k)} ${esc(v)}</p>`).join("")}
<p class="meta">The maintenance chart of the Kawasaki 650 supplement is not used. In this copy of the PDF, the odometer columns of that chart are missing.</p>`);
}

function pageParts(): string {
  return layout("Parts per service", "parts", `<h1>Parts and materials per service</h1>
<p>Select a mileage. The tasks come from the maintenance schedule. The parts come from the procedure of each task.</p>
${timelineSvg()}
<p class="milestone-buttons">${MILESTONES.map((mi) => `<button hx-get="/frag/milestone/${mi}.html" hx-target="#milestone" hx-push-url="/parts.html?mi=${mi}">${mi.toLocaleString("en-US")}</button>`).join(" ")}</p>
<div id="milestone">${milestoneFrag(6000)}</div>
<h2>Tasks by time</h2><ul>${timeOnly().map((t) => `<li>${t.op ? opLink(t.op, t.task) : esc(t.task)}: ${esc(t.other)}</li>`).join("")}</ul>`);
}

function pageSpecs(): string {
  const byCh = new Map<string, typeof data.tables extends Map<string, infer T> ? T[] : never>();
  for (const t of data.tables.values()) byCh.set(t.chapter, [...(byCh.get(t.chapter) ?? []), t]);
  for (const t of data.tables.values()) write(`frag/spec/${t.id}.html`, `<h1>${esc(t.title)}</h1><table class="spec">${t.rows.map((r) => `<tr class="${yearClass(r).trim()}"><th>${rowLabel(r)}</th><td>${specValue(r, t.kind)}</td></tr>`).join("")}</table>`);
  return layout("Specifications", "specs", `<h1>Specifications</h1>
<p>Each table is a transcription from the page image. Rows for other model years are grey. Rows for 2006 are green.</p>
<input type="search" class="filter" data-filter="tr.row" placeholder="Filter, for example axle, valve, spark plug" aria-label="Filter specifications">
${[...byCh.entries()].map(([ch, ts]) => `<h2>${esc(ch)}</h2>${ts.map((t) => `<table class="spec" id="${t.id}"><caption>${esc(t.title)} <span class="src">${esc(srcLabel(data, t.cite))}</span></caption>${t.note ? `<tbody><tr><td colspan="2" class="meta">${esc(t.note)}</td></tr></tbody>` : ""}<tbody>${t.rows.map((r) => `<tr class="row${yearClass(r)}" data-search="${esc(`${t.title} ${r.group ?? ""} ${r.item}`.toLowerCase())}"><th scope="row">${rowLabel(r)}${r.realigned ? ` <span class="flag" title="In this copy the value is on the heading line. It was moved down and compared with Clymer.">moved</span>` : ""}</th><td>${specValue(r, t.kind)}</td></tr>`).join("")}</tbody></table>`).join("")}`).join("")}`);
}

function pageFigures(): string {
  const uses = (f: Figure) => {
    const out: { op: Operation; st: Step }[] = [];
    for (const op of data.ops.values()) for (const s of op.sections) for (const st of s.steps) if ((st.chapter ?? op.chapter) === f.chapter && st.figs?.includes(f.n)) out.push({ op, st });
    return out;
  };
  const cards = data.figures.map((f) => ({ f, u: uses(f) })).filter((x) => x.u.length).sort((a, b) => a.f.chapter - b.f.chapter || a.f.n - b.f.n);
  return layout("Photos", "figures", `<h1>Photos</h1><p>Demonstration photos from the Clymer manual, with the steps that use them. Type a part name to find its photos.</p>
<input type="search" class="filter" data-filter=".fig-card" placeholder="For example drain plug, chain, caliper" aria-label="Filter photos">
<ul class="figures">${cards.map(({ f, u }) => `<li class="fig-card" data-search="${esc(u.map((x) => `${x.op.title} ${x.st.t}`).join(" ").toLowerCase())}">${photo(f)}<ul>${u.map((x) => `<li>${esc(x.st.t)} ${opLink(x.op.id)}</li>`).join("")}</ul></li>`).join("")}</ul>`);
}

function pagesIssues(): void {
  const list = [...data.issues.values()];
  write("issues/index.html", layout("Known issues", "issues", `<h1>Known issues</h1><p>Gen 1 problems that the manuals do not cover, or cover only in part. Most information comes from saved klr650.net threads. That information is owner experience, not factory data.</p><ul>${list.map((i) => `<li><a href="/issues/${i.id}.html">${esc(i.title)}</a></li>`).join("")}</ul>`));
  for (const is of list)
    write(`issues/${is.id}.html`, layout(is.title, "issues", `<article class="op"><h1>${esc(is.title)}</h1>${is.summary.map((s) => `<p class="summary">${esc(s.t)} ${supplementCite(data, s.cite)}</p>`).join("")}${is.ops?.length ? `<p class="needs"><span class="lbl">Procedures:</span> ${is.ops.map((o) => opLink(o)).join(" ")}</p>` : ""}${sectionsHtml(is.sections, "forum")}</article>`));
}

function pagesCommunity(): void {
  for (const t of data.threads.values()) {
    write(`community/${t.slug}.html`, layout(t.title, "", `<h1>${esc(t.title)}</h1><p class="meta">Saved from <a href="${esc(t.url)}" rel="noreferrer">klr650.net</a> on ${esc(t.fetched)}.</p>${[...t.posts.values()].map((p) => `<article class="post" id="post-${p.n}"><h3>Post ${p.n}, ${esc(p.author)}, ${esc(p.date)}</h3><div class="post-text">${esc(p.text).replace(/\n/g, "<br>")}</div></article>`).join("")}`));
    for (const p of t.posts.values()) write(`frag/post/${t.slug}/${p.n}.html`, `<p class="crumb">${esc(t.title)}</p><h1>Post ${p.n}, ${esc(p.author)}, ${esc(p.date)}</h1><div class="post-text">${esc(p.text).replace(/\n/g, "<br>")}</div>`);
  }
}

function pageVerify(): string {
  return layout("Build checks", "verify", `<h1>Build checks</h1><p>The build stops if a value has no valid citation. This build had ${data.errors.length} such errors.</p>
<h2>Warnings (${data.warnings.length})</h2><ul>${data.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
<h2>Numbers not found on the cited page (${misses.length})</h2><p class="meta">The text layer of a scan can garble a number. Each item here needs a comparison with the page image.</p><ul>${misses.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`);
}

function searchIndex(): string {
  const idx: { k: string; t: string; x: string; u: string }[] = [];
  for (const op of data.ops.values()) idx.push({ k: "Procedure", t: op.title, x: [op.summary?.t ?? "", ...op.sections.flatMap((s) => s.steps.map((st) => st.t))].join(" "), u: `/ops/${op.id}.html` });
  for (const [key, { s }] of sections) idx.push({ k: "Section", t: s.title, x: (s.summary ?? []).map((x) => x.t).join(" "), u: sectionHref(key) });
  for (const t of data.tables.values()) for (const r of t.rows) idx.push({ k: "Specification", t: `${t.title}: ${r.group ? r.group + ", " : ""}${r.item}${r.years ? ` (${r.years})` : ""}`, x: specValue(r, t.kind).replace(/<[^>]+>/g, ""), u: `/specs.html#${t.id}` });
  for (const is of data.issues.values()) idx.push({ k: "Known issue", t: is.title, x: is.summary.map((s) => s.t).join(" "), u: `/issues/${is.id}.html` });
  return JSON.stringify(idx);
}

// ---------- write ----------
write("index.html", pageHome());
pagesBook();
for (const op of data.ops.values()) {
  write(`ops/${op.id}.html`, layout(op.title, "book", opBody(op, true)));
  write(`frag/op/${op.id}.html`, opBody(op, true));
}
write("schedule.html", pageSchedule());
write("parts.html", pageParts());
for (const mi of MILESTONES) write(`frag/milestone/${mi}.html`, milestoneFrag(mi));
write("specs.html", pageSpecs());
write("figures.html", pageFigures());
pagesIssues();
pagesCommunity();
write("search.html", layout("Search", "search", `<h1>Search</h1><input type="search" id="q" placeholder="For example front fork, drain plug, 23 N·m" aria-label="Search" autofocus><ol id="results"></ol>`));
write("search-index.json", searchIndex());
write("verify.html", pageVerify());
mkdirSync(join(DIST, "assets"), { recursive: true });
copyFileSync(join(ROOT, "node_modules", "htmx.org", "dist", "htmx.min.js"), join(DIST, "assets", "htmx.min.js"));
copyFileSync(join(ROOT, "site", "static", "style.css"), join(DIST, "assets", "style.css"));
console.log(`Built ${data.ops.size} procedures, ${sections.size} book sections, ${data.tables.size} spec tables, ${data.issues.size} issues. ${data.warnings.length} warnings, ${misses.length} number misses.`);
