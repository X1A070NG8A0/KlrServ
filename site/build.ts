// Static site generator. Reads data/ and doc/, validates citations, writes dist/.
// `node site/build.ts --check` validates only and writes nothing.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { dirname, join } from "node:path";
import type { BookChapter, BookSection, Cite, Diagram, Figure, Operation, Part, Section, Step, Task } from "./lib/data.ts";
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
// <pop-link>: hovering a dependency opens a floating window with the full
// target (site/client/pop-link.js). Clicking follows the link as usual.
const preview = (href: string, frag: string, label: string, cls = "dep") =>
  `<pop-link class="${cls}"><a href="${href}" data-pop="${frag}">${label}</a></pop-link>`;
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
const photo = (f: Figure) => `<photo-zoom><figure class="photo"><a href="/${f.file}"><img src="/${f.file}" alt="Clymer Chapter ${f.chapter} figure ${f.n}" loading="lazy"></a><figcaption>Clymer fig. ${f.chapter}-${f.n}</figcaption></figure></photo-zoom>`;

// ---------- diagrams (HTML-native: SVG plus an ordered legend) ----------
const shownDiagrams = new Set<string>(); // reset for each procedure: a diagram shows once, later steps link to it
function diagramHtml(d: Diagram): string {
  if (shownDiagrams.has(d.id)) return `<p class="see"><a href="#diag-${d.id}">${esc(d.title)}: see the diagram above</a></p>`;
  shownDiagrams.add(d.id);
  const shapes = (d.shapes ?? []).map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="3" class="outline"/>${s.label ? `<text x="${s.x + s.w / 2}" y="${s.y + s.h + 6}" text-anchor="middle" class="cap">${esc(s.label)}</text>` : ""}`).join("");
  const pts = d.points.map((p) => `<g class="pt"><title>${esc(p.n)}: ${esc(p.label)}</title><circle cx="${p.x}" cy="${p.y}" r="${p.n.length > 2 ? 6 : 4.2}"/><text x="${p.x}" y="${p.y + 1.6}" text-anchor="middle">${esc(p.n)}</text></g>`).join("");
  const legend = d.points.map((p) => `<li><b>${esc(p.n)}</b> ${esc(p.label)}</li>`).join("");
  return `<bolt-sequence><figure class="diagram" id="diag-${d.id}"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(d.title)}">${shapes}${pts}</svg><figcaption><b>${esc(d.title)}</b>${d.note ? ` ${esc(d.note)}` : ""}<ol class="legend">${legend}</ol><span class="src">${esc(srcLabel(data, d.cite))}</span></figcaption></figure></bolt-sequence>`;
}

// ---------- steps and operations ----------
function stepHtml(st: Step, src: string, chapter?: number): string {
  const kind = st.kind ? ` class="${st.kind}"` : "";
  const label = st.kind ? `<span class="kind">${st.kind}</span> ` : "";
  const deps = [st.ref && refLink(st.ref), st.op && opLink(st.op), st.spec_ref && specLink(st.spec_ref)].filter(Boolean).join(" ");
  const figs = (st.figs ?? []).map((n) => figFor(st.chapter ?? chapter, n)).filter((f): f is Figure => !!f).map(photo).join("");
  const external = st.cite.s && st.cite.s !== "clymer" && st.cite.s !== src ? ` ${supplementCite(data, st.cite, src)}` : (src !== "clymer" ? ` ${supplementCite(data, st.cite, src)}` : "");
  const gap = st.gap ? `<p class="gap">Gap: ${esc(st.gap)}</p>` : "";
  const diag = st.diagram && data.diagrams.has(st.diagram) ? diagramHtml(data.diagrams.get(st.diagram)!) : "";
  const conflict = st.conflict
    ? `<div class="conflict${st.conflict.agrees ? " agrees" : ""}"><p class="conflict-note">${st.conflict.agrees ? "Other sources agree." : "Sources disagree."} ${esc(st.conflict.note)}</p><div class="parallel">${st.conflict.others.map((o) => `<blockquote>${esc(o.t)} ${supplementCite(data, o.cite, src)}</blockquote>`).join("")}</div></div>`
    : "";
  return `<li${kind} title="${esc(srcLabel(data, st.cite, src))}"><p>${label}${esc(st.t)}${external}${deps ? ` <span class="deps">${deps}</span>` : ""}</p>${conflict}${gap}${diag}${figs ? `<div class="figs">${figs}</div>` : ""}</li>`;
}
const sectionsHtml = (secs: Section[], src: string, chapter?: number) =>
  (shownDiagrams.clear(), secs).map((s) => `${s.title ? `<h3>${esc(s.title)}</h3>` : ""}<ol class="steps">${s.steps.map((st) => stepHtml(st, src, chapter)).join("")}</ol>`).join("");

