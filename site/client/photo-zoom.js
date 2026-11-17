// @ts-check
// <photo-zoom> holds a figure whose image is in a link to the image file.
// A click opens the image large in a modal dialog. A click on the dialog or
// the Escape key closes it. Without JavaScript, the link opens the image file.

class PhotoZoom extends HTMLElement {
  connectedCallback() {
    this.addEventListener("click", this);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this);
  }

  /** @param {Event} e */
  handleEvent(e) {
    if (!(e instanceof MouseEvent) || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest("a") : null;
    const img = a?.querySelector("img");
    if (!a || !img || !this.contains(a)) return;
    e.preventDefault();
    const dialog = document.createElement("dialog");
    dialog.className = "zoom";
    const big = document.createElement("img");
    big.src = a.href;
    big.alt = img.alt;
    dialog.append(big);
    const caption = this.querySelector("figcaption");
    if (caption) dialog.append(caption.cloneNode(true));
    dialog.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }
}

customElements.define("photo-zoom", PhotoZoom);
