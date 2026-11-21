// The data checks of klrserv. build.ts runs them before GGASS builds the
// site. GGASS checks the shape of each pagedef against its template. These
// checks test the content: each citation resolves, each link between
// procedures, sections, tables and posts has a target, numbers come from
// the cited page, forum quotes are word for word, and the text follows
// ASD-STE100.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { esc } from "ggass";
import YAML from "yaml";
import { findSpec, makeModel, nn, pad, serviceMiles, type Cite, type Model, type PageInput, type Section, type Step } from "./model.ts";

export type Report = {
  errors: string[];
  warnings: string[];
  // Numbers in a step that are not in the text layer of the cited page.
  misses: string[];
  // Words and marks that ASD-STE100 rejects.
  ste: string[];
  summary: string;
};

// The template of a child page, from the template of its parent.
const CHILD_TEMPLATE: Record<string, string> = { chapter: "section", "spec-group": "spec-table", thread: "post", maintenance: "service" };

const slashes = (p: string) => p.split(sep).join("/");

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".yaml"))
    .map((d) => join(d.parentPath, d.name))
    .sort();
}

// Reads pagedef/ and data/ as GGASS does: the same addresses, the keys of
// each _defaults.yaml, and the child pages under `pages`.
function loadFiles(root: string, errors: string[]): { data: Record<string, any>; pages: PageInput[] } {
  const show = (p: string) => slashes(relative(root, p));
  const parse = (path: string): any => {
    try {
      return YAML.parse(readFileSync(path, "utf8"));
    } catch (e) {
      errors.push(`${show(path)}: YAML parse error: ${(e as Error).message.split("\n")[0]}`);
      return undefined;
    }
  };

  const data: Record<string, any> = {};
  const dataDir = join(root, "data");
  for (const path of yamlFiles(dataDir)) {
    const keys = slashes(relative(dataDir, path)).replace(/\.yaml$/, "").split("/");
    let at = data;
    for (const k of keys.slice(0, -1)) at = at[k] ??= {};
    at[keys.at(-1)!] = parse(path);
  }

  const pagedef = join(root, "pagedef");
  const files = yamlFiles(pagedef);
  const defaults = new Map<string, Record<string, unknown>>();
  for (const path of files) if (basename(path) === "_defaults.yaml") defaults.set(dirname(path), parse(path) ?? {});
  const pages: PageInput[] = [];
  const childrenOf = (parent: PageInput, file: string) => {
    const template = CHILD_TEMPLATE[parent.template ?? ""];
    parent.pages = Array.isArray(parent.pages)
      ? parent.pages.map((c: any) => {
          const id = String(c.id);
          const url = `${parent.url.replace(/(?:index)?\.html$/, "").replace(/([^/])$/, "$1/")}${id}.html`;
          return { template, ...c, id, url, file };
        })
      : [];
  };
  for (const path of files) {
    if (basename(path) === "_defaults.yaml") continue;
    const own = parse(path);
    if (!own || typeof own !== "object") continue;
    const values: Record<string, unknown> = {};
    const chain: Record<string, unknown>[] = [];
    for (let dir = dirname(path); ; dir = dirname(dir)) {
      if (defaults.has(dir)) chain.unshift(defaults.get(dir)!);
      if (dir === pagedef || dirname(dir) === dir) break;
    }
    for (const d of chain) Object.assign(values, d);
    Object.assign(values, own);
    const rel = slashes(relative(pagedef, path)).replace(/\.yaml$/, "");
    const url = basename(rel) === "index" ? `/${rel.slice(0, -"index".length)}index.html` : `/${rel}.html`;
    const page: PageInput = { template: "page", ...values, url, file: show(path) };
    childrenOf(page, show(path));
    pages.push(page);
  }
  return { data, pages };
}

// Spec values, chapter numbers and ids can be numbers in YAML. The
// templates get them as text, so the checks do the same.
function normalize(pages: PageInput[]): void {
  for (const g of pages.filter((p) => p.template === "spec-group"))
    for (const t of g.pages) for (const r of t.rows ?? []) for (const k of ["group", "item"]) if (typeof r[k] === "number") r[k] = String(r[k]);
}

