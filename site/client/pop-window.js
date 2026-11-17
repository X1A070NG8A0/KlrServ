// @ts-check
// Gwern-style popup windows. If you point to a link that has data-pop, a
// <pop-window> opens with the content of that address. Links in a window open
// child windows. A window closes when the pointer leaves it, its link and its
// children, unless it is pinned. A pinned window stays in place, and you can
// drag it by its title bar.
//
// Each window is a manual popover, so it is in the top layer above the page.
// Anchor positioning puts it below its link, or above if there is no space.
// Browsers without anchor positioning or invoker commands get a fallback.

const SHOW_DELAY = 220;
const SWEEP_DELAY = 350;
const NOT_FOUND = "<p class='meta'>Not found.</p>";
const ANCHORS = CSS.supports("anchor-name: --a");
const INVOKERS = "commandForElement" in HTMLButtonElement.prototype;

/** @type {Map<string, Promise<string>>} */
const cache = new Map();

/** @param {string} url */
function fragment(url) {
  let page = cache.get(url);
  if (!page) {
    page = fetch(url).then((r) => (r.ok ? r.text() : NOT_FOUND), () => NOT_FOUND);
    cache.set(url, page);
  }
  return page;
}

let serial = 0;
/** @type {PopWindow | undefined} */
let topWin;

/** @returns {PopWindow[]} */
const windows = () => /** @type {PopWindow[]} */ ([...document.querySelectorAll("pop-window")]);

class PopWindow extends HTMLElement {
  /** @type {HTMLAnchorElement | undefined} */
  link;
  /** @type {PopWindow | undefined} */
  parentWin;
  pinned = false;
  /** @type {AbortController | undefined} */
  abort;

  /** @param {HTMLAnchorElement} link */
  static open(link) {
    const all = windows();
    if (all.some((w) => w.link === link)) return;
    const parent = link.closest("pop-window");
    const parentWin = parent instanceof PopWindow ? parent : undefined;
    // Close unpinned siblings, so that only one chain of windows is open.
    for (const w of all) if (w.parentWin === parentWin && !w.pinned) w.close();
    const win = /** @type {PopWindow} */ (document.createElement("pop-window"));
    win.link = link;
    win.parentWin = parentWin;
    document.body.append(win);
  }

  connectedCallback() {
    const link = this.link;
    if (!link || this.abort) return;
    this.abort = new AbortController();
    const { signal } = this.abort;
    this.id = `pw-${++serial}`;
    this.popover = "manual";

    const bar = document.createElement("div");
    bar.className = "popbar";
    const title = document.createElement("span");
    title.className = "poptitle";
    title.textContent = link.textContent?.trim() ?? "";
    title.title = "Drag to move";
    const open = document.createElement("a");
    open.className = "popopen";
    open.href = link.href;
    open.textContent = "open";
    open.title = "Open the full page";
    bar.append(title, open, this.button("--pin", "pin", "Keep this window open"), this.button("--close", "×", "Close"));
    const body = document.createElement("div");
    body.className = "popbody";
    body.textContent = "Loading…";
    this.append(bar, body);

    this.addEventListener("command", this, { signal });
    if (!INVOKERS) this.addEventListener("click", this, { signal });
    this.addEventListener("pointerdown", this, { signal });
    this.addEventListener("mouseleave", this, { signal });

    this.place();
    this.showPopover();
    topWin = this;
    void this.load(body);
  }

  disconnectedCallback() {
    this.abort?.abort();
  }

  /** @param {Event} e */
  handleEvent(e) {
    switch (e.type) {
      case "command":
        this.run(/** @type {Event & { command: string }} */ (e).command);
        break;
      case "click": {
        // Only for browsers without invoker commands.
        const b = e.target instanceof Element ? e.target.closest("button[command]") : null;
        if (b && this.contains(b)) this.run(b.getAttribute("command") ?? "");
        break;
      }
      case "pointerdown":
        this.raise();
        if (e instanceof PointerEvent && e.target instanceof Element && e.target.closest(".popbar") && !e.target.closest("button, a")) this.drag(e);
        break;
      case "mouseleave":
        scheduleSweep();
        break;
    }
  }

