// Loads everything under data/ and doc/, resolves references, and enforces
// the citation rule: a datum without a resolvable citation fails the build.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export const ROOT = join(import.meta.dirname, "..", "..");
export const BIKE_YEAR = 2006;

export type Cite = { s?: string; p?: number; ref?: string; id?: string; post?: number };
export type Source = { title: string; short: string; file?: string; text?: string; covers?: string; rank?: number; note?: string; printed_offset?: number; printed_range?: [number, number] };
export type SpecRow = { group?: string; item: string; years?: string; value?: string; std?: string; limit?: string; nm?: string; inlb?: string; ftlb?: string; remarks?: string; realigned?: boolean; cite?: Cite };
export type SpecTable = { id: string; title: string; kind?: "torque" | "limits"; cite: Cite; note?: string; rows: SpecRow[]; file: string; chapter: string };
// `agrees: true` shows other sources that confirm or add detail, rather than contradict.
export type Conflict = { note: string; agrees?: boolean; others: { t: string; cite: Cite }[] };
// `chapter` overrides the operation's Clymer chapter for this step's `figs`.
// `ref` is a dependency on a book section, "NN/section-id".
export type Step = { t: string; kind?: "note" | "caution" | "warning"; cite: Cite; image_checked?: boolean; diagram?: string; figs?: number[]; chapter?: number; op?: string; ref?: string; spec_ref?: string; conflict?: Conflict; gap?: string };
export type DiagramPoint = { n: string; x: number; y: number; label: string };
export type Diagram = { id: string; title: string; kind: string; cite: Cite; image_checked?: boolean; note?: string; shapes?: { kind: string; x: number; y: number; w: number; h: number; label?: string }[]; points: DiagramPoint[] };
// A community-accepted substitute for a proprietary or unusual tool or part.
export type Substitute = { for: { tool?: string; part?: string; op?: string }; kind?: "warning"; t: string; cite: Cite };
export type BookSection = { id: string; title: string; pages: [number, number]; summary?: { t: string; cite: Cite }[]; ops?: string[]; written: boolean };
export type BookChapter = { n: number; title: string; pages: [number, number]; sections: BookSection[]; file?: string };
export type Section = { title?: string; steps: Step[] };
export type Part = { name: string; replace: "always" | "inspect" | "consumable"; cite: Cite; note?: string; spec_ref?: string };
export type Operation = { id: string; title: string; system: string; source: string; chapter?: number; section?: string; issue?: string; summary?: { t: string; cite: Cite }; spec_refs?: string[]; parts?: Part[]; sections: Section[]; file: string };
export type Interval = { id: string; label: string; every_mi?: number };
export type Task = { task: string; op?: string; at: string[]; other?: string; every_mi?: number; cite?: Cite; parts?: string[] };
export type Schedule = { cite: Cite; intervals: Interval[]; footnotes?: Record<string, string>; tasks: Task[] };
export type Post = { n: number; author: string; date: string; permalink: string; text: string };
export type Thread = { slug: string; title: string; url: string; fetched: string; posts: Map<number, Post> };
export type Figure = { source: string; chapter: number; n: number; page: number; file: string };
export type Issue = { id: string; title: string; summary: { t: string; cite: Cite }[]; sections: Section[]; ops?: string[]; file: string };

export type Data = {
  sources: Record<string, Source>;
  schedule: Schedule;
  tables: Map<string, SpecTable>;
  ops: Map<string, Operation>;
  issues: Map<string, Issue>;
  threads: Map<string, Thread>;
  figures: Figure[];
  diagrams: Map<string, Diagram>;
  substitutes: Substitute[];
  book: BookChapter[];
  pageText: (src: string, p: number) => string | undefined;
  errors: string[];
  warnings: string[];
};

const readYaml = (path: string): any => YAML.parse(readFileSync(path, "utf8"));
// One bad file must not stop validation of the others (several writers work at once).
const tryYaml = (path: string, errors: string[]): any => {
  try {
    return readYaml(path);
  } catch (e) {
    errors.push(`${path.split(/[\\/]/).slice(-2).join("/")}: YAML parse error: ${(e as Error).message.split("\n")[0]}`);
    return undefined;
  }
};
const yamlFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort().map((f) => join(dir, f)) : [];

