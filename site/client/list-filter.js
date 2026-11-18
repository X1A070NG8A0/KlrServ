// @ts-check
// <list-filter items="selector"> holds a search input. Each word typed in it
// must be in an item, or the item is hidden. An item matches against its
// data-search attribute, or else its text.

class ListFilter extends HTMLElement {
  /** @type {HTMLElement | undefined} */
  status;

  connectedCallback() {
    this.addEventListener("input", this);
    // Screen readers hear how many items are shown (a polite live region).
    if (!this.status) {
      this.status = document.createElement("p");
      this.status.className = "vh";
      this.status.setAttribute("role", "status");
      this.append(this.status);
    }
  }

  disconnectedCallback() {
    this.removeEventListener("input", this);
  }

  handleEvent() {
    const input = this.querySelector("input");
    const selector = this.getAttribute("items");
    if (!input || !selector) return;
    const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0, total = 0;
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue;
      const hay = el.dataset.search ?? el.textContent?.toLowerCase() ?? "";
      el.hidden = !terms.every((t) => hay.includes(t));
      total++;
      if (!el.hidden) shown++;
    }
    if (this.status) this.status.textContent = terms.length ? `${shown} of ${total} shown` : "";
  }
}

customElements.define("list-filter", ListFilter);
