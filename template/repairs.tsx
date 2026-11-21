// Common repairs: the procedures and known issues of data/common-repairs.yaml, by category.
import { template } from "ggass";
import { FilterBox, lower, opLink } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

const firstSentence = (t?: string) => (t ?? "").split(/(?<=\.)\s/)[0];

export default template({
  fields: {},
  render: (page, site) => {
    const m = siteModel(site);
    return (
      <>
        <h1>{page.title}</h1>
        <FilterBox items="ul.repairs > li" label="Filter the repairs" placeholder="for example flat, cable, bulb" />
        {m.repairs.map((c) => (
          <section class="repair-cat">
            <h2>{c.title}</h2>
            <ul class="repairs">
              {c.ops
                .map((o) => m.ops.get(o))
                .filter((op) => !!op)
                .map((op) => (
                  <li data-search={lower(`${c.title} ${op.title} ${op.summary?.t ?? ""}`)}>
                    {opLink(m, op.id)}
                    {op.summary && <span class="meta"> {firstSentence(op.summary.t)}</span>}
                  </li>
                ))}
              {(c.issues ?? [])
                .map((i) => m.issues.get(i))
                .filter((is) => !!is)
                .map((is) => (
                  <li data-search={lower(`${c.title} ${is.title}`)}>
                    <a href={is.url}>{is.title}</a>
                    <span class="meta"> Owner reports.</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </>
    );
  },
});
