// A procedure: pagedef/ops/<id>.yaml.
import { list, number, optional, template, text } from "ggass";
import { part, steps, summary } from "./lib/fields.ts";
import { OpBody } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: {
    // The group in the old operation list, for example "Engine top end".
    system: text(),
    // The source of the steps that have no `s` in their citation.
    source: text(),
    // The Clymer chapter of the figures.
    chapter: optional(number()),
    // The book section, "NN/section-id".
    section: optional(text()),
    // A known issue in pagedef/issues/.
    issue: optional(text()),
    summary: optional(summary),
    spec_refs: optional(list(text())),
    parts: optional(list(part)),
    sections: steps,
  },
  render: (page, site) => {
    const m = siteModel(site);
    const op = [...m.ops.values()].find((o) => o.url === page.url)!;
    return <OpBody m={m} op={op} />;
  },
});
