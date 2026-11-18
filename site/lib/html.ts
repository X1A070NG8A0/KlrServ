// Small HTML helpers shared by the page builders.
import type { Cite, Data, SpecRow, SpecTable } from "./data.ts";
import { appliesToBike, printedLabel } from "./data.ts";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const pad = (p: number): string => String(p).padStart(3, "0");

export type Nav = "home" | "maint" | "repairs" | "book" | "tools" | "search" | "";

export function layout(title: string, nav: Nav, body: string): string {
  const link = (id: Nav, href: string, label: string) =>
    `<a href="${href}"${nav === id ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · KLR Service Explorer</title>
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/main.js" type="module"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <a class="brand" href="/">KLR Service Explorer</a>
  <nav>
    ${link("maint", "/maintenance.html", "Routine maintenance")}
    ${link("repairs", "/repairs.html", "Common repairs")}
    ${link("book", "/book/", "Full reference")}
    ${link("tools", "/tools.html", "Tool list")}
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="site">
  For the first-generation Kawasaki KLR650 (KL650A). Sources: Clymer KLR650 1987-2006 manual (M474-2), Kawasaki KLR600 and KLR650 service manuals, klr650.net. Each step names its source page.
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
    return `<pop-link class="cite"><a href="/community/${c.id}.html#post-${c.post}" data-pop="/frag/post/${c.id}/${c.post}.html" title="${esc(t?.title)}">${esc(srcLabel(data, c))}</a></pop-link>`;
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