function parseThread(slug: string, raw: string): Thread {
  const md = raw.replace(/\r\n/g, "\n");
  const [, header, body] = md.split(/^---$/m);
  const h = YAML.parse(header);
  const posts = new Map<number, Post>();
  const chunks = body.split(/^## Post /m).slice(1);
  for (const chunk of chunks) {
    const m = chunk.match(/^(\d+) — (.*), (\S+)\n<([^>]*)>\n([\s\S]*)$/);
    if (!m) continue;
    posts.set(Number(m[1]), { n: Number(m[1]), author: m[2], date: m[3], permalink: m[4], text: m[5].trim() });
  }
  return { slug, title: h.title, url: h.url, fetched: String(h.fetched), posts };
}

export function load(): Data {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sources = readYaml(join(ROOT, "doc", "sources.yaml")) as Record<string, Source>;

  const threads = new Map<string, Thread>();
  const communityDir = join(ROOT, "doc", "community");
  for (const f of readdirSync(communityDir).filter((f) => f.endsWith(".md"))) {
    const slug = f.replace(/\.md$/, "");
    threads.set(slug, parseThread(slug, readFileSync(join(communityDir, f), "utf8")));
  }

  const textCache = new Map<string, string | undefined>();
  const pageText = (src: string, p: number): string | undefined => {
    const key = `${src}:${p}`;
    if (!textCache.has(key)) {
      const dir = sources[src]?.text;
      const path = dir ? join(ROOT, dir, `p${String(p).padStart(3, "0")}.txt`) : "";
      textCache.set(key, path && existsSync(path) ? readFileSync(path, "utf8") : undefined);
    }
    return textCache.get(key);
  };

  const checkCite = (c: Cite | undefined, where: string, defaultSrc?: string): void => {
    if (!c) return void errors.push(`${where}: missing citation`);
    const s = c.s ?? defaultSrc;
    if (!s) return void errors.push(`${where}: citation has no source`);
    if (s === "forum") {
      const t = c.id ? threads.get(c.id) : undefined;
      if (!t) return void errors.push(`${where}: unknown forum thread "${c.id}"`);
      if (c.post === undefined || !t.posts.has(c.post)) errors.push(`${where}: thread "${c.id}" has no post ${c.post}`);
      return;
    }
    if (!sources[s]) return void errors.push(`${where}: unknown source "${s}"`);
    if (!c.p || c.p < 1) return void errors.push(`${where}: citation has no page`);
    if (!existsSync(join(ROOT, "doc", "pages", s, `p${String(c.p).padStart(3, "0")}.jpg`)))
      warnings.push(`${where}: page image ${s} p${c.p} not rendered (run scripts/render_pages.py)`);
  };

  // Spec tables
  const tables = new Map<string, SpecTable>();
  for (const file of yamlFiles(join(ROOT, "data", "specs"))) {
    const doc = tryYaml(file, errors);
    if (!doc) continue;
    for (const t of doc.tables as SpecTable[]) {
      if (tables.has(t.id)) errors.push(`${file}: duplicate table id "${t.id}"`);
      t.file = file;
      t.chapter = doc.chapter;
      checkCite(t.cite, `table ${t.id}`);
      for (const r of t.rows) if (r.cite) checkCite({ s: t.cite.s, ...r.cite }, `table ${t.id} row "${r.item}"`);
      tables.set(t.id, t);
    }
  }

  // Schedule
  const schedule = readYaml(join(ROOT, "data", "schedule.yaml")) as Schedule;
  checkCite(schedule.cite, "schedule");

  // Figures (only labelled regions count)
  const figures: Figure[] = [];
  const figDir = join(ROOT, "doc", "figures", "clymer");
  const labelFiles = existsSync(figDir) ? readdirSync(figDir).filter((f) => /^labels.*\.yaml$/.test(f)).sort() : [];
  if (labelFiles.length) {
    const labels: Record<string, Record<string, number>> = {};
    for (const f of labelFiles) for (const [k, v] of Object.entries(tryYaml(join(figDir, f), errors) ?? {})) labels[k] = { ...(labels[k] ?? {}), ...(v as Record<string, number>) };
    // index.yaml: dense regions (photos). index-drawings.yaml: framed line
    // drawings that the first pass misses (scripts/extract_drawings.py).
    const drawingsIndex = join(figDir, "index-drawings.yaml");
    const index = [
      ...(readYaml(join(figDir, "index.yaml")) as { page: number; file: string }[]),
      ...(existsSync(drawingsIndex) ? (readYaml(drawingsIndex) as { page: number; file: string }[]) : []),
    ];
    const byStem = new Map(index.map((e) => [e.file.split("/").pop()!.replace(/\.jpg$/, ""), e]));
    for (const [chapterKey, map] of Object.entries(labels)) {
      const chapter = Number(chapterKey.replace("chapter-", ""));
      for (const [stem, n] of Object.entries(map)) {
        const e = byStem.get(stem);
        if (!e) errors.push(`labels.yaml: no detected region "${stem}"`);
        else figures.push({ source: "clymer", chapter, n, page: e.page, file: e.file });
      }
    }
  }

  // Diagrams (HTML-native recreations of drawings)
  const diagrams = new Map<string, Diagram>();
  for (const file of yamlFiles(join(ROOT, "data", "diagrams"))) for (const d of (tryYaml(file, errors)?.diagrams ?? []) as Diagram[]) { if (diagrams.has(d.id)) errors.push(`duplicate diagram id "${d.id}"`); checkCite(d.cite, `diagram ${d.id}`); diagrams.set(d.id, d); }

  // Operations
  const ops = new Map<string, Operation>();
  for (const file of yamlFiles(join(ROOT, "data", "operations"))) {
    const doc = tryYaml(file, errors);
    if (!doc) continue;
    const list: Operation[] = doc.operations ?? [doc];
    for (const op of list) {
      op.file = file;
      if (ops.has(op.id)) errors.push(`${file}: duplicate operation id "${op.id}"`);
      ops.set(op.id, op);
    }
  }

  // Known issues
  const issues = new Map<string, Issue>();
  for (const file of yamlFiles(join(ROOT, "data", "issues"))) {
    const issue = tryYaml(file, errors) as Issue | undefined;
    if (!issue) continue;
    issue.file = file;
    issues.set(issue.id, issue);
  }

  // Book: written chapters come from data/book/chNN.yaml; the others fall
  // back to the section skeleton found in the Clymer text (doc/book/clymer.json).
  const auto = JSON.parse(readFileSync(join(ROOT, "doc", "book", "clymer.json"), "utf8")) as { chapters: { n: number; title: string; pages: [number, number]; sections: { id: string; title: string; pages: [number, number] }[] }[] };
  const book: BookChapter[] = auto.chapters.map((c) => {
    const file = join(ROOT, "data", "book", `ch${String(c.n).padStart(2, "0")}.yaml`);
    const written = existsSync(file) ? (tryYaml(file, errors) as BookChapter | undefined) : undefined;
    if (written?.sections)
      return { n: c.n, title: written.title ?? c.title, pages: c.pages, file, sections: written.sections.map((s) => ({ ...s, ops: s.ops ?? [], written: true })) };
    return { n: c.n, title: c.title, pages: c.pages, sections: c.sections.filter((s) => s.id !== "introduction").map((s) => ({ ...s, ops: [], written: false })) };
  });
  const sectionIds = new Set<string>();
  for (const c of auto.chapters) for (const s of c.sections) sectionIds.add(`${String(c.n).padStart(2, "0")}/${s.id}`);
  for (const c of book) for (const s of c.sections) sectionIds.add(`${String(c.n).padStart(2, "0")}/${s.id}`);
  // Operations that name their section join it even if the chapter file doesn't list them.
  for (const op of ops.values()) {
    if (!op.section) continue;
    if (!sectionIds.has(op.section)) errors.push(`operation ${op.id}: section "${op.section}" does not exist`);
    const [cn, sid] = op.section.split("/");
    const sec = book.find((c) => c.n === Number(cn))?.sections.find((s) => s.id === sid);
    if (sec && !sec.ops!.includes(op.id)) sec.ops!.push(op.id);
  }
  for (const c of book)
    for (const s of c.sections) {
      s.summary?.forEach((x, i) => checkCite(x.cite, `book ch${c.n} ${s.id} summary ${i + 1}`, "clymer"));
      for (const o of s.ops ?? []) if (!ops.has(o)) errors.push(`book ch${c.n} ${s.id}: unknown operation "${o}"`);
    }

  const resolveSpec = (ref: string, where: string): void => {
    if (!findSpec({ tables } as Data, ref)) errors.push(`${where}: spec_ref "${ref}" does not match any table row`);
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
        for (const n of st.figs ?? [])
          if (!figures.some((f) => f.chapter === ch && f.n === n))
            warnings.push(`${w}: Clymer Ch.${ch} Fig. ${n} has no extracted photo (links to the page instead)`);
        if (st.op && !ops.has(st.op)) warnings.push(`${w}: links to operation "${st.op}" which is not written yet`);
        if (st.diagram && !diagrams.has(st.diagram)) errors.push(`${w}: unknown diagram "${st.diagram}"`);
        if (st.ref && !sectionIds.has(st.ref)) errors.push(`${w}: ref "${st.ref}" is not a book section (use "NN/section-id")`);
      }),
    );
  };
  for (const op of ops.values()) {
    const w = `operation ${op.id}`;
    if (!sources[op.source]) errors.push(`${w}: unknown source "${op.source}"`);
    if (op.summary) checkCite(op.summary.cite, `${w} summary`, op.source);
    op.spec_refs?.forEach((r) => resolveSpec(r, w));
    op.parts?.forEach((p) => {
      checkCite(p.cite, `${w} part "${p.name}"`, op.source);
      if (p.spec_ref) resolveSpec(p.spec_ref, `${w} part "${p.name}"`);
    });
    checkSteps(op.sections, w, op.source, op.chapter);
  }
  for (const is of issues.values()) {
    is.summary.forEach((s, i) => checkCite(s.cite, `issue ${is.id} summary ${i + 1}`));
    checkSteps(is.sections, `issue ${is.id}`, "forum");
    is.ops?.forEach((o) => ops.has(o) || errors.push(`issue ${is.id}: unknown operation "${o}"`));
  }
  for (const t of schedule.tasks) {
    if (t.op && !ops.has(t.op)) warnings.push(`schedule "${t.task}": operation "${t.op}" not written yet (shown unlinked)`);
    const op = t.op ? ops.get(t.op) : undefined;
    for (const name of t.parts ?? [])
      if (op && !op.parts?.some((p) => p.name === name)) errors.push(`schedule "${t.task}": part "${name}" is not in operation "${op.id}"`);
  }

  // Substitutes (data/substitutes.yaml): validated like steps.
  const substitutes: Substitute[] = [];
  const subFile = join(ROOT, "data", "substitutes.yaml");
  if (existsSync(subFile)) {
    const toolIds = new Set<string>();
    for (const g of (readYaml(join(ROOT, "data", "tools.yaml")).groups ?? []) as { tools: { id: string }[] }[]) for (const t of g.tools) toolIds.add(t.id);
    const partNames = new Set<string>();
    for (const op of ops.values()) for (const pt of op.parts ?? []) partNames.add(pt.name);
    const norm = (x: string) => x.replace(/\s+/g, " ").trim();
    ((tryYaml(subFile, errors)?.substitutes ?? []) as Substitute[]).forEach((sub, i) => {
      const w = `substitute ${i + 1}`;
      if (!sub.t?.trim()) errors.push(`${w}: empty text`);
      checkCite(sub.cite, w);
      if (sub.for?.tool && !toolIds.has(sub.for.tool) && !/^kaw-57001-\d+$/.test(sub.for.tool)) errors.push(`${w}: unknown tool id "${sub.for.tool}"`);
      if (sub.for?.part && !partNames.has(sub.for.part)) errors.push(`${w}: no operation has a part named "${sub.for.part}"`);
      if (!sub.for?.tool && !sub.for?.part) errors.push(`${w}: needs for.tool or for.part`);
      if (sub.for?.op && !ops.has(sub.for.op)) errors.push(`${w}: unknown operation "${sub.for.op}"`);
      if (sub.cite?.s === "forum") {
        const post = norm(threads.get(sub.cite.id!)?.posts.get(sub.cite.post!)?.text ?? "");
        for (const m of sub.t.matchAll(/"([^"]{12,})"/g)) if (!post.includes(norm(m[1]))) errors.push(`${w}: quote not verbatim in ${sub.cite.id}#${sub.cite.post}`);
        for (const num of sub.t.match(/\d+(?:\.\d+)?/g) ?? []) if (!post.replace(/\s+/g, "").includes(num)) warnings.push(`${w}: number "${num}" not found in ${sub.cite.id}#${sub.cite.post}`);
      }
      substitutes.push(sub);
    });
  }

  return { sources, schedule, tables, ops, issues, threads, figures, diagrams, substitutes, book, pageText, errors, warnings };
}

