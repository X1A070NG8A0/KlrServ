// The site model: procedures, book sections, spec tables, threads and the
// shared data, with the links between them. The templates build it from the
// GGASS pages, and the data checks build it from the YAML files.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const BIKE_YEAR = 2006;

export type Cite = { s?: string; p?: number; ref?: string; id?: string; post?: number };
export type Source = { title: string; short: string; file?: string; text?: string; covers?: string; rank?: number; note?: string; printed_offset?: number; printed_range?: [number, number] };
export type SpecRow = { group?: string; item: string; years?: string; value?: string; std?: string; limit?: string; nm?: string; inlb?: string; ftlb?: string; remarks?: string; realigned?: boolean; cite?: Cite };
// `format` is the layout of the values: torque values, or new and limit values.
export type SpecTable = { id: string; url: string; title: string; format?: "torque" | "limits"; cite: Cite; note?: string; rows: SpecRow[]; chapter: string; groupUrl: string };
// `agrees: true` shows other sources that confirm or add detail, rather than contradict.
export type Conflict = { note: string; agrees?: boolean; others: { t: string; cite: Cite }[] };
// `chapter` overrides the Clymer chapter of the operation for the `figs` of this step.
// `ref` is a dependency on a book section, "NN/section-id".
export type Step = { t: string; kind?: "note" | "caution" | "warning"; cite: Cite; image_checked?: boolean; diagram?: string; figs?: number[]; chapter?: number; op?: string; ref?: string; spec_ref?: string; conflict?: Conflict; gap?: string };
export type DiagramPoint = { n: string; x: number; y: number; label: string };
export type Diagram = { id: string; title: string; kind: string; cite: Cite; image_checked?: boolean; note?: string; shapes?: { kind: string; x: number; y: number; w: number; h: number; label?: string }[]; points: DiagramPoint[] };
// A community-accepted substitute for a proprietary or unusual tool or part.
export type Substitute = { for: { tool?: string; part?: string; op?: string }; kind?: "warning"; t: string; cite: Cite };
// `op` and `ref` link the summary to a procedure or a book section, as in a step.
export type Summary = { t: string; cite: Cite; op?: string; ref?: string };
export type BookSection = { id: string; url: string; title: string; summary?: Summary[]; ops: string[]; pdf_pages?: [number, number] };
export type BookChapter = { n: number; url: string; title: string; sections: BookSection[] };
export type Section = { title?: string; steps: Step[] };
export type Part = { name: string; replace: "always" | "inspect" | "consumable"; cite: Cite; note?: string; spec_ref?: string };
export type Operation = { id: string; url: string; title: string; system: string; source: string; chapter?: number; section?: string; issue?: string; summary?: Summary; spec_refs?: string[]; parts?: Part[]; sections: Section[] };
export type Interval = { id: string; label: string; every_mi?: number };
export type Task = { task: string; op?: string; at: string[]; other?: string; every_mi?: number; cite?: Cite; parts?: string[] };
export type Schedule = { cite: Cite; intervals: Interval[]; footnotes?: Record<string, string>; tasks: Task[] };
export type Post = { n: number; url: string; author?: string; date?: string; permalink: string; text: string; images?: string[] };
export type Thread = { slug: string; url: string; title: string; link: string; fetched: string; posts: Map<number, Post> };
export type Figure = { chapter: number; n: number; stem: string; url: string };
export type Issue = { id: string; url: string; title: string; summary: Summary[]; sections: Section[]; ops?: string[] };
export type RawTool = { id: string; name: string; match: string[]; torque?: boolean; sizes?: string[]; kinds?: Record<string, string>; specs?: string };
export type ToolGroup = { name: string; tools: RawTool[] };
export type RepairCategory = { title: string; ops: string[]; issues?: string[] };

// A page as GGASS gives it to a template, or a pagedef as the checks read it.
// `pages` holds the child pages.
export type PageInput = { url: string; template?: string; [key: string]: any };

export type ModelInput = {
  root: string;
  // The values of data/: data/tools.yaml is data.tools.
  data: Record<string, any>;
  pages: PageInput[];
};

export type Model = {
  root: string;
  sources: Record<string, Source>;
  schedule: Schedule;
  tables: Map<string, SpecTable>;
  ops: Map<string, Operation>;
  issues: Map<string, Issue>;
  threads: Map<string, Thread>;
  figures: Map<string, Figure>;
  diagrams: Map<string, Diagram>;
  substitutes: Substitute[];
  book: BookChapter[];
  toolGroups: ToolGroup[];
  repairs: RepairCategory[];
  // Book sections by "NN/section-id".
  sections: Map<string, { c: BookChapter; s: BookSection }>;
  // The book section of each operation, as "NN/section-id".
  opSection: Map<string, string>;
  // "op:<id>" or "ref:NN/section-id" to the operations that need it.
  neededBy: Map<string, Set<string>>;
  pageText(src: string, p: number): string | undefined;
  // Problems that the model found while it linked the pages, for the checks.
  problems: string[];
};

