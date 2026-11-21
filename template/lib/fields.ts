// The schema fields that several templates share.
import { boolean, list, number, object, oneOf, optional, text } from "ggass";

export const cite = object({ s: optional(text()), p: optional(number()), ref: optional(text()), id: optional(text()), post: optional(number()) });
// `op` and `ref` link the summary to a procedure or a book section, as in a step.
export const summary = object({ t: text(), cite, op: optional(text()), ref: optional(text()) });

export const step = object({
  t: text(),
  kind: optional(oneOf("note", "caution", "warning")),
  cite,
  // A reviewer compared the numbers of the step with the page image.
  image_checked: optional(boolean()),
  diagram: optional(text()),
  figs: optional(list(number())),
  // The Clymer chapter of `figs`, if it is not the chapter of the operation.
  chapter: optional(number()),
  op: optional(text()),
  // A book section that this step needs, "NN/section-id".
  ref: optional(text()),
  spec_ref: optional(text()),
  conflict: optional(object({ note: text(), agrees: optional(boolean()), others: list({ t: text(), cite }) })),
  gap: optional(text()),
});

export const steps = list({ title: optional(text()), steps: list(step) });

export const part = object({
  name: text(),
  replace: oneOf("always", "inspect", "consumable"),
  cite,
  note: optional(text()),
  spec_ref: optional(text()),
});