function partsHtml(parts: Part[], src: string, check?: string): string {
  const groups: [Part["replace"], string][] = [["always", "Replace"], ["inspect", "Replace if worn or damaged"], ["consumable", "Consumables"]];
  return groups.map(([kind, title]) => {
    const list = parts.filter((p) => p.replace === kind && !isToolPart(p));
    if (!list.length) return "";
    const items = list.map((p) => {
      const key = `${check ?? ""}:${p.name}`;
      const box = check ? `<input type="checkbox" data-done-key="${esc(key)}" aria-label="Done: ${esc(p.name)}"> ` : "";
      return `<li class="part part-${kind}" data-key="${esc(key)}" title="${esc(srcLabel(data, p.cite, src))}">${box}<span class="name">${esc(p.name)}</span>${p.spec_ref ? ` ${specLink(p.spec_ref)}` : ""}${p.note ? ` <span class="pnote">${esc(p.note)}</span>` : ""}${subNotes("part", p.name)}</li>`;
    }).join("");
    const ul = `<ul class="checklist">${items}</ul>`;
    return `<section class="parts parts-${kind}"><h4>${title}</h4>${check ? `<check-list>${ul}</check-list>` : ul}</section>`;
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
  ${op.parts?.some((p) => !isToolPart(p)) ? `<section class="box"><h3>Parts and materials</h3>${partsHtml(op.parts!, op.source)}</section>` : ""}
  ${toolsBox(op)}
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
  return `${s.summary?.length ? s.summary.map((x) => `<p class="summary">${esc(x.t)}</p>`).join("") : ""}
  ${!s.written ? `<p class="gap">This section is not written yet.</p>` : ""}
  ${ops.length > 1 ? `<p class="toc">Procedures: ${ops.map((o) => `<a href="#op-${o.id}">${esc(o.title)}</a>`).join(" · ")}</p>` : ""}
  ${ops.map((o) => `<article class="op" id="op-${o.id}"><h2><a href="/ops/${o.id}.html">${esc(o.title)}</a></h2>${o.summary ? `<p class="summary">${esc(o.summary.t)}</p>` : ""}${depsOf(o).length ? `<p class="needs"><span class="lbl">Do first or have ready:</span> ${depsOf(o).map(depLink).join(" ")}</p>` : ""}${o.parts?.some((p) => !isToolPart(p)) ? `<section class="box"><h3>Parts and materials</h3>${partsHtml(o.parts!, o.source)}</section>` : ""}${toolsBox(o)}${sectionsHtml(o.sections, o.source, o.chapter)}</article>`).join("")}
  ${users.length ? `<p class="needs"><span class="lbl">Other procedures need this section:</span> ${users.map((u) => opLink(u)).join(" ")}</p>` : ""}`;
}

// ---------- tools (found in the cited step text, see data/tools.yaml) ----------
type ToolDef = { id: string; name: string; group: string; torque?: boolean; re: RegExp[]; sizes: RegExp[]; kinds: [RegExp, string][]; specs?: RegExp };
type ToolUse = { id: string; name: string; group: string; why: string[]; variants: Map<string, Set<string>> };
const toolDefs: ToolDef[] = [];
const toolGroups: string[] = [];
type RawTool = { id: string; name: string; match: string[]; torque?: boolean; sizes?: string[]; kinds?: Record<string, string>; specs?: string };
for (const g of (YAML.parse(readFileSync(join(ROOT, "data", "tools.yaml"), "utf8")).groups ?? []) as { name: string; tools: RawTool[] }[]) {
  toolGroups.push(g.name);
  for (const t of g.tools)
    toolDefs.push({ id: t.id, name: t.name, group: g.name, torque: t.torque, re: t.match.map((m) => new RegExp(m, "i")), sizes: (t.sizes ?? []).map((m) => new RegExp(m, "gi")), kinds: Object.entries(t.kinds ?? {}).map(([k, v]) => [new RegExp(k, "i"), v] as [RegExp, string]), specs: t.specs ? new RegExp(t.specs, "i") : undefined });
}
const KAW = "Kawasaki special tools";
toolGroups.push(KAW);
const isTorqueRef = (ref?: string) => !!ref && findSpec(data, ref)?.table.kind === "torque";
// A "part" that is really a tool: a Kawasaki tool number, or a name the tool
// dictionary knows that is not a material (grease for the puller is a material).
function isToolPart(p: Part): boolean {
  if (/57001-\d{3,4}/.test(p.name)) return true;
  if (/grease|oil|sealant|compound|lubricant|cleaner|fluid|solvent/i.test(p.name)) return false;
  return toolDefs.some((d) => d.re.some((r) => r.test(p.name)));
}
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
// A spec row as a variant label, for example "new 0.10-0.20 (0.004-0.008): Valve clearance, Intake".
const specVariant = (ref: string): string | undefined => (findSpec(data, ref) ? `spec:${ref}` : undefined);
function toolsFor(op: Operation): ToolUse[] {
  const found = new Map<string, ToolUse>();
  const add = (id: string, name: string, group: string, why: string) => {
    if (!found.has(id)) found.set(id, { id, name, group, why: [], variants: new Map() });
    const w = found.get(id)!.why;
    if (!w.includes(why) && w.length < 3) w.push(why);
    return found.get(id)!;
  };
  const variant = (u: ToolUse, v: string) => {
    if (!u.variants.has(v)) u.variants.set(v, new Set());
    u.variants.get(v)!.add(op.title);
  };
  for (const sec of op.sections)
    for (const st of sec.steps) {
      for (const d of toolDefs) {
        if (d.re.some((r) => r.test(st.t))) {
          const u = add(d.id, d.name, d.group, st.t);
          // Sizes come from the step and from its cited page, where the page names the same tool.
          const src = st.cite.s ?? op.source;
          const page = src !== "forum" && st.cite.p ? (data.pageText(src, st.cite.p) ?? "").replace(/\s+/g, " ") : "";
          for (const r of d.sizes) for (const text of [st.t, page]) for (const m of text.matchAll(r)) variant(u, `${m[1]} mm`);
          for (const [r, label] of d.kinds) if (r.test(st.t)) variant(u, label);
          if (d.specs && st.spec_ref && d.specs.test(st.spec_ref)) { const v = specVariant(st.spec_ref); if (v) variant(u, v); }
          // Procedure-wide specs only for selective tools (feeler gauge: clearance|gap), never for catch-all ones.
          if (d.specs && d.specs.source !== ".") for (const ref of op.spec_refs ?? []) if (!isTorqueRef(ref) && d.specs.test(ref)) { const v = specVariant(ref); if (v) variant(u, v); }
        } else if (d.torque && isTorqueRef(st.spec_ref)) add(d.id, d.name, d.group, `${st.t} (torque value)`);
      }
      for (const m of st.t.matchAll(/57001-\d{3,4}/g)) add(`kaw-${m[0]}`, `Kawasaki special tool ${m[0]}`, KAW, st.t);
    }
  // Some writers listed special tools as parts; those count as tools here.
  for (const p of op.parts ?? []) {
    if (!isToolPart(p)) continue;
    for (const m of p.name.matchAll(/57001-\d{3,4}/g)) add(`kaw-${m[0]}`, `Kawasaki special tool ${m[0]}`, KAW, p.name);
    for (const d of toolDefs) if (d.re.some((r) => r.test(p.name))) {
      const u = add(d.id, d.name, d.group, p.name);
      for (const r of d.sizes) for (const m of p.name.matchAll(r)) variant(u, `${m[1]} mm`);
    }
  }
  const torqueDef = toolDefs.find((d) => d.torque);
  if (torqueDef && op.spec_refs?.some(isTorqueRef)) add(torqueDef.id, torqueDef.name, torqueDef.group, "This procedure has torque specifications.");
  return [...found.values()].sort((a, b) => toolGroups.indexOf(a.group) - toolGroups.indexOf(b.group) || a.name.localeCompare(b.name));
}
const sortVariants = (vs: string[]) => vs.sort((a, b) => (parseFloat(a) || 1e9) - (parseFloat(b) || 1e9) || a.localeCompare(b));
// Variants: sizes and types as chips; values to measure as a table, folded
// into an expandable section when there are more than `fold` rows.
function variantsHtml(variants: Map<string, Set<string>>, fold: number): string {
  const keys = [...variants.keys()];
  const sizes = sortVariants(keys.filter((k) => !k.startsWith("spec:")));
  const rows = keys.filter((k) => k.startsWith("spec:")).map((k) => ({ k, hit: findSpec(data, k.slice(5))! })).filter((r) => r.hit)
    .map(({ k, hit }) => ({ k, label: `${hit.row.group ? `${hit.row.group}, ` : ""}${hit.row.item}`, row: hit.row, table: hit.table }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const opsTitle = (k: string) => esc([...variants.get(k)!].join(", "));
  let html = sizes.length ? `<p class="variants"><span class="lbl">Sizes and types:</span> <span class="chips">${sizes.map((v) => `<span class="chip" title="${opsTitle(v)}">${esc(v)}</span>`).join("")}</span></p>` : "";
  if (rows.length) {
    const limits = rows.some((r) => r.row.std !== undefined || r.row.limit !== undefined);
    const head = limits ? "<tr><th>Measurement</th><th>New</th><th>Limit</th></tr>" : "<tr><th>Measurement</th><th>Value</th></tr>";
    const body = rows.map((r) => `<tr title="${opsTitle(r.k)}"><th scope="row">${esc(r.label)}</th>${limits ? `<td>${esc(r.row.std ?? r.row.value ?? "")}</td><td>${esc(r.row.limit ?? "")}</td>` : `<td>${plain(specValue(r.row, r.table.kind))}</td>`}</tr>`).join("");
    const table = `<table class="vals"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    html += rows.length > fold ? `<details class="vals"><summary>Values to measure (${rows.length})</summary>${table}</details>` : `<p class="variants"><span class="lbl">Values to measure:</span></p>${table}`;
  }
  return html;
}
const toolIndex = new Map<string, ToolUse & { ops: Operation[] }>();
for (const op of data.ops.values())
  for (const t of toolsFor(op)) {
    if (!toolIndex.has(t.id)) toolIndex.set(t.id, { ...t, why: [...t.why], variants: new Map(), ops: [] });
    const agg = toolIndex.get(t.id)!;
    agg.ops.push(op);
    for (const [v, opsSet] of t.variants) {
      if (!agg.variants.has(v)) agg.variants.set(v, new Set());
      for (const o of opsSet) agg.variants.get(v)!.add(o);
    }
  }
// Community substitutes (data/substitutes.yaml), shown as notes on tools and parts.
// opId limits notes that apply to one procedure; with no opId (tool list) all
// notes show, with the procedure named.
const subNotes = (kind: "tool" | "part", key: string, opId?: string): string => {
  const list = data.substitutes.filter((x) => x.for[kind] === key && (!x.for.op || !opId || x.for.op === opId));
  const where = (x: (typeof list)[number]) => (!opId && x.for.op ? ` (for ${opLink(x.for.op)})` : "");
  return list.length ? `<ul class="subs">${list.map((x) => `<li${x.kind === "warning" ? ' class="warn"' : ""}><span class="lbl">${x.kind === "warning" ? "Owner warning" : "Substitute"}${where(x)}:</span> ${esc(x.t)} ${supplementCite(data, x.cite)}</li>`).join("")}</ul>` : "";
};
const toolsBox = (op: Operation): string => {
  const ts = toolsFor(op);
  if (!ts.length) return "";
  return `<section class="box"><h3>Tools</h3><ul class="tools">${ts.map((t) => `<li><a href="/tools.html#tool-${t.id}" title="${esc(t.why[0])}">${esc(t.name)}</a>${variantsHtml(t.variants, 3)}${subNotes("tool", t.id, op.id)}</li>`).join("")}</ul></section>`;
};

// ---------- full reference (book) ----------
const filterBox = (selector: string, placeholder: string) =>
  `<list-filter items="${selector}"><input type="search" class="filter" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></list-filter>`;
const secLink = (c: BookChapter, s: BookSection) => refLink(sectionKey(c, s), s.title).replace(/ <span class="ch">.*?<\/span>/, "");
function pagesBook(): void {
  const chList = data.book.map((c) => `<li class="chap" data-search="${esc(`${c.title} ${c.sections.map((s) => `${s.title} ${(s.ops ?? []).map((o) => data.ops.get(o)?.title ?? "").join(" ")}`).join(" ")}`.toLowerCase())}"><a href="/book/ch${nn(c.n)}/">Chapter ${c.n}: ${esc(c.title)}</a><ul class="secs">${c.sections.map((s) => `<li>${secLink(c, s)}</li>`).join("")}</ul></li>`).join("");
  write("book/index.html", layout("Full reference", "book", `<h1>Full reference</h1>
<p>All procedures of the service manual, chapter by chapter. Point to a link to see the procedure, its parts and its tools.</p>
${filterBox("li.chap", "Filter chapters, for example fork, clutch, stator")}
<p class="toc"><a href="/specs.html">Specifications</a> · <a href="/book/errata.html">Errata</a> · <a href="/figures.html">Photos</a> · <a href="/search.html">Search all</a></p>
<ol class="chapters">${chList}</ol>`));
  for (const c of data.book) {
    write(`book/ch${nn(c.n)}/index.html`, layout(`Chapter ${c.n}`, "book", `<p class="crumb"><a href="/book/">Full reference</a></p><h1>Chapter ${c.n}: ${esc(c.title)}</h1>${filterBox("ol.secs > li", "Filter this chapter")}<ol class="secs">${c.sections.map((s) => `<li data-search="${esc(`${s.title} ${(s.ops ?? []).map((o) => data.ops.get(o)?.title ?? "").join(" ")} ${s.summary?.[0]?.t ?? ""}`.toLowerCase())}">${secLink(c, s)}${s.summary?.[0] ? `<p class="meta">${esc(s.summary[0].t)}</p>` : ""}</li>`).join("")}</ol>`));
    c.sections.forEach((s, i) => {
      const prev = c.sections[i - 1], next = c.sections[i + 1];
      const pager = `<p class="pager">${prev ? `<a href="/book/ch${nn(c.n)}/${prev.id}.html" rel="prev">${esc(prev.title)}</a>` : ""} <a href="/book/ch${nn(c.n)}/">Chapter ${c.n}</a> ${next ? `<a href="/book/ch${nn(c.n)}/${next.id}.html" rel="next">${esc(next.title)}</a>` : ""}</p>`;
      write(`book/ch${nn(c.n)}/${s.id}.html`, layout(s.title, "book", `<p class="crumb"><a href="/book/">Full reference</a> · <a href="/book/ch${nn(c.n)}/">Chapter ${c.n}: ${esc(c.title)}</a></p><h1>${esc(s.title)}</h1>${sectionBody(c, s)}${pager}`));
      write(`frag/section/${nn(c.n)}-${s.id}.html`, `<p class="crumb">Chapter ${c.n}: ${esc(c.title)}</p><h1>${esc(s.title)}</h1>${sectionBody(c, s)}`);
    });
  }
}

function pageErrata(): string {
  const conflicts: string[] = [], gaps: string[] = [];
  for (const op of data.ops.values())
    for (const sec of op.sections)
      for (const st of sec.steps) {
        const item = (body: string) => `<li data-search="${esc(`${op.title} ${st.t} ${body.replace(/<[^>]+>/g, "")}`.toLowerCase())}">${opLink(op.id)}<p>${esc(st.t)}</p>${body}</li>`;
        if (st.conflict) conflicts.push(item(`<p class="conflict-note">${st.conflict.agrees ? "Other sources agree." : "Sources disagree."} ${esc(st.conflict.note)}</p><div class="parallel">${st.conflict.others.map((o) => `<blockquote>${esc(o.t)} ${supplementCite(data, o.cite, op.source)}</blockquote>`).join("")}</div>`));
        if (st.gap) gaps.push(item(`<p class="gap">${esc(st.gap)}</p>`));
      }
  return layout("Errata", "book", `<p class="crumb"><a href="/book/">Full reference</a></p><h1>Errata</h1>
<p>Owner reports, places where the sources disagree, and values that no source gives.</p>
${filterBox(".errata > li", "Filter errata, for example snap ring, torque, thermostat")}
<h2>Owner reports from klr650.net</h2><ul class="errata">${[...data.issues.values()].map((i) => `<li data-search="${esc(`${i.title} ${i.summary.map((s) => s.t).join(" ")}`.toLowerCase())}"><a href="/issues/${i.id}.html">${esc(i.title)}</a><p class="meta">${esc(i.summary[0]?.t ?? "")}</p></li>`).join("")}</ul>
<h2>Source disagreements (${conflicts.length})</h2><ul class="errata">${conflicts.join("")}</ul>
<h2>Values that the sources do not give (${gaps.length})</h2><ul class="errata">${gaps.join("")}</ul>`);
}

// ---------- routine maintenance ----------
// A task belongs to one or more mileage categories: 500 (the initial
// service) and each "every N miles" interval. One service lists its tasks in
// one box per category, so the reader sees which tasks come from the shorter
// intervals.
const taskCats = (t: Task): number[] => [...t.at.map((a) => (a === "initial-500" ? 500 : data.schedule.intervals.find((i) => i.id === a)?.every_mi ?? 0)), t.every_mi ?? 0].filter((n) => n > 0);
const EVERY = [...new Set(data.schedule.tasks.flatMap(taskCats))].filter((n) => n !== 500).sort((x, y) => x - y);
// A new bike: the initial service, then the first time each interval comes due.
const MILESTONES = [500, ...EVERY];
const miles = (mi: number) => mi.toLocaleString("en-US");
// Boxes for the service at odometer reading `mi`: its own category first, then
// the shorter intervals that also come due. At 500 miles, only the initial tasks.
function serviceBoxes(mi: number): { cat: number; tasks: Task[] }[] {
  const cats = mi === 500 ? [500] : EVERY.filter((c) => mi % c === 0).reverse();
  const done = new Set<Task>();
  return cats.map((cat) => {
    const tasks = data.schedule.tasks.filter((t) => !done.has(t) && taskCats(t).includes(cat));
    tasks.forEach((t) => done.add(t));
    return { cat, tasks };
  }).filter((b) => b.tasks.length);
}
const timeOnly = () => data.schedule.tasks.filter((t) => !t.at.length && !t.every_mi);
// Each tab has a real page. With JavaScript, <mileage-picker> gets that page
// and swaps only the section that holds the picker.
type Binder = { id: string; label: string; tabs: number[]; url: (mi: number) => string; tab: (mi: number) => string; key: (mi: number) => string };
const NEW_BIKE: Binder = { id: "new-bike", label: "New bike services", tabs: MILESTONES, url: (mi) => `/maintenance/${mi}.html`, tab: (mi) => `First ${miles(mi)} miles`, key: (mi) => `${mi}` };
const GENERAL: Binder = { id: "general", label: "Services by interval", tabs: EVERY, url: (mi) => `/maintenance/every-${mi}.html`, tab: (mi) => `Every ${miles(mi)} miles`, key: (mi) => `every-${mi}` };
function boxHtml(b: Binder, mi: number, box: { cat: number; tasks: Task[] }, own: boolean): string {
  const h = box.cat === 500 ? "Initial 500 mile tasks" : own ? `Every ${miles(box.cat)} mile tasks` : `Also do: every ${miles(box.cat)} mile tasks`;
  return `<div class="task-box${own ? " own" : ""}"><h4>${h}</h4>
  <check-list><ol class="due checklist">${box.tasks.map((t) => `<li><input type="checkbox" data-done-key="${b.key(mi)}:task:${esc(t.task)}" aria-label="Done: ${esc(t.task)}"> <span class="name">${t.op ? opLink(t.op, t.task) : esc(t.task)}</span></li>`).join("")}</ol></check-list></div>`;
}
function binderHtml(b: Binder, current: number): string {
  const boxes = serviceBoxes(current);
  return `<section id="${b.id}" class="binder">
<mileage-picker><nav class="binder-tabs" aria-label="${b.label}">${b.tabs.map((mi) => `<a href="${b.url(mi)}"${mi === current ? ' aria-current="true"' : ""}>${b.tab(mi)}</a>`).join("")}</nav></mileage-picker>
<div class="binder-page"><h3>${b.tab(current)}</h3>
${boxes.map((box, i) => boxHtml(b, current, box, i === 0)).join("")}
<p class="hint">Each procedure has its parts and tools. <span class="ticks-hint">A ticked task moves to the bottom of its box. This browser keeps the ticks.</span></p></div>
</section>`;
}
function pageMaintenance(newBike = MILESTONES[0], general = EVERY[0]): string {
  const iv = data.schedule.intervals;
  const rows = data.schedule.tasks.map((t) => `<tr class="task" data-search="${esc(`${t.task} ${t.op ? data.ops.get(t.op)?.title ?? "" : ""}`.toLowerCase())}"><th scope="row">${t.op ? opLink(t.op, t.task) : esc(t.task)}</th>${iv.map((i) => `<td class="x">${t.at.includes(i.id) ? "✕" : ""}</td>`).join("")}<td>${esc(t.other ?? "")}</td></tr>`).join("");
  return layout("Routine maintenance", "maint", `<h1>Routine maintenance</h1>
<p>Do each task at the odometer reading or the time interval in the table. Point to a task to see its procedure, its parts and its tools.</p>
${filterBox("tr.task", "Filter tasks, for example chain, valve, coolant")}
<table class="schedule"><thead><tr><th scope="col">Task</th>${iv.map((i) => `<th scope="col">${esc(i.label)}</th>`).join("")}<th scope="col">Other interval</th></tr></thead><tbody>${rows}</tbody></table>
${Object.entries(data.schedule.footnotes ?? {}).map(([k, v]) => `<p class="meta">${esc(k)} ${esc(v)}</p>`).join("")}
<h2>Service by interval</h2>
<p>Select an interval to get a checklist for that service. Each box holds the tasks of one interval. A longer service also includes the tasks of the shorter intervals that come due at the same time.</p>
${binderHtml(GENERAL, general)}
<h2>New bike services</h2>
<p>Select a service to get a checklist for a new or rebuilt motorcycle. After the first 500 miles, each tab is the first time that interval comes due.</p>
${binderHtml(NEW_BIKE, newBike)}
<h2>Tasks by time</h2><ul>${timeOnly().map((t) => `<li>${t.op ? opLink(t.op, t.task) : esc(t.task)}: ${esc(t.other)}</li>`).join("")}</ul>`);
}

// ---------- common repairs ----------
function pageRepairs(): string {
  const doc = YAML.parse(readFileSync(join(ROOT, "data", "common-repairs.yaml"), "utf8")) as { categories: { title: string; ops: string[]; issues?: string[] }[] };
  const missing = doc.categories.flatMap((c) => [...c.ops.filter((o) => !data.ops.has(o)), ...(c.issues ?? []).filter((i) => !data.issues.has(i))]);
  if (missing.length) { console.error(`common-repairs.yaml: unknown ids: ${missing.join(", ")}`); process.exit(1); }
  const firstSentence = (t?: string) => (t ?? "").split(/(?<=\.)\s/)[0];
  const cats = doc.categories.map((c) => `<section class="repair-cat"><h2>${esc(c.title)}</h2><ul class="repairs">${c.ops.map((o) => { const op = data.ops.get(o)!; return `<li data-search="${esc(`${c.title} ${op.title} ${op.summary?.t ?? ""}`.toLowerCase())}">${opLink(o)}${op.summary ? `<span class="meta"> ${esc(firstSentence(op.summary.t))}</span>` : ""}</li>`; }).join("")}${(c.issues ?? []).map((i) => { const is = data.issues.get(i)!; return `<li data-search="${esc(`${c.title} ${is.title}`.toLowerCase())}"><a href="/issues/${i}.html">${esc(is.title)}</a><span class="meta"> Owner reports.</span></li>`; }).join("")}</ul></section>`).join("");
  return layout("Common repairs", "repairs", `<h1>Common repairs</h1>
<p>Repairs that are not on the maintenance schedule: parts that break, get damaged or wear out early. Each procedure has its parts and tools.</p>
${filterBox("ul.repairs > li", "Filter repairs, for example flat, cable, bulb")}
${cats}`);
}

// ---------- tool list ----------
function pageTools(): string {
  const groups = toolGroups.map((g) => {
    const list = [...toolIndex.values()].filter((t) => t.group === g).sort((a, b) => b.ops.length - a.ops.length || a.name.localeCompare(b.name));
    if (!list.length) return "";
    return `<section><h2>${esc(g)}</h2><check-list><ul class="checklist toollist">${list.map((t) => `<li id="tool-${t.id}" data-search="${esc(`${t.name} ${t.ops.map((o) => o.title).join(" ")}`.toLowerCase())}"><input type="checkbox" data-done-key="tool:${t.id}" aria-label="I have: ${esc(t.name)}"> <span class="name">${esc(t.name)}</span> <span class="meta">${t.ops.length} procedure${t.ops.length === 1 ? "" : "s"}</span>${g === KAW ? `<p class="meta">${esc(t.why[0])}</p>` : ""}${variantsHtml(t.variants, 4)}${subNotes("tool", t.id)}<details><summary>Used in</summary><ul>${t.ops.map((o) => `<li>${opLink(o.id)}</li>`).join("")}</ul></details></li>`).join("")}</ul></check-list></section>`;
  }).join("");
  return layout("Tool list", "tools", `<h1>Tool list</h1>
<p>Each tool that a procedure names, with the procedures that use it. Tick the tools that you have. <span class="ticks-hint">This browser keeps the ticks.</span></p>
${filterBox("ul.toollist > li", "Filter tools or jobs, for example micrometer, fork, tire")}
${groups}`);
}

// ---------- home ----------
function pageHome(): string {
  const frequent = ["engine-oil-and-filter", "drive-chain-adjust", "air-filter", "valve-clearance", "balancer-chain-tensioner", "c11-tire-removal", "c14-front-brake-pads", "coolant-replace", "spark-plug"].filter((o) => data.ops.has(o));
  return layout("Home", "home", `<h1 class="brandmark">KLR Service Explorer</h1>
<p class="lede">Service and repair procedures for the Kawasaki KLR650, first generation (KL650A). Values are set for a 2006 model.</p>
<site-search><form class="home-search" action="/search.html"><input type="search" name="q" placeholder="Find a procedure, a part or a torque value" aria-label="Search"></form></site-search>
<ul class="cards">
<li><a href="/maintenance.html">Routine maintenance</a><span>The service schedule by mileage and time, with a checklist for each service.</span></li>
<li><a href="/repairs.html">Common repairs</a><span>Flat tires, cables, brakes, bulbs, crash damage and other repairs off the schedule.</span></li>
<li><a href="/book/">Full reference</a><span>Every procedure in the manual, the specifications and the errata.</span></li>
<li><a href="/tools.html">Tool list</a><span>Every tool that the procedures name, with the jobs that need it.</span></li>
</ul>
<h2>Frequent jobs</h2><ul class="frequent">${frequent.map((o) => `<li>${opLink(o)}</li>`).join("")}</ul>`);
}

// ---------- other pages ----------
function pageSpecs(): string {
  const byCh = new Map<string, typeof data.tables extends Map<string, infer T> ? T[] : never>();
  for (const t of data.tables.values()) byCh.set(t.chapter, [...(byCh.get(t.chapter) ?? []), t]);
  for (const t of data.tables.values()) write(`frag/spec/${t.id}.html`, `<h1>${esc(t.title)}</h1><table class="spec">${t.rows.map((r) => `<tr class="${yearClass(r).trim()}"><th>${rowLabel(r)}</th><td>${specValue(r, t.kind)}</td></tr>`).join("")}</table>`);
  return layout("Specifications", "book", `<p class="crumb"><a href="/book/">Full reference</a></p><h1>Specifications</h1>
<p>Rows for other model years are grey. Rows for 2006 are green.</p>
${filterBox("tr.row", "Filter, for example axle, valve, spark plug")}
${[...byCh.entries()].map(([ch, ts]) => `<h2>${esc(ch)}</h2>${ts.map((t) => `<table class="spec" id="${t.id}"><caption>${esc(t.title)} <span class="src">${esc(srcLabel(data, t.cite))}</span></caption>${t.note ? `<tbody><tr><td colspan="2" class="meta">${esc(t.note)}</td></tr></tbody>` : ""}<tbody>${t.rows.map((r) => `<tr class="row${yearClass(r)}" data-search="${esc(`${t.title} ${r.group ?? ""} ${r.item}`.toLowerCase())}"><th scope="row">${rowLabel(r)}${r.realigned ? ` <span class="flag" title="In this copy the value is on the heading line. It was moved down and compared with Clymer.">moved</span>` : ""}</th><td>${specValue(r, t.kind)}</td></tr>`).join("")}</tbody></table>`).join("")}`).join("")}`);
}

function pageFigures(): string {
  const uses = (f: Figure) => {
    const out: { op: Operation; st: Step }[] = [];
    for (const op of data.ops.values()) for (const s of op.sections) for (const st of s.steps) if ((st.chapter ?? op.chapter) === f.chapter && st.figs?.includes(f.n)) out.push({ op, st });
    return out;
  };
  const cards = data.figures.map((f) => ({ f, u: uses(f) })).filter((x) => x.u.length).sort((a, b) => a.f.chapter - b.f.chapter || a.f.n - b.f.n);
  return layout("Photos", "book", `<p class="crumb"><a href="/book/">Full reference</a></p><h1>Photos</h1><p>Photos from the Clymer manual, with the steps that use them.</p>
${filterBox(".fig-card", "Filter photos, for example drain plug, chain, caliper")}
<ul class="figures">${cards.map(({ f, u }) => `<li class="fig-card" data-search="${esc(u.map((x) => `${x.op.title} ${x.st.t}`).join(" ").toLowerCase())}">${photo(f)}<ul>${u.map((x) => `<li>${esc(x.st.t)} ${opLink(x.op.id)}</li>`).join("")}</ul></li>`).join("")}</ul>`);
}

function pagesIssues(): void {
  for (const is of data.issues.values())
    write(`issues/${is.id}.html`, layout(is.title, "book", `<p class="crumb"><a href="/book/">Full reference</a> · <a href="/book/errata.html">Errata</a></p><article class="op"><h1>${esc(is.title)}</h1>${is.summary.map((s) => `<p class="summary">${esc(s.t)} ${supplementCite(data, s.cite)}</p>`).join("")}${is.ops?.length ? `<p class="needs"><span class="lbl">Procedures:</span> ${is.ops.map((o) => opLink(o)).join(" ")}</p>` : ""}${sectionsHtml(is.sections, "forum")}</article>`));
}

function pagesCommunity(): void {
  for (const t of data.threads.values()) {
    write(`community/${t.slug}.html`, layout(t.title, "book", `<p class="crumb"><a href="/book/errata.html">Errata</a></p><h1>${esc(t.title)}</h1><p class="meta">Saved from <a href="${esc(t.url)}" rel="noreferrer">klr650.net</a> on ${esc(t.fetched)}.</p>${[...t.posts.values()].map((p) => `<article class="post" id="post-${p.n}"><h3>Post ${p.n}, ${esc(p.author)}, ${esc(p.date)}</h3><div class="post-text">${esc(p.text).replace(/\n/g, "<br>")}</div></article>`).join("")}`));
    for (const p of t.posts.values()) write(`frag/post/${t.slug}/${p.n}.html`, `<p class="crumb">${esc(t.title)}</p><h1>Post ${p.n}, ${esc(p.author)}, ${esc(p.date)}</h1><div class="post-text">${esc(p.text).replace(/\n/g, "<br>")}</div>`);
  }
}

function pageVerify(): string {
  return layout("Build checks", "", `<h1>Build checks</h1><p>The build stops if a value has no valid citation.</p>
<h2>Warnings (${data.warnings.length})</h2><ul>${data.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
<h2>Numbers not found on the cited page (${misses.length})</h2><ul>${misses.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`);
}

function searchIndex(): string {
  const idx: { k: string; t: string; x: string; u: string }[] = [];
  for (const op of data.ops.values()) idx.push({ k: "Procedure", t: op.title, x: [op.summary?.t ?? "", ...op.sections.flatMap((s) => s.steps.map((st) => st.t))].join(" "), u: `/ops/${op.id}.html` });
  for (const [key, { s }] of sections) idx.push({ k: "Section", t: s.title, x: (s.summary ?? []).map((x) => x.t).join(" "), u: sectionHref(key) });
  for (const t of data.tables.values()) for (const r of t.rows) idx.push({ k: "Specification", t: `${t.title}: ${r.group ? r.group + ", " : ""}${r.item}${r.years ? ` (${r.years})` : ""}`, x: specValue(r, t.kind).replace(/<[^>]+>/g, ""), u: `/specs.html#${t.id}` });
  for (const t of toolIndex.values()) idx.push({ k: "Tool", t: t.name, x: t.ops.map((o) => o.title).join(" "), u: `/tools.html#tool-${t.id}` });
  for (const is of data.issues.values()) idx.push({ k: "Owner report", t: is.title, x: is.summary.map((s) => s.t).join(" "), u: `/issues/${is.id}.html` });
  return JSON.stringify(idx);
}

// ---------- write ----------
write("index.html", pageHome());
pagesBook();
write("book/errata.html", pageErrata());
for (const op of data.ops.values()) {
  write(`ops/${op.id}.html`, layout(op.title, "book", opBody(op, true)));
  write(`frag/op/${op.id}.html`, opBody(op, true));
}
write("maintenance.html", pageMaintenance());
for (const mi of MILESTONES) write(NEW_BIKE.url(mi).slice(1), pageMaintenance(mi));
for (const mi of EVERY) write(GENERAL.url(mi).slice(1), pageMaintenance(undefined, mi));
write("repairs.html", pageRepairs());
write("tools.html", pageTools());
write("specs.html", pageSpecs());
write("figures.html", pageFigures());
pagesIssues();
pagesCommunity();
write("search.html", layout("Search", "search", `<h1>Search</h1><site-search><input type="search" name="q" placeholder="For example front fork, drain plug, 23 N·m" aria-label="Search" autofocus><ol class="results"></ol></site-search><noscript><p>Search needs JavaScript. Without it, use the chapter list in the <a href="/book/">Full reference</a>, the <a href="/specs.html">Specifications</a> or the <a href="/tools.html">Tool list</a>.</p></noscript>`));
write("search-index.json", searchIndex());
write("verify.html", pageVerify());
mkdirSync(join(DIST, "assets"), { recursive: true });
copyFileSync(join(ROOT, "site", "static", "style.css"), join(DIST, "assets", "style.css"));
// The client is plain JavaScript with JSDoc types, served as written.
for (const f of readdirSync(join(ROOT, "site", "client")).filter((f) => f.endsWith(".js"))) copyFileSync(join(ROOT, "site", "client", f), join(DIST, "assets", f));
mkdirSync(join(DIST, "assets", "fonts"), { recursive: true });
for (const f of readdirSync(join(ROOT, "site", "static", "fonts"))) copyFileSync(join(ROOT, "site", "static", "fonts", f), join(DIST, "assets", "fonts", f));
console.log(`Built ${data.ops.size} procedures, ${sections.size} sections, ${toolIndex.size} tools, ${data.tables.size} spec tables. ${data.warnings.length} warnings, ${misses.length} number misses.`);
