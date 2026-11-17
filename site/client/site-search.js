// @ts-check
// <site-search> holds a search input and a results list. It loads
// /search-index.json one time and shows the entries that contain each word.
// A ?q= parameter in the address fills the input.

/** @typedef {{ k: string, t: string, x: string, u: string }} Entry */

class SiteSearch extends HTMLElement {
  /** @type {Entry[]} */
  index = [];
  /** @type {AbortController | undefined} */
  abort;

  async connectedCallback() {
    const input = this.querySelector("input");
    if (!input) return;
    this.abort = new AbortController();
    const { signal } = this.abort;
    input.addEventListener("input", () => this.run(input.value), { signal });
    try {
      this.index = await (await fetch("/search-index.json", { signal })).json();
    } catch {
      return; // Disconnected before the load, or no index.
    }
    const q = new URLSearchParams(location.search).get("q");
    if (q) input.value = q;
    this.run(input.value);
  }

  disconnectedCallback() {
    this.abort?.abort();
  }

  /** @param {string} query */
  run(query) {
    const out = this.querySelector("ol");
    if (!out) return;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    out.replaceChildren();
    if (!terms.length) return;
    const hits = this.index.filter((e) => {
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
    if (!hits.length) {
      const li = document.createElement("li");
      li.className = "meta";
      li.textContent = "Nothing cited matches that.";
      out.append(li);
    }
  }
}

customElements.define("site-search", SiteSearch);