export function findSpec(data: Pick<Data, "tables">, ref: string): { table: SpecTable; row: SpecRow } | undefined {
  const at = ref.indexOf(":");
  const table = data.tables.get(ref.slice(0, at));
  const path = ref.slice(at + 1);
  if (at < 0 || !table || !path) return undefined;
  // "item" or "group/item"; item names may themselves contain "/". When a
  // row has model-year variants, prefer the one that applies to the bike.
  const pick = (rows: SpecRow[]) => rows.find((r) => appliesToBike(r.years)) ?? rows[0];
  let matches = table.rows.filter((r) => r.item === path && !r.group);
  if (!matches.length) matches = table.rows.filter((r) => r.item === path);
  if (!matches.length) {
    const slash = path.indexOf("/");
    if (slash > 0) matches = table.rows.filter((r) => r.group === path.slice(0, slash) && r.item === path.slice(slash + 1));
  }
  const row = matches.length ? pick(matches) : undefined;
  return row ? { table, row } : undefined;
}

// Does a year-specific row apply to the owner's bike?
export function appliesToBike(years?: string): boolean {
  if (!years) return true;
  const m = years.match(/(\d{4})\s*-\s*(on|\d{4})/);
  if (!m) return true;
  const from = Number(m[1]);
  const to = m[2] === "on" ? Infinity : Number(m[2]);
  return BIKE_YEAR >= from && BIKE_YEAR <= to;
}

export function printedLabel(data: Pick<Data, "sources">, s: string, p: number): string {
  const src = data.sources[s];
  if (src?.printed_offset !== undefined && src.printed_range && p >= src.printed_range[0] && p <= src.printed_range[1])
    return String(p + src.printed_offset);
  return "";
}