export const nn = (n: number): string => String(n).padStart(2, "0");
export const pad = (p: number): string => String(p).padStart(3, "0");
const stem = (url: string): string => url.replace(/\/index\.html$/, "").replace(/\.html$/, "").split("/").pop()!;
const byUrl = (a: PageInput, b: PageInput) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
export const figureKey = (chapter: number | undefined, n: number): string => `${chapter}:${n}`;

// Figure labels: data/figures/labels*.yaml map each crop to a figure number,
// by chapter. A later file wins for the same crop. The first crop of a
// figure number is the one that shows.
function figuresOf(labelFiles: Record<string, Record<string, Record<string, number>>> | undefined): Map<string, Figure> {
  const labels: Record<string, Record<string, number>> = {};
  for (const name of Object.keys(labelFiles ?? {}).sort((a, b) => (`${a}.yaml` < `${b}.yaml` ? -1 : 1)))
    for (const [k, v] of Object.entries(labelFiles![name] ?? {})) labels[k] = { ...(labels[k] ?? {}), ...v };
  const out = new Map<string, Figure>();
  for (const [chapterKey, map] of Object.entries(labels)) {
    const chapter = Number(chapterKey.replace("chapter-", ""));
    for (const [s, n] of Object.entries(map)) {
      const key = figureKey(chapter, n);
      if (!out.has(key)) out.set(key, { chapter, n, stem: s, url: `/figures/clymer/${s}.jpg` });
    }
  }
  return out;
}

