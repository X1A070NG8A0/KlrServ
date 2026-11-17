// @ts-check
// <pop-link> holds a link with data-pop. If you point to it with a mouse for
// a short time, a <pop-window> opens with the content of data-pop. A touch
// or a click follows the link as usual. Without JavaScript, it is a link.

import { PopWindow, SHOW_DELAY, scheduleSweep } from "./pop-window.js";

/** @type {number | undefined} */
let showTimer;

class PopLink extends HTMLElement {
  connectedCallback() {
    this.addEventListener("pointerover", this);
    this.addEventListener("pointerout", this);
  }

  disconnectedCallback() {
    this.removeEventListener("pointerover", this);
    this.removeEventListener("pointerout", this);
  }

  /** @param {Event} e */
  handleEvent(e) {
    if (!(e instanceof PointerEvent)) return;
    const a = this.querySelector("a[data-pop]");
    if (!(a instanceof HTMLAnchorElement)) return;
    if (e.type === "pointerover") {
      if (e.pointerType !== "mouse") return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => PopWindow.open(a), SHOW_DELAY);
    } else if (!(e.relatedTarget instanceof Node && this.contains(e.relatedTarget))) {
      clearTimeout(showTimer);
      scheduleSweep();
    }
  }
}

customElements.define("pop-link", PopLink);