  /** @param {string} command @param {string} text @param {string} tip */
  button(command, text, tip) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("command", command);
    b.setAttribute("commandfor", this.id);
    b.textContent = text;
    b.title = tip;
    return b;
  }

  /** @param {string} command */
  run(command) {
    if (command === "--close") this.close();
    if (command === "--pin") this.setPinned(!this.pinned);
  }

  /** @param {boolean} on */
  setPinned(on) {
    this.pinned = on;
    this.classList.toggle("pinned", on);
    if (on) this.unanchor();
    const pin = this.querySelector('button[command="--pin"]');
    if (pin) pin.textContent = on ? "unpin" : "pin";
  }

  /** @param {HTMLElement} body */
  async load(body) {
    const url = this.link?.dataset.pop;
    if (!url) return;
    body.innerHTML = await fragment(url);
    // Custom elements in the content start themselves. htmx does not see
    // content that it did not insert, so tell it.
    /** @type {any} */ (window).htmx?.process(body);
    if (!ANCHORS && !this.pinned) this.place();
  }

  // Below the link, or above it if there is no space below.
  place() {
    const link = this.link;
    if (!link) return;
    if (ANCHORS) {
      const name = `--${this.id}`;
      link.style.setProperty("anchor-name", name);
      this.style.setProperty("position-anchor", name);
      this.classList.add("anchored");
      return;
    }
    const r = link.getBoundingClientRect();
    const w = this.offsetWidth, h = this.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
    this.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    this.style.top = `${top}px`;
  }

  // Fix the window at its current place and size in the viewport.
  unanchor() {
    if (!this.classList.contains("anchored")) return;
    const r = this.getBoundingClientRect();
    this.classList.remove("anchored");
    this.style.left = `${r.left}px`;
    this.style.top = `${r.top}px`;
    this.style.maxHeight = `${r.height}px`;
  }

  // The last popover shown is on top. Show this window and its children
  // again, so that they move to the top in the same order.
  raise() {
    if (topWin === this) return;
    topWin = this;
    const stack = [/** @type {PopWindow} */ (this)];
    for (let i = 0; i < stack.length; i++) stack.push(...windows().filter((w) => w.parentWin === stack[i]));
    for (const w of stack) {
      w.toggleAttribute("data-raising", true);
      w.hidePopover();
      w.showPopover();
    }
    requestAnimationFrame(() => stack.forEach((w) => w.removeAttribute("data-raising")));
  }

  /** @param {PointerEvent} e */
  drag(e) {
    const bar = /** @type {HTMLElement} */ (e.target instanceof Element && e.target.closest(".popbar"));
    e.preventDefault();
    this.setPinned(true);
    const r = this.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    bar.setPointerCapture(e.pointerId);
    const moves = new AbortController();
    const { signal } = moves;
    bar.addEventListener("pointermove", (m) => {
      this.style.left = `${m.clientX - dx}px`;
      this.style.top = `${m.clientY - dy}px`;
    }, { signal });
    bar.addEventListener("pointerup", () => moves.abort(), { signal });
    bar.addEventListener("pointercancel", () => moves.abort(), { signal });
  }

  close() {
    for (const w of windows()) if (w.parentWin === this) w.close();
    this.link?.style.removeProperty("anchor-name");
    if (topWin === this) topWin = undefined;
    this.remove();
  }
}

customElements.define("pop-window", PopWindow);

// ---------- Hover handling for the whole document ----------

/** @type {number | undefined} */
let showTimer;
/** @type {number | undefined} */
let sweepTimer;

function sweep() {
  for (const w of windows().reverse()) {
    if (w.pinned || !w.isConnected) continue;
    const hovered = w.matches(":hover") || w.link?.matches(":hover") || windows().some((c) => c.parentWin === w);
    if (!hovered) w.close();
  }
}

function scheduleSweep() {
  clearTimeout(sweepTimer);
  sweepTimer = setTimeout(sweep, SWEEP_DELAY);
}

/** @param {EventTarget | null} t */
const popLink = (t) => (t instanceof Element ? t.closest("a[data-pop]") : null);

// Mouse only: a tap on a touch screen follows the link.
document.addEventListener("pointerover", (e) => {
  const a = popLink(e.target);
  if (e.pointerType !== "mouse" || !(a instanceof HTMLAnchorElement)) return;
  clearTimeout(showTimer);
  showTimer = setTimeout(() => PopWindow.open(a), SHOW_DELAY);
});

document.addEventListener("pointerout", (e) => {
  const a = popLink(e.target);
  if (a && !(e.relatedTarget instanceof Node && a.contains(e.relatedTarget))) {
    clearTimeout(showTimer);
    scheduleSweep();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") for (const w of windows().reverse()) if (!w.pinned) w.close();
});
