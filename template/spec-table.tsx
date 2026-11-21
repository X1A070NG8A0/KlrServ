// One specification table: a child page of pagedef/specs/<group>.yaml, so
// that a link to a value can open only this table in a popup window.
import { boolean, list, oneOf, optional, template, text } from "ggass";
import { cite } from "./lib/fields.ts";
import { SpecTableHtml } from "./lib/render.tsx";
import { specTableOf } from "./lib/specs.ts";

export default template({
  fields: {
    // torque: N·m, ft-lb and in-lb columns. limits: new and service limit columns.
    format: optional(oneOf("torque", "limits")),
    cite,
    note: optional(text()),
    rows: list({
      group: optional(text()),
      item: text(),
      years: optional(text()),
      value: optional(text()),
      std: optional(text()),
      limit: optional(text()),
      nm: optional(text()),
      inlb: optional(text()),
      ftlb: optional(text()),
      remarks: optional(text()),
      // For writers only: in the source copy, the value was on the heading
      // line, and it was moved down. The site does not show it.
      realigned: optional(boolean()),
      cite: optional(cite),
    }),
  },
  render: (page, site) => {
    const group = site.parent(page)!;
    const t = specTableOf(page, group);
    return (
      <>
        <p class="crumb">
          <a href="/specs.html">Specifications</a> · <a href={group.url}>{group.title}</a>
        </p>
        <h1>{page.title}</h1>
        <SpecTableHtml m={{ sources: site.data.sources }} t={t} filter={false} />
      </>
    );
  },
});
