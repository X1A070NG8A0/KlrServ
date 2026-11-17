// Client behaviour: list filters, the global search page, and checklists
// (ticked items cross out and move to the bottom; ticks live in localStorage).

const STORE_PREFIX = "klr650:done:";

function storageGet(key: string): boolean {
  try {
    return localStorage.getItem(STORE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}
function storageSet(key: string, done: boolean): void {
  try {
    if (done) localStorage.setItem(STORE_PREFIX + key, "1");
    else localStorage.removeItem(STORE_PREFIX + key);
  } catch {
    /* private mode or blocked storage: ticks just won't persist */
  }
}

// Move done items below open ones, keeping each group's original order.
function sortChecklist(list: HTMLElement): void {
  const items = [...list.children] as HTMLElement[];
  items.forEach((li, i) => li.dataset.order ??= String(i));
  items
    .sort((a, b) => Number(a.classList.contains("done")) - Number(b.classList.contains("done")) || Number(a.dataset.order) - Number(b.dataset.order))
    .forEach((li) => list.appendChild(li));
}

function initChecklists(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>("input[data-done-key]").forEach((box) => {
    if (box.dataset.bound) return;
    box.dataset.bound = "1";
    const li = box.closest("li");
    const key = box.dataset.doneKey!;
    box.checked = storageGet(key);
    li?.classList.toggle("done", box.checked);
    box.addEventListener("change", () => {
      storageSet(key, box.checked);
      li?.classList.toggle("done", box.checked);
      const list = li?.parentElement;
      if (list) sortChecklist(list);
    });
  });
  root.querySelectorAll<HTMLElement>(".checklist").forEach(sortChecklist);
}

function initFilters(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>("input.filter[data-filter]").forEach((input) => {
    const selector = input.dataset.filter!;
    input.addEventListener("input", () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        const hay = el.dataset.search ?? el.textContent?.toLowerCase() ?? "";
        el.hidden = !terms.every((t) => hay.includes(t));
      });
    });
  });
}

