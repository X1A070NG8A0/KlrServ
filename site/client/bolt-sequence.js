// @ts-check
// <bolt-sequence> holds a drawn tightening sequence: an SVG with one .pt
// group per bolt and an ordered legend in the same order. It adds Previous
// and Next buttons to step through the order. The current bolt shows in the
// drawing and in the legend. Pointing to a bolt or a legend line shows that
// step. Without JavaScript, the drawing and the numbered legend stay as they are.

class BoltSequence extends HTMLElement {
  /** @type {Element[]} */
  points = [];
  /** @type {Element[]} */
  items = [];
  /** @type {HTMLElement | undefined} */
  status;

  connectedCallback() {
    if (this.status) return;
    this.points = [...this.querySelectorAll("svg .pt")];
    this.items = [...this.querySelectorAll(".legend li")];
    const legend = this.querySelector(".legend");
    if (!legend || !this.points.length || this.points.length !== this.items.length) return;

    const bar = document.createElement("p");
    bar.className = "seqbar";
    const prev = this.button("Previous", -1);
    const next = this.button("Next", 1);
    this.status = document.createElement("span");
    this.status.setAttribute("aria-live", "polite");
    this.status.textContent = `${this.points.length} steps`;
    bar.append(prev, " ", this.status, " ", next);
    legend.before(bar);

    for (const list of [this.points, this.items]) {
      list.forEach((el, i) => el.addEventListener("pointerenter", () => this.show(i)));
    }
  }

  /** @param {string} text @param {number} delta */
  button(text, delta) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", () => {
      const n = this.points.length;
      const at = this.points.findIndex((p) => p.classList.contains("on"));
      this.show(at < 0 ? (delta > 0 ? 0 : n - 1) : (at + delta + n) % n);
    });
    return b;
  }

  /** @param {number} i */
  show(i) {
    this.points.forEach((p, j) => p.classList.toggle("on", j === i));
    this.items.forEach((li, j) => li.classList.toggle("on", j === i));
    if (this.status) this.status.textContent = `Step ${i + 1} of ${this.points.length}`;
  }
}

customElements.define("bolt-sequence", BoltSequence);
