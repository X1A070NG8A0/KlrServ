// Small HTML helpers shared by the page builders.
import type { Cite, Data, SpecRow, SpecTable } from "./data.ts";
import { appliesToBike, printedLabel } from "./data.ts";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const pad = (p: number): string => String(p).padStart(3, "0");

export type Nav = "home" | "book" | "schedule" | "specs" | "parts" | "issues" | "figures" | "search" | "verify" | "";

export function layout(title: string, nav: Nav, body: string): string {
  const link = (id: Nav, href: string, label: string) =>
    `<a href="${href}"${nav === id ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · KLR650 service wiki</title>
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/htmx.min.js" defer></script>
<script src="/assets/main.js" type="module"></script>
</head>
<body>
<header class="site">
  <a class="brand" href="/">KLR650 <span class="sc">service wiki</span></a>
  <nav>
    ${link("book", "/book/", "Book")}
    ${link("schedule", "/schedule.html", "Schedule")}
    ${link("parts", "/parts.html", "Parts")}
    ${link("specs", "/specs.html", "Specs")}
    ${link("issues", "/issues/", "Known issues")}
    ${link("figures", "/figures.html", "Photos")}
    ${link("search", "/search.html", "Search")}
  </nav>
  <span class="bike" title="The values for this model year are highlighted">2006 KL650A</span>
</header>
<main>
${body}
</main>
<footer class="site">
  Each step is a paraphrase of a cited source page. If no source gives a value, the page shows a gap.
  <a href="/verify.html">Build checks</a>.
</footer>
</body>
</html>
`;
}

// Plain-text provenance label, for example "Clymer p76" or "klr650.net, post 14".
export function srcLabel(data: Data, c: Cite, defaultSrc?: string): string {
  const s = c.s ?? defaultSrc ?? "";
  if (s === "forum") return `klr650.net, post ${c.post}`;
  const src = data.sources[s];
  const printed = c.p ? printedLabel(data, s, c.p) : "";
  return `${src?.short ?? s} ${printed ? `p${printed}` : `PDF p${c.p}`}`;
}

// Visible citation for a supplement (Kawasaki or forum). Clymer is the base
// text of the wiki, so its pages appear only as quiet provenance.
export function supplementCite(data: Data, c: Cite, defaultSrc?: string): string {
  const s = c.s ?? defaultSrc ?? "";
  if (s === "clymer") return `<span class="src">${esc(srcLabel(data, c, s))}</span>`;
  if (s === "forum") {
    const t = data.threads.get(c.id!);
    return `<span class="cite"><a href="/community/${c.id}.html#post-${c.post}" data-pop="/frag/post/${c.id}/${c.post}.html" title="${esc(t?.title)}">${esc(srcLabel(data, c))}</a></span>`;
  }
  return `<span class="src src-ext" title="${esc(data.sources[s]?.title)}">${esc(srcLabel(data, c, s))}</span>`;
}

export function specValue(r: SpecRow, kind?: SpecTable["kind"]): string {
  if (kind === "torque" || r.nm || r.ftlb || r.inlb) {
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

export function rowLabel(r: SpecRow): string {
  return `${r.group ? `${esc(r.group)} — ` : ""}${esc(r.item)}${r.years ? ` <span class="years">${esc(r.years)}</span>` : ""}`;
}

export function yearClass(r: SpecRow): string {
  return r.years ? (appliesToBike(r.years) ? " this-year" : " other-year") : "";
}
