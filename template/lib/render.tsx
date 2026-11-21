// Render helpers that several templates share: links, citations, steps,
// parts, tools, diagrams and the body of a procedure.
import { esc, raw, type Child, type Html } from "ggass";
import { appliesToBike, depsOf, figureKey, findSpec, neededByOp, nn, postHref, printedLabel, srcLabel, type BookChapter, type BookSection, type Cite, type Dep, type Diagram, type Model, type Operation, type Part, type Section, type SpecRow, type SpecTable, type Step, type Summary, type Task } from "../../lib/model.ts";
import { tools } from "./tools.ts";

// Puts `sep` between the items.
export const join = (items: Child[], sep: Child): Child[] => items.flatMap((x, i) => (i ? [sep, x] : [x]));

export const lower = (s: string): string => s.toLowerCase();

// A bare data-pop makes GGASS wrap the link in <pop-link>: pointing to it
// opens a window with the target page.
export const preview = (href: string, label: Child, cls = "dep"): Html => (
  <a class={cls} href={href} data-pop>
    {label}
  </a>
);

// A heading at `level`. A level-2 subheading has the class "sub" and the look of an h3.
export function H({ level, children }: { level: number; children?: Child }): Html {
  if (level === 2) return <h2 class="sub">{children}</h2>;
  if (level === 3) return <h3>{children}</h3>;
  return <h4>{children}</h4>;
}

// Each page has one filter at most, so the field id is always "filter".
export const FilterBox = ({ items, label, placeholder }: { items: string; label: string; placeholder: string }): Html => (
  <list-filter items={items}>
    <label class="field" for="filter">{label}</label>
    <input type="search" id="filter" placeholder={placeholder} />
  </list-filter>
);

export const sectionHref = (key: string): string => `/book/ch${key}.html`;
export const chapterHref = (c: BookChapter): string => `/book/ch${nn(c.n)}/`;

export function opLink(m: Model, id: string, label?: string): Html {
  const op = m.ops.get(id);
  return op ? preview(`/ops/${id}.html`, label ?? op.title) : <span class="unwritten">{label ?? id}</span>;
}

export function refLink(m: Model, key: string, label?: string): Html {
  const hit = m.sections.get(key);
  if (!hit) return <span class="unwritten">{label ?? key}</span>;
  return preview(
    sectionHref(key),
    <>
      {label ?? hit.s.title} <span class="ch">Ch. {hit.c.n}</span>
    </>,
  );
}

export const secLink = (c: BookChapter, s: BookSection): Html => preview(sectionHref(`${nn(c.n)}/${s.id}`), s.title);

export const depLink = (m: Model, d: Dep): Html => (d.kind === "op" ? opLink(m, d.id) : refLink(m, d.id));

// ---------- spec values ----------

export function specValue(r: SpecRow, format?: SpecTable["format"]): string {
  if (format === "torque" || r.nm || r.ftlb || r.inlb) {
    const imp = [r.ftlb && `${r.ftlb} ft-lb`, r.inlb && `${r.inlb} in-lb`].filter(Boolean).join(", ");
    const main = r.nm ? `${r.nm} N·m${imp ? ` (${imp})` : ""}` : imp || "no torque given";
    return main + (r.remarks ? ` · <abbr title="Kawasaki remark code, see the table note">${esc(r.remarks)}</abbr>` : "");
  }
  if (r.std !== undefined || r.limit !== undefined) {
    const parts = [];
    if (r.std !== undefined) parts.push(`<span class="std">new ${esc(r.std)}</span>`);
    if (r.limit !== undefined) parts.push(`<span class="limit">limit ${esc(r.limit)}</span>`);
    return parts.join(" · ");
  }
  return esc(r.value);
}

export const rowLabel = (r: SpecRow): string => `${r.group ? `${esc(r.group)} — ` : ""}${esc(r.item)}${r.years ? ` <span class="years">${esc(r.years)}</span>` : ""}`;