export function makeModel({ root, data, pages }: ModelInput): Model {
  const problems: string[] = [];
  const of = (template: string) => pages.filter((p) => p.template === template).sort(byUrl);
  const sources = (data.sources ?? {}) as Record<string, Source>;

  const ops = new Map<string, Operation>();
  for (const p of of("procedure")) ops.set(stem(p.url), { ...(p as any), id: stem(p.url) });

  const issues = new Map<string, Issue>();
  for (const p of of("issue")) issues.set(stem(p.url), { ...(p as any), id: stem(p.url) });

  const tables = new Map<string, SpecTable>();
  for (const g of of("spec-group"))
    for (const t of (g.pages ?? []) as PageInput[]) {
      if (tables.has(t.id)) problems.push(`${g.file ?? g.url}: table id "${t.id}" is used by ${tables.get(t.id)!.groupUrl} too`);
      tables.set(t.id, { ...(t as any), chapter: g.title, groupUrl: g.url });
    }

  const threads = new Map<string, Thread>();
  for (const p of of("thread")) {
    const posts = new Map<number, Post>();
    for (const c of (p.pages ?? []) as PageInput[]) posts.set(Number(c.id), { ...(c as any), n: Number(c.id) });
    threads.set(stem(p.url), { slug: stem(p.url), url: p.url, title: p.title, link: p.link, fetched: String(p.fetched), posts });
  }

  // Chapters come from /book/chNN/. The `ops` of a section are copied, so
  // that operations that name the section in their `section` key can join it.
  const book: BookChapter[] = of("chapter").map((p) => {
    const n = Number(p.url.match(/\/ch(\d+)\//)?.[1]);
    return {
      n,
      url: p.url,
      title: String(p.title).replace(/^Chapter \d+: /, ""),
      sections: ((p.pages ?? []) as PageInput[]).map((s) => ({ id: s.id, url: s.url, title: s.title, summary: s.summary, pdf_pages: s.pdf_pages, ops: [...(s.ops ?? [])] })),
    };
  });
  book.sort((a, b) => a.n - b.n);
  const sections = new Map<string, { c: BookChapter; s: BookSection }>();
  for (const c of book) for (const s of c.sections) sections.set(`${nn(c.n)}/${s.id}`, { c, s });
  for (const op of ops.values()) {
    if (!op.section) continue;
    const hit = sections.get(op.section);
    if (hit && !hit.s.ops.includes(op.id)) hit.s.ops.push(op.id);
  }
  const opSection = new Map<string, string>();
  for (const [key, { s }] of sections) for (const o of s.ops) if (!opSection.has(o)) opSection.set(o, key);
  for (const op of ops.values()) if (op.section && !opSection.has(op.id)) opSection.set(op.id, op.section);

  const neededBy = new Map<string, Set<string>>();
  for (const op of ops.values())
    for (const d of depsOf(op)) {
      const k = `${d.kind}:${d.id}`;
      if (!neededBy.has(k)) neededBy.set(k, new Set());
      neededBy.get(k)!.add(op.id);
    }

  const diagrams = new Map<string, Diagram>();
  for (const name of Object.keys(data.diagrams ?? {}).sort())
    for (const d of (data.diagrams[name]?.diagrams ?? []) as Diagram[]) {
      if (diagrams.has(d.id)) problems.push(`data/diagrams/${name}.yaml: duplicate diagram id "${d.id}"`);
      diagrams.set(d.id, d);
    }

  const textCache = new Map<string, string | undefined>();
  const pageText = (src: string, p: number): string | undefined => {
    const key = `${src}:${p}`;
    if (!textCache.has(key)) {
      const dir = sources[src]?.text;
      const path = dir ? join(root, dir, `p${pad(p)}.txt`) : "";
      textCache.set(key, path && existsSync(path) ? readFileSync(path, "utf8") : undefined);
    }
    return textCache.get(key);
  };

  return {
    root,
    sources,
    schedule: data.schedule as Schedule,
    tables,
    ops,
    issues,
    threads,
    figures: figuresOf(data.figures),
    diagrams,
    substitutes: (data.substitutes?.substitutes ?? []) as Substitute[],
    book,
    toolGroups: (data.tools?.groups ?? []) as ToolGroup[],
    repairs: (data["common-repairs"]?.categories ?? []) as RepairCategory[],
    sections,
    opSection,
    neededBy,
    pageText,
    problems,
  };
}

export type Dep = { kind: "op" | "ref"; id: string };

// The operations and book sections that the steps of an operation link to.
export function depsOf(op: Operation): Dep[] {
  const seen = new Map<string, Dep>();
  for (const sec of op.sections ?? [])
    for (const st of sec.steps ?? []) {
      if (st.op && st.op !== op.id) seen.set(`op:${st.op}`, { kind: "op", id: st.op });
      if (st.ref) seen.set(`ref:${st.ref}`, { kind: "ref", id: st.ref });
    }
  return [...seen.values()];
}

// An operation is also needed by each operation that needs its whole section.
export function neededByOp(m: Model, id: string): string[] {
  const out = new Set(m.neededBy.get(`op:${id}`) ?? []);
  const sk = m.opSection.get(id);
  if (sk) for (const x of m.neededBy.get(`ref:${sk}`) ?? []) out.add(x);
  out.delete(id);
  return [...out];
}

export function findSpec(m: Pick<Model, "tables">, ref: string): { table: SpecTable; row: SpecRow } | undefined {
  const at = ref.indexOf(":");
  const table = m.tables.get(ref.slice(0, at));
  const path = ref.slice(at + 1);
  if (at < 0 || !table || !path) return undefined;
  // "item" or "group/item". An item name can hold a "/" itself. When a row
  // has model-year variants, the one that applies to the bike wins.
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

// Does a row for some model years apply to the bike of the owner?
export function appliesToBike(years?: string): boolean {
  if (!years) return true;
  const m = years.match(/(\d{4})\s*-\s*(on|\d{4})/);
  if (!m) return true;
  const from = Number(m[1]);
  const to = m[2] === "on" ? Infinity : Number(m[2]);
  return BIKE_YEAR >= from && BIKE_YEAR <= to;
}

export function printedLabel(m: Pick<Model, "sources">, s: string, p: number): string {
  const src = m.sources[s];
  if (src?.printed_offset !== undefined && src.printed_range && p >= src.printed_range[0] && p <= src.printed_range[1]) return String(p + src.printed_offset);
  return "";
}

// A plain-text provenance label, for example "Clymer p76" or "klr650.net, post 14".
export function srcLabel(m: Pick<Model, "sources">, c: Cite, defaultSrc?: string): string {
  const s = c.s ?? defaultSrc ?? "";
  if (s === "forum") return `klr650.net, post ${c.post}`;
  const src = m.sources[s];
  const printed = c.p ? printedLabel(m, s, c.p) : "";
  return `${src?.short ?? s} ${printed ? `p${printed}` : `PDF p${c.p}`}`;
}

export const postHref = (thread: string, post: number): string => `/threads/${thread}/${post}.html`;

// The tasks of the schedule by mileage. A task belongs to one or more
// categories: 500 (the initial service) and each "every N miles" interval.
export function taskCats(schedule: Schedule, t: Task): number[] {
  return [...t.at.map((a) => (a === "initial-500" ? 500 : (schedule.intervals.find((i) => i.id === a)?.every_mi ?? 0))), t.every_mi ?? 0].filter((n) => n > 0);
}
// The "every N miles" intervals, and the services of a new bike: the initial
// service, then the first time that each interval comes due.
export function serviceMiles(schedule: Schedule): { every: number[]; milestones: number[] } {
  const every = [...new Set(schedule.tasks.flatMap((t) => taskCats(schedule, t)))].filter((n) => n !== 500).sort((x, y) => x - y);
  return { every, milestones: [500, ...every] };
}
