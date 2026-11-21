// A group of specification tables: pagedef/specs/<group>.yaml. Each table is a child page.
import { children, template, type AnyPage } from "ggass";
import { specTableOf } from "./lib/specs.ts";
import { SpecTableHtml } from "./lib/render.tsx";

export default template({
  fields: { pages: children("spec-table") },
  render: (page, site) => {
    const m = { sources: site.data.sources };
    return (
      <>
        <p class="crumb">
          <a href="/specs.html">Specifications</a>
        </p>
        <h1>{page.title}</h1>
        <p class="meta">Rows for other model years are grey. Rows for 2006 are green.</p>
        {(page.pages ?? []).map((t) => (
          <SpecTableHtml m={m} t={specTableOf(t as AnyPage, page)} filter={false} />
        ))}
      </>
    );
  },
});
