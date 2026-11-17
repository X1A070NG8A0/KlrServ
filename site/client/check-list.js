// @ts-check
// <check-list> holds lists of items that each have a checkbox with
// data-done-key. The stylesheet crosses out a ticked item with :has().
// This element keeps the ticks in localStorage and moves ticked items
// below the open items, in their original order.

const PREFIX = "klr650:done:";

/** @param {string} key */
function stored(key) {
  try {
    return localStorage.getItem(PREFIX + key) === "1";
  } catch {
    return false;
  }
}

/** @param {string} key @param {boolean} done */
function store(key, done) {
  try {
    if (done) localStorage.setItem(PREFIX + key, "1");
    else localStorage.removeItem(PREFIX + key);
  } catch {
    // Private mode or blocked storage: the ticks do not persist.
  }
}

/** @param {Element} li */
const isDone = (li) => li.querySelector("input[data-done-key]:checked") !== null;

class CheckList extends HTMLElement {
  connectedCallback() {
    for (const box of this.querySelectorAll("input[data-done-key]")) {
      if (box instanceof HTMLInputElement) box.checked = stored(box.dataset.doneKey ?? "");
    }
    this.addEventListener("change", this);
    this.sort();
  }

  disconnectedCallback() {
    this.removeEventListener("change", this);
  }

  /** @param {Event} e */
  handleEvent(e) {
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || !box.dataset.doneKey) return;
    store(box.dataset.doneKey, box.checked);
    this.sort();
    box.focus();
  }

  sort() {
    for (const list of this.querySelectorAll(":scope > ul, :scope > ol")) {
      const items = [...list.children];
      items.forEach((li, i) => {
        if (li instanceof HTMLElement) li.dataset.order ??= String(i);
      });
      items
        .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || Number(/** @type {HTMLElement} */ (a).dataset.order) - Number(/** @type {HTMLElement} */ (b).dataset.order))
        .forEach((li) => list.append(li));
    }
  }
}

customElements.define("check-list", CheckList);
