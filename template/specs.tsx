// All specification tables on one page, by group, with a filter.
import { template } from "ggass";
import type { SpecTable } from "../lib/model.ts";
import { FilterBox, SpecTableHtml } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: {},
  render: (page, site) => {
    const m = siteModel(site);
    const byGroup = new Map<string, SpecTable[]>();
    for (const t of m.tables.values()) byGroup.set(t.chapter, [...(byGroup.get(t.chapter) ?? []), t]);
    return (
      <>
        <p class="crumb">
          <a href="/book/">Full reference</a>
        </p>
        <h1>{page.title}</h1>
        <FilterBox items="tr.row" label="Filter the specifications" placeholder="for example axle, valve, spark plug" />
        {[...byGroup].map(([group, tables]) => (
          <>
            <h2>{group}</h2>
            {tables.map((t) => (
              <SpecTableHtml m={m} t={t} filter />
            ))}
          </>
        ))}
      </>
    );
  },
});