export function dataChecks(root: string): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { data, pages } = loadFiles(root, errors);
  normalize(pages);
  let m: Model;
  try {
    m = makeModel({ root, data, pages });
  } catch (e) {
    errors.push(`the data checks could not read the pages (${(e as Error).message}). GGASS shows the problem in the pagedef.`);
    return { errors, warnings, misses: [], ste: [], summary: "" };
  }
  errors.push(...m.problems);

  const checkCite = (c: Cite | undefined, where: string, defaultSrc?: string): void => {
    if (!c) return void errors.push(`${where}: missing citation`);
    const s = c.s ?? defaultSrc;
    if (!s) return void errors.push(`${where}: citation has no source`);
    if (s === "forum") {
      const t = c.id ? m.threads.get(c.id) : undefined;
      if (!t) return void errors.push(`${where}: unknown forum thread "${c.id}"`);
      if (c.post === undefined || !t.posts.has(c.post)) errors.push(`${where}: thread "${c.id}" has no post ${c.post}`);
      return;
    }
    if (!m.sources[s]) return void errors.push(`${where}: unknown source "${s}"`);
    if (!c.p || c.p < 1) return void errors.push(`${where}: citation has no page`);
    if (!existsSync(join(root, "doc", "pages", s, `p${pad(c.p)}.jpg`))) warnings.push(`${where}: page image ${s} p${c.p} not rendered (run scripts/render_pages.py)`);
  };

  // Spec tables
  for (const t of m.tables.values()) {
    checkCite(t.cite, `table ${t.id}`);
    for (const r of t.rows) if (r.cite) checkCite({ s: t.cite?.s, ...r.cite }, `table ${t.id} row "${r.item}"`);
  }
  checkCite(m.schedule?.cite, "schedule");

  // Figures: each label names a detected region (doc/figures/clymer/index*.yaml)
  // and a crop in static/figures/clymer/.
  const figDir = join(root, "doc", "figures", "clymer");
  const regions = new Set(
    (existsSync(figDir) ? readdirSync(figDir) : [])
      .filter((f) => /^index.*\.yaml$/.test(f))
      .flatMap((f) => (YAML.parse(readFileSync(join(figDir, f), "utf8")) ?? []) as { file: string }[])
      .map((e) => basename(e.file).replace(/\.jpg$/, "")),
  );
  for (const [name, labels] of Object.entries((data.figures ?? {}) as Record<string, Record<string, Record<string, number>>>))
    for (const map of Object.values(labels ?? {}))
      for (const stem of Object.keys(map ?? {})) {
        if (!regions.has(stem)) errors.push(`data/figures/${name}.yaml: no detected region "${stem}"`);
        if (!existsSync(join(root, "static", "figures", "clymer", `${stem}.jpg`))) errors.push(`data/figures/${name}.yaml: no crop static/figures/clymer/${stem}.jpg`);
      }

  for (const d of m.diagrams.values()) checkCite(d.cite, `diagram ${d.id}`);

  // Book sections: from the chapters, and from the section list of the
  // Clymer text (doc/book/clymer.json) for sections that are not written.
  const sectionIds = new Set(m.sections.keys());
  const clymer = join(root, "doc", "book", "clymer.json");
  if (existsSync(clymer))
    for (const c of JSON.parse(readFileSync(clymer, "utf8")).chapters as { n: number; sections: { id: string }[] }[]) for (const s of c.sections) sectionIds.add(`${nn(c.n)}/${s.id}`);
  for (const op of m.ops.values()) if (op.section && !sectionIds.has(op.section)) errors.push(`operation ${op.id}: section "${op.section}" does not exist`);
  // The links of a summary, as in a step.
  const checkLinks = (x: { op?: string; ref?: string }, where: string) => {
    if (x.op && !m.ops.has(x.op)) warnings.push(`${where}: links to operation "${x.op}" which is not written yet`);
    if (x.ref && !sectionIds.has(x.ref)) errors.push(`${where}: ref "${x.ref}" is not a book section (use "NN/section-id")`);
  };
  for (const op of m.ops.values()) if (op.summary) checkLinks(op.summary, `operation ${op.id} summary`);
  for (const c of m.book)
    for (const s of c.sections) {
      s.summary?.forEach((x, i) => checkCite(x.cite, `book ch${c.n} ${s.id} summary ${i + 1}`, "clymer"));
      s.summary?.forEach((x, i) => checkLinks(x, `book ch${c.n} ${s.id} summary ${i + 1}`));
      for (const o of s.ops) if (!m.ops.has(o)) errors.push(`book ch${c.n} ${s.id}: unknown operation "${o}"`);
    }

  const resolveSpec = (ref: string, where: string): void => {
    if (!findSpec(m, ref)) errors.push(`${where}: spec_ref "${ref}" does not match any table row`);
  };
  const checkSteps = (sections: Section[], where: string, src: string, chapter?: number): void => {
    sections.forEach((sec, si) =>
      sec.steps.forEach((st, i) => {
        const w = `${where} §${si + 1} step ${i + 1}`;
        if (!st.t?.trim()) errors.push(`${w}: empty step`);
        checkCite(st.cite, w, src);
        if (st.spec_ref) resolveSpec(st.spec_ref, w);
        if (st.conflict) st.conflict.others.forEach((o, k) => checkCite(o.cite, `${w} conflict ${k + 1}`, src));
        const ch = st.chapter ?? chapter;
        for (const n of st.figs ?? []) if (!m.figures.has(`${ch}:${n}`)) warnings.push(`${w}: Clymer Ch.${ch} Fig. ${n} (cited p${st.cite?.p ?? "?"}) has no extracted photo`);
        if (st.op && !m.ops.has(st.op)) warnings.push(`${w}: links to operation "${st.op}" which is not written yet`);
        if (st.diagram && !m.diagrams.has(st.diagram)) errors.push(`${w}: unknown diagram "${st.diagram}"`);
        if (st.ref && !sectionIds.has(st.ref)) errors.push(`${w}: ref "${st.ref}" is not a book section (use "NN/section-id")`);
      }),
    );
  };
  for (const op of m.ops.values()) {
    const w = `operation ${op.id}`;
    if (!m.sources[op.source]) errors.push(`${w}: unknown source "${op.source}"`);
    if (op.summary) checkCite(op.summary.cite, `${w} summary`, op.source);
    op.spec_refs?.forEach((r) => resolveSpec(r, w));
    op.parts?.forEach((p) => {
      checkCite(p.cite, `${w} part "${p.name}"`, op.source);
      if (p.spec_ref) resolveSpec(p.spec_ref, `${w} part "${p.name}"`);
    });
    if (op.issue && !m.issues.has(op.issue)) errors.push(`${w}: unknown issue "${op.issue}"`);
    checkSteps(op.sections, w, op.source, op.chapter);
  }
  for (const is of m.issues.values()) {
    is.summary.forEach((s, i) => checkCite(s.cite, `issue ${is.id} summary ${i + 1}`));
    checkSteps(is.sections, `issue ${is.id}`, "forum");
    is.ops?.forEach((o) => m.ops.has(o) || errors.push(`issue ${is.id}: unknown operation "${o}"`));
  }

  // The schedule and its service checklist pages.
  for (const t of m.schedule?.tasks ?? []) {
    if (t.op && !m.ops.has(t.op)) warnings.push(`schedule "${t.task}": operation "${t.op}" not written yet (shown unlinked)`);
    const op = t.op ? m.ops.get(t.op) : undefined;
    for (const name of t.parts ?? []) if (op && !op.parts?.some((p) => p.name === name)) errors.push(`schedule "${t.task}": part "${name}" is not in operation "${op.id}"`);
  }
  const maintenance = pages.find((p) => p.url === "/maintenance.html");
  if (m.schedule && maintenance) {
    const { every, milestones } = serviceMiles(m.schedule);
    const want = [...milestones.map(String), ...every.map((mi) => `every-${mi}`)];
    const have = (maintenance.pages as PageInput[]).map((p) => p.id);
    if (want.join() !== have.join()) errors.push(`pagedef/maintenance.yaml: the child pages must have the ids ${want.join(", ")}, for the intervals in data/schedule.yaml. They have ${have.join(", ")}.`);
  }

  // Substitutes: checked like steps.
  const toolIds = new Set<string>();
  for (const g of m.toolGroups) for (const t of g.tools) toolIds.add(t.id);
  const partNames = new Set<string>();
  for (const op of m.ops.values()) for (const pt of op.parts ?? []) partNames.add(pt.name);
  const norm = (x: string) => x.replace(/\s+/g, " ").trim();
  m.substitutes.forEach((sub, i) => {
    const w = `substitute ${i + 1}`;
    if (!sub.t?.trim()) errors.push(`${w}: empty text`);
    checkCite(sub.cite, w);
    if (sub.for?.tool && !toolIds.has(sub.for.tool) && !/^kaw-57001-\d+$/.test(sub.for.tool)) errors.push(`${w}: unknown tool id "${sub.for.tool}"`);
    if (sub.for?.part && !partNames.has(sub.for.part)) errors.push(`${w}: no operation has a part named "${sub.for.part}"`);
    if (!sub.for?.tool && !sub.for?.part) errors.push(`${w}: needs for.tool or for.part`);
    if (sub.for?.op && !m.ops.has(sub.for.op)) errors.push(`${w}: unknown operation "${sub.for.op}"`);
    if (sub.cite?.s === "forum") {
      const post = norm(m.threads.get(sub.cite.id!)?.posts.get(sub.cite.post!)?.text ?? "");
      for (const x of sub.t.matchAll(/"([^"]{12,})"/g)) if (!post.includes(norm(x[1]))) errors.push(`${w}: quote not verbatim in ${sub.cite.id}#${sub.cite.post}`);
      for (const num of sub.t.match(/\d+(?:\.\d+)?/g) ?? []) if (!post.replace(/\s+/g, "").includes(num)) warnings.push(`${w}: number "${num}" not found in ${sub.cite.id}#${sub.cite.post}`);
    }
  });

  // Common repairs and the frequent jobs of the home page.
  for (const c of m.repairs) {
    for (const o of c.ops) if (!m.ops.has(o)) errors.push(`data/common-repairs.yaml: "${c.title}": unknown operation "${o}"`);
    for (const i of c.issues ?? []) if (!m.issues.has(i)) errors.push(`data/common-repairs.yaml: "${c.title}": unknown issue "${i}"`);
  }
  for (const o of (pages.find((p) => p.url === "/index.html")?.frequent ?? []) as string[]) if (!m.ops.has(o)) warnings.push(`pagedef/index.yaml: frequent job "${o}" is not a procedure`);

  // ---------- the text ----------
  const walkSteps = (fn: (st: Step, src: string, where: string) => void): void => {
    const walk = (sections: Section[], src: string, id: string) => sections.forEach((sec, si) => sec.steps.forEach((st, i) => fn(st, src, `${id} §${si + 1} step ${i + 1}`)));
    for (const op of m.ops.values()) walk(op.sections, op.source, op.id);
    for (const is of m.issues.values()) walk(is.sections, "forum", `issue ${is.id}`);
  };
  const postOf = (c: Cite) => m.threads.get(c.id!)?.posts.get(c.post!)?.text ?? "";

  // Each number in a step must be on the cited page (text layer) or in the cited post.
  const misses: string[] = [];
  const checkNumbers = (text: string, c: Cite, src: string, where: string) => {
    const s = c.s ?? src;
    const hay = (s === "forum" ? postOf(c) : (m.pageText(s, c.p!) ?? "")).replace(/\s+/g, "");
    for (const num of text.match(/\d+(?:\.\d+)?(?:\/\d+)?/g) ?? []) if (!hay.includes(num)) misses.push(`${where}: "${num}" not found in ${s} ${s === "forum" ? `${c.id}#${c.post}` : `p${c.p}`}`);
  };
  walkSteps((st, src, w) => {
    // A reviewer compared the numbers of the step with the page image.
    if (!st.image_checked) checkNumbers(st.t, st.cite, src, w);
    st.conflict?.others.forEach((o) => checkNumbers(o.t.replace(/^"|"$/g, ""), o.cite, src, `${w} (conflict)`));
  });

  // Quoted forum text must be in the cited post word for word.
  const checkQuote = (text: string, c: Cite, where: string) => {
    if (c.s !== "forum") return;
    const post = norm(postOf(c));
    for (const x of text.matchAll(/"([^"]{12,})"/g)) if (!post.includes(norm(x[1]))) errors.push(`${where}: quote not verbatim in ${c.id}#${c.post}: "${x[1].slice(0, 60)}…"`);
  };
  walkSteps((st, _src, w) => {
    checkQuote(st.t, st.cite, w);
    st.conflict?.others.forEach((o) => checkQuote(o.t, o.cite, `${w} (conflict)`));
  });
  for (const is of m.issues.values()) is.summary.forEach((s, i) => checkQuote(s.t, s.cite, `issue ${is.id} summary ${i + 1}`));

  // ASD-STE100: words and marks that the standard rejects (AUTHORING.md §4).
  // Quoted forum text is exempt.
  const STE_BAD: [RegExp, string][] = [
    [/\b(should|would|may|might|could)\b/i, "modal (use can, will or must)"],
    [/\b(verify|verified|verifies|ensure|ensures|confirm|confirms|perform|performs|performed)\b/i, "rejected verb (make sure that, do)"],
    [/\b(however|therefore|in order to)\b/i, "rejected connector"],
    [/\b(has|have) been\b/i, "present perfect"],
    [/[;—]/, "semicolon or em-dash"],
    [/\b\w+n't\b/i, "contraction"],
  ];
  const ste: string[] = [];
  const lint = (text: string | undefined, where: string) => {
    if (!text) return;
    const plain = text.replace(/"[^"]*"/g, "");
    for (const [re, why] of STE_BAD) {
      const x = plain.match(re);
      if (x) ste.push(`${where}: STE ${why}: "${x[0]}"`);
    }
  };
  walkSteps((st, _src, w) => {
    lint(st.t, w);
    lint(st.gap, `${w} gap`);
  });
  for (const op of m.ops.values()) {
    lint(op.summary?.t, `${op.id} summary`);
    op.parts?.forEach((p) => lint(p.note, `${op.id} part "${p.name}"`));
  }
  for (const c of m.book) for (const s of c.sections) s.summary?.forEach((x, i) => lint(x.t, `book ch${c.n} ${s.id} summary ${i + 1}`));

  const summary = `Data checks: ${m.ops.size} procedures, ${m.sections.size} sections, ${m.tables.size} spec tables, ${m.threads.size} threads. ${errors.length} errors, ${warnings.length} warnings, ${misses.length} number misses, ${ste.length} STE notes.`;
  return { errors, warnings, misses, ste, summary };
}

// With `full`, prints each list. Without it, prints the errors and a summary.
export function printReport(r: Report, full: boolean): void {
  const show = (title: string, list: string[]) => {
    console.log(`${title} (${list.length})`);
    for (const x of list) console.log("  - " + x);
  };
  if (full) {
    show("ERRORS", r.errors);
    show("NUMBER MISSES", r.misses);
    show("STE", r.ste);
    show("WARNINGS", r.warnings);
  } else if (r.errors.length) {
    console.error(`Data checks failed: ${r.errors.length} error(s):`);
    for (const e of r.errors) console.error("  - " + e);
  }
  if (r.summary) console.log(r.summary);
}

// The lists for the page /verify.html. GGASS gives IDs to headings before
// the step adds this HTML, so the headings bring their own.
export const reportHtml = (r: Report): string =>
  `<h2 id="warnings">Warnings (${r.warnings.length})</h2><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
  <h2 id="number-misses">Numbers not found on the cited page (${r.misses.length})</h2><ul>${r.misses.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