export const yearClass = (r: SpecRow): string => (r.years ? (appliesToBike(r.years) ? " this-year" : " other-year") : "");

export function specLink(m: Model, ref: string): Html | null {
  const hit = findSpec(m, ref);
  if (!hit) return null;
  return <span class={`spec${yearClass(hit.row)}`}>{preview(hit.table.url, <b>{raw(specValue(hit.row, hit.table.format))}</b>, "dep dep-spec")}</span>;
}

// A spec table. With `filter`, each row has the text for the list filter.
export function SpecTableHtml({ m, t, filter }: { m: Pick<Model, "sources">; t: SpecTable; filter: boolean }): Html {
  return (
    <div class="table-scroll">
      <table class="spec" id={t.id}>
        <caption>
          {t.title} <span class="src">{srcLabel(m, t.cite)}</span>
        </caption>
        {t.note && (
          <tbody>
            <tr>
              <td colspan="2" class="meta">{t.note}</td>
            </tr>
          </tbody>
        )}
        <tbody>
          {t.rows.map((r) => (
            <tr class={`row${yearClass(r)}`} data-search={filter ? lower(`${t.title} ${r.group ?? ""} ${r.item}`) : undefined}>
              <th scope="row">
                {raw(rowLabel(r))}
                {r.realigned && (
                  <>
                    {" "}
                    <span class="flag" title="In this copy the value is on the heading line. It was moved down and compared with Clymer.">moved</span>
                  </>
                )}
              </th>
              <td>{raw(specValue(r, t.format))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- citations ----------

// The visible citation of a supplement (Kawasaki or forum). Clymer is the
// base text of the wiki, so its pages show only as quiet provenance.
export function supplementCite(m: Model, c: Cite, defaultSrc?: string): Html {
  const s = c.s ?? defaultSrc ?? "";
  if (s === "clymer") return <span class="src">{srcLabel(m, c, s)}</span>;
  if (s === "forum")
    return (
      <a class="cite" href={postHref(c.id!, c.post!)} data-pop title={m.threads.get(c.id!)?.title ?? ""}>
        {srcLabel(m, c)}
      </a>
    );
  return (
    <span class="src src-ext" title={m.sources[s]?.title ?? ""}>
      {srcLabel(m, c, s)}
    </span>
  );
}

// ---------- figures and diagrams ----------

function photo(chapter: number, n: number, url: string): Html {
  return (
    <photo-zoom>
      <figure class="photo">
        <a href={url}>
          <img src={url} alt={`Clymer Chapter ${chapter} figure ${n}`} />
        </a>
        <figcaption>
          Clymer fig. {chapter}-{n}
        </figcaption>
      </figure>
    </photo-zoom>
  );
}

// A diagram shows once in each procedure. Later steps link to it.
function DiagramHtml({ m, d, shown }: { m: Model; d: Diagram; shown: Set<string> }): Html {
  if (shown.has(d.id))
    return (
      <p class="see">
        <a href={`#diag-${d.id}`}>{d.title}: see the diagram above</a>
      </p>
    );
  shown.add(d.id);
  return (
    <step-sequence>
      <figure class="diagram" id={`diag-${d.id}`}>
        <svg viewBox="0 0 100 100" role="img" aria-label={d.title}>
          {(d.shapes ?? []).map((s) => (
            <>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="3" class="outline" />
              {s.label && (
                <text x={s.x + s.w / 2} y={s.y + s.h + 6} text-anchor="middle" class="cap">
                  {s.label}
                </text>
              )}
            </>
          ))}
          {d.points.map((p) => (
            <g class="pt">
              <title>
                {p.n}: {p.label}
              </title>
              <circle cx={p.x} cy={p.y} r={p.n.length > 2 ? 6 : 4.2} />
              <text x={p.x} y={p.y + 1.6} text-anchor="middle">
                {p.n}
              </text>
            </g>
          ))}
        </svg>
        <figcaption>
          <b>{d.title}</b>
          {d.note && ` ${d.note}`}
          <ol class="legend">
            {d.points.map((p) => (
              <li>
                <b>{p.n}</b> {p.label}
              </li>
            ))}
          </ol>
          <span class="src">{srcLabel(m, d.cite)}</span>
        </figcaption>
      </figure>
    </step-sequence>
  );
}

// ---------- steps ----------

function Conflict({ m, st, src }: { m: Model; st: Step; src: string }): Html {
  const c = st.conflict!;
  return (
    <div class={`conflict${c.agrees ? " agrees" : ""}`}>
      <p class="conflict-note">
        {c.agrees ? "Other sources agree." : "Sources disagree."} {c.note}
      </p>
      <div class="parallel">
        {c.others.map((o) => (
          <blockquote>
            {o.t} {supplementCite(m, o.cite, src)}
          </blockquote>
        ))}
      </div>
    </div>
  );
}

// The links of a step or a summary: a book section, a procedure and a spec value.
function Deps({ m, x }: { m: Model; x: { ref?: string; op?: string; spec_ref?: string } }): Html | null {
  const deps = [x.ref && refLink(m, x.ref), x.op && opLink(m, x.op), x.spec_ref && specLink(m, x.spec_ref)].filter((d): d is Html => !!d);
  if (!deps.length) return null;
  return (
    <>
      {" "}
      <span class="deps">{join(deps, " ")}</span>
    </>
  );
}

// A summary paragraph, with its links.
export const SummaryP = ({ m, s }: { m: Model; s: Summary }): Html => (
  <p class="summary">
    {s.t}
    <Deps m={m} x={s} />
  </p>
);

function StepHtml({ m, st, src, chapter, shown }: { m: Model; st: Step; src: string; chapter?: number; shown: Set<string> }): Html {
  const ch = st.chapter ?? chapter;
  const figs = (st.figs ?? []).map((n) => m.figures.get(figureKey(ch, n))).filter((f) => !!f);
  const external = (st.cite.s && st.cite.s !== "clymer" && st.cite.s !== src) || src !== "clymer";
  const diagram = st.diagram ? m.diagrams.get(st.diagram) : undefined;
  return (
    <li class={st.kind} title={srcLabel(m, st.cite, src)}>
      <p>
        {st.kind && (
          <>
            <span class="kind">{st.kind}</span>{" "}
          </>
        )}
        {st.t}
        {external && <> {supplementCite(m, st.cite, src)}</>}
        <Deps m={m} x={st} />
      </p>
      {st.conflict && <Conflict m={m} st={st} src={src} />}
      {st.gap && <p class="gap">Gap: {st.gap}</p>}
      {diagram && <DiagramHtml m={m} d={diagram} shown={shown} />}
      {figs.length > 0 && <div class="figs">{figs.map((f) => photo(f.chapter, f.n, f.url))}</div>}
    </li>
  );
}

// The steps of the sections of a procedure. The headings are at `level`.
export function Sections({ m, secs, src, chapter, level = 3 }: { m: Model; secs: Section[]; src: string; chapter?: number; level?: number }): Html {
  const shown = new Set<string>();
  return (
    <>
      {secs.map((s) => (
        <>
          {s.title && <H level={level}>{s.title}</H>}
          <ol class="steps">
            {s.steps.map((st) => (
              <StepHtml m={m} st={st} src={src} chapter={chapter} shown={shown} />
            ))}
          </ol>
        </>
      ))}
    </>
  );
}

// ---------- parts, tools and substitutes ----------

// Community substitutes (data/substitutes.yaml), as notes on tools and parts.
// `opId` limits the notes to one procedure. With no `opId` (the tool list),
// all notes show, with the procedure that they apply to.
export function SubNotes({ m, kind, name, opId }: { m: Model; kind: "tool" | "part"; name: string; opId?: string }): Html | null {
  const list = m.substitutes.filter((x) => x.for[kind] === name && (!x.for.op || !opId || x.for.op === opId));
  if (!list.length) return null;
  return (
    <ul class="subs">
      {list.map((x) => (
        <li class={x.kind === "warning" ? "warn" : undefined}>
          <span class="lbl">
            {x.kind === "warning" ? "Owner warning" : "Substitute"}
            {!opId && x.for.op && <> (for {opLink(m, x.for.op)})</>}:
          </span>{" "}
          {x.t} {supplementCite(m, x.cite)}
        </li>
      ))}
    </ul>
  );
}

export function Parts({ m, parts, src, level = 4 }: { m: Model; parts: Part[]; src: string; level?: number }): Html {
  const { isToolPart } = tools(m);
  const groups: [Part["replace"], string][] = [
    ["always", "Replace"],
    ["inspect", "Replace if worn or damaged"],
    ["consumable", "Consumables"],
  ];
  return (
    <>
      {groups.map(([kind, title]) => {
        const list = parts.filter((p) => p.replace === kind && !isToolPart(p));
        if (!list.length) return null;
        return (
          <section class={`parts parts-${kind}`}>
            <H level={level}>{title}</H>
            <ul class="checklist">
              {list.map((p) => (
                <li class={`part part-${kind}`} data-key={`:${p.name}`} title={srcLabel(m, p.cite, src)}>
                  <span class="name">{p.name}</span>
                  {p.spec_ref && <> {specLink(m, p.spec_ref)}</>}
                  {p.note && (
                    <>
                      {" "}
                      <span class="pnote">{p.note}</span>
                    </>
                  )}
                  <SubNotes m={m} kind="part" name={p.name} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

const plain = (html: string): string => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const sortVariants = (vs: string[]) => vs.sort((a, b) => (parseFloat(a) || 1e9) - (parseFloat(b) || 1e9) || a.localeCompare(b));

// Sizes and types as chips, and values to measure as a table. The table
// folds into a details element when it has more than `fold` rows.
export function Variants({ m, variants, fold }: { m: Model; variants: Map<string, Set<string>>; fold: number }): Html {
  const keys = [...variants.keys()];
  const sizes = sortVariants(keys.filter((k) => !k.startsWith("spec:")));
  const rows = keys
    .filter((k) => k.startsWith("spec:"))
    .map((k) => ({ k, hit: findSpec(m, k.slice(5)) }))
    .filter((r) => r.hit)
    .map(({ k, hit }) => ({ k, label: `${hit!.row.group ? `${hit!.row.group}, ` : ""}${hit!.row.item}`, row: hit!.row, table: hit!.table }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const opsTitle = (k: string) => [...variants.get(k)!].join(", ");
  const limits = rows.some((r) => r.row.std !== undefined || r.row.limit !== undefined);
  const table = (
    <table class="vals">
      <thead>
        {limits ? (
          <tr>
            <th>Measurement</th>
            <th>New</th>
            <th>Limit</th>
          </tr>
        ) : (
          <tr>
            <th>Measurement</th>
            <th>Value</th>
          </tr>
        )}
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr title={opsTitle(r.k)}>
            <th scope="row">{r.label}</th>
            {limits ? (
              <>
                <td>{r.row.std ?? r.row.value ?? ""}</td>
                <td>{r.row.limit ?? ""}</td>
              </>
            ) : (
              <td>{raw(plain(specValue(r.row, r.table.format)))}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      {sizes.length > 0 && (
        <p class="variants">
          <span class="lbl">Sizes and types:</span>{" "}
          <span class="chips">
            {sizes.map((v) => (
              <span class="chip" title={opsTitle(v)}>
                {v}
              </span>
            ))}
          </span>
        </p>
      )}
      {rows.length > 0 &&
        (rows.length > fold ? (
          <details class="vals">
            <summary>Values to measure ({rows.length})</summary>
            {table}
          </details>
        ) : (
          <>
            <p class="variants">
              <span class="lbl">Values to measure:</span>
            </p>
            {table}
          </>
        ))}
    </>
  );
}

export function ToolsBox({ m, op, level = 3 }: { m: Model; op: Operation; level?: number }): Html | null {
  const ts = tools(m).toolsFor(op);
  if (!ts.length) return null;
  return (
    <section class="box">
      <H level={level}>Tools</H>
      <ul class="tools">
        {ts.map((t) => (
          <li>
            <a href={`/tools.html#tool-${t.id}`} title={t.why[0]}>
              {t.name}
            </a>
            <Variants m={m} variants={t.variants} fold={3} />
            <SubNotes m={m} kind="tool" name={t.id} opId={op.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- procedures ----------

const tasksFor = (m: Model, id: string): Task[] => m.schedule.tasks.filter((t) => t.op === id);
const intervalLabel = (m: Model, id: string) => m.schedule.intervals.find((i) => i.id === id)?.label ?? id;
const whenText = (m: Model, t: Task) => [...t.at.map((a) => intervalLabel(m, a)), t.other].filter(Boolean).join(", ");

function sourcePages(m: Model, op: Operation): string {
  const bySrc = new Map<string, Set<string>>();
  const add = (c: Cite) => {
    const s = c.s ?? op.source;
    if (s === "forum") return;
    const label = c.p ? printedLabel(m, s, c.p) || `PDF ${c.p}` : "";
    if (!bySrc.has(s)) bySrc.set(s, new Set());
    bySrc.get(s)!.add(label);
  };
  op.sections.forEach((s) => s.steps.forEach((st) => add(st.cite)));
  return [...bySrc.entries()].map(([s, ps]) => `${m.sources[s]?.short ?? s} p${[...ps].sort((a, b) => parseInt(a) - parseInt(b)).join(", ")}`).join("; ");
}

export const hasParts = (m: Model, op: Operation): boolean => !!op.parts?.some((p) => !tools(m).isToolPart(p));

export const Needs = ({ m, op }: { m: Model; op: Operation }): Html | null => {
  const deps = depsOf(op);
  if (!deps.length) return null;
  return (
    <p class="needs">
      <span class="lbl">Do first or have ready:</span> {join(deps.map((d) => depLink(m, d)), " ")}
    </p>
  );
};

// The full page of a procedure.
export function OpBody({ m, op }: { m: Model; op: Operation }): Html {
  const sk = m.opSection.get(op.id);
  const users = neededByOp(m, op.id);
  const sched = tasksFor(m, op.id);
  const issue = op.issue ? m.issues.get(op.issue) : undefined;
  return (
    <article class="op" id={`op-${op.id}`}>
      {sk && <p class="crumb">{refLink(m, sk)}</p>}
      <h1>{op.title}</h1>
      {sched.length > 0 && <p class="when">Schedule: {sched.map((t) => `${t.task} (${whenText(m, t)})`).join("; ")}.</p>}
      {op.summary && <SummaryP m={m} s={op.summary} />}
      <Needs m={m} op={op} />
      {issue && (
        <p class="needs">
          <span class="lbl">Known issue:</span> <a href={issue.url}>{issue.title}</a>
        </p>
      )}
      {op.spec_refs?.length ? (
        <section class="box">
          <H level={2}>Specifications</H>
          <dl>
            {op.spec_refs.map((r) => {
              const h = findSpec(m, r);
              return h ? (
                <>
                  <dt>{raw(rowLabel(h.row))}</dt>
                  <dd>{specLink(m, r)}</dd>
                </>
              ) : null;
            })}
          </dl>
        </section>
      ) : null}
      {hasParts(m, op) && (
        <section class="box">
          <H level={2}>Parts and materials</H>
          <Parts m={m} parts={op.parts!} src={op.source} level={3} />
        </section>
      )}
      <ToolsBox m={m} op={op} level={2} />
      <Sections m={m} secs={op.sections} src={op.source} chapter={op.chapter} level={2} />
      {users.length > 0 && (
        <p class="needs">
          <span class="lbl">Needed by:</span> {join(users.map((u) => opLink(m, u)), " ")}
        </p>
      )}
      <p class="provenance">Paraphrased from {sourcePages(m, op)}.</p>
    </article>
  );
}