type Entry = { k: string; t: string; x: string; u: string };
async function initSearch(): Promise<void> {
  const q = document.getElementById("q") as HTMLInputElement | null;
  const out = document.getElementById("results");
  if (!q || !out) return;
  const index: Entry[] = await (await fetch("/search-index.json")).json();
  const run = () => {
    const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    out.replaceChildren();
    if (!terms.length) return;
    const hits = index.filter((e) => {
      const hay = `${e.t} ${e.x}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    for (const e of hits.slice(0, 80)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = e.u;
      a.textContent = e.t;
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = e.k;
      const snip = document.createElement("p");
      snip.className = "meta";
      const at = e.x.toLowerCase().indexOf(terms[0]);
      snip.textContent = at >= 0 ? `…${e.x.slice(Math.max(0, at - 60), at + 120)}…` : e.x.slice(0, 160);
      li.append(kind, " ", a, snip);
      out.append(li);
    }
    if (!hits.length) out.innerHTML = "<li class='meta'>Nothing cited matches that.</li>";
  };
  q.addEventListener("input", run);
  const initial = new URLSearchParams(location.search).get("q");
  if (initial) {
    q.value = initial;
    run();
  }
}

// /parts.html?mi=9000 opens that milestone directly.
function initMilestoneFromUrl(): void {
  const mi = new URLSearchParams(location.search).get("mi");
  const target = document.getElementById("milestone");
  if (!mi || !target || !/^\d+$/.test(mi)) return;
  fetch(`/frag/milestone/${mi}.html`)
    .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
    .then((html) => {
      target.innerHTML = html;
      initChecklists(target);
    })
    .catch(() => {});
}

// ---------- Popup windows (gwern-style) ----------
// Hovering a link with data-pop opens a floating window with the full target.
// Links inside a window open child windows. A window closes when the pointer
// leaves it, its link and its children, unless it is pinned. Pinned windows
// stay in place (position: fixed) and can be dragged by the title bar.
type Win = { el: HTMLElement; anchor: Element; pinned: boolean; parent?: Win };
const wins: Win[] = [];
const fragCache = new Map<string, Promise<string>>();
let zTop = 1000;
let showTimer: number | undefined;
let sweepTimer: number | undefined;

const getFrag = (url: string): Promise<string> => {
  if (!fragCache.has(url))
    fragCache.set(url, fetch(url).then((r) => (r.ok ? r.text() : "<p class='meta'>Not found.</p>")).catch(() => "<p class='meta'>Not found.</p>"));
  return fragCache.get(url)!;
};

function placeWin(el: HTMLElement, anchor: Element): void {
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function closeWin(w: Win): void {
  for (const c of wins.filter((x) => x.parent === w)) closeWin(c);
  w.el.remove();
  const i = wins.indexOf(w);
  if (i >= 0) wins.splice(i, 1);
}

function sweep(): void {
  for (let i = wins.length - 1; i >= 0; i--) {
    const w = wins[i];
    if (!w || w.pinned) continue;
    const hovered = w.el.matches(":hover") || w.anchor.matches(":hover") || wins.some((c) => c.parent === w);
    if (!hovered) closeWin(w);
  }
}
const scheduleSweep = () => {
  clearTimeout(sweepTimer);
  sweepTimer = window.setTimeout(sweep, 350);
};

function makeDraggable(w: Win, bar: HTMLElement): void {
  bar.addEventListener("mousedown", (e) => {
    if ((e.target as Element).closest("button, a")) return;
    e.preventDefault();
    w.pinned = true;
    w.el.classList.add("pinned");
    w.el.style.zIndex = String(++zTop);
    const dx = e.clientX - w.el.offsetLeft, dy = e.clientY - w.el.offsetTop;
    const move = (m: MouseEvent) => {
      w.el.style.left = `${m.clientX - dx}px`;
      w.el.style.top = `${m.clientY - dy}px`;
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}

async function openWin(a: HTMLAnchorElement): Promise<void> {
  if (wins.some((w) => w.anchor === a)) return;
  const parentEl = a.closest(".popwin");
  const parent = wins.find((w) => w.el === parentEl);
  // Close unpinned siblings so only one chain of windows is open.
  for (const w of wins.filter((x) => x.parent === parent && !x.pinned)) closeWin(w);
  const el = document.createElement("div");
  el.className = "popwin";
  el.style.zIndex = String(++zTop);
  const bar = document.createElement("div");
  bar.className = "popbar";
  // The title is plain text so the whole bar is a drag handle; "open" links to the page.
  const title = document.createElement("span");
  title.className = "poptitle";
  title.textContent = a.textContent?.trim() ?? "";
  title.title = "Drag to move";
  const open = document.createElement("a");
  open.href = a.href;
  open.className = "popopen";
  open.textContent = "open";
  open.title = "Open the full page";
  const pin = document.createElement("button");
  pin.type = "button";
  pin.textContent = "pin";
  pin.title = "Keep this window open";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.title = "Close";
  bar.append(title, open, pin, close);
  const body = document.createElement("div");
  body.className = "popbody";
  body.textContent = "Loading…";
  el.append(bar, body);
  document.body.append(el);
  const w: Win = { el, anchor: a, pinned: false, parent };
  wins.push(w);
  pin.addEventListener("click", () => {
    w.pinned = !w.pinned;
    el.classList.toggle("pinned", w.pinned);
    pin.textContent = w.pinned ? "unpin" : "pin";
  });
  close.addEventListener("click", () => closeWin(w));
  el.addEventListener("mouseleave", scheduleSweep);
  el.addEventListener("mousedown", () => (el.style.zIndex = String(++zTop)));
  makeDraggable(w, bar);
  placeWin(el, a);
  body.innerHTML = await getFrag(a.dataset.pop!);
  initChecklists(body);
  if (!w.pinned) placeWin(el, a);
}

document.addEventListener("mouseover", (e) => {
  const a = (e.target as Element).closest?.("a[data-pop]") as HTMLAnchorElement | null;
  if (!a) return;
  clearTimeout(showTimer);
  showTimer = window.setTimeout(() => void openWin(a), 220);
});
document.addEventListener("mouseout", (e) => {
  const a = (e.target as Element).closest?.("a[data-pop]");
  if (a && !a.contains(e.relatedTarget as Node)) {
    clearTimeout(showTimer);
    scheduleSweep();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") for (const w of [...wins].reverse()) if (!w.pinned) closeWin(w);
});

// The side panel only sits beside the list on wide screens. On narrow ones it
// would load below the fold, so follow the link to the full page instead.
document.addEventListener("htmx:beforeRequest", (e) => {
  const detail = (e as CustomEvent).detail as { elt: Element; target: Element };
  if (detail.target?.id === "panel" && !matchMedia("(min-width: 1100px)").matches) {
    e.preventDefault();
    const href = detail.elt.getAttribute("href");
    if (href) location.href = href;
  }
});

// Procedure links are panel-enabled everywhere; on pages without a panel
// htmx can't find the target, so fall back to ordinary navigation.
document.addEventListener("htmx:targetError", (e) => {
  const elt = ((e as CustomEvent).detail as { elt: Element }).elt;
  const href = elt?.getAttribute("href");
  if (href) location.href = href;
});

document.addEventListener("DOMContentLoaded", () => {
  initChecklists(document);
  initFilters(document);
  void initSearch();
  initMilestoneFromUrl();
});
document.addEventListener("htmx:afterSwap", (e) => initChecklists((e.target as HTMLElement) ?? document));
