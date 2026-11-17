// @ts-check
// <list-filter items="selector"> holds a search input. Each word typed in it
// must be in an item, or the item is hidden. An item matches against its
// data-search attribute, or else its text.

class ListFilter extends HTMLElement {
  connectedCallback() {
    this.addEventListener("input", this);
  }

  disconnectedCallback() {
    this.removeEventListener("input", this);
  }

  handleEvent() {
    const input = this.querySelector("input");
    const selector = this.getAttribute("items");
    if (!input || !selector) return;
    const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue;
      const hay = el.dataset.search ?? el.textContent?.toLowerCase() ?? "";
      el.hidden = !terms.every((t) => hay.includes(t));
    }
  }
}

customElements.define("list-filter", ListFilter);
