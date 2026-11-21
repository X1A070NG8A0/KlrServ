// A known issue from owner reports: pagedef/issues/<id>.yaml.
import { list, optional, template, text } from "ggass";
import { steps, summary } from "./lib/fields.ts";
import { join, opLink, Sections, supplementCite } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: {
    ops: optional(list(text())),
    summary: list(summary),
    sections: steps,
  },
  render: (page, site) => {
    const m = siteModel(site);
    return (
      <>
        <p class="crumb">
          <a href="/book/">Full reference</a> · <a href="/book/errata.html">Errata</a>
        </p>
        <article class="op">
          <h1>{page.title}</h1>
          {page.summary.map((s) => (
            <p class="summary">
              {s.t} {supplementCite(m, s.cite)}
            </p>
          ))}
          {page.ops?.length ? (
            <p class="needs">
              <span class="lbl">Procedures:</span> {join(page.ops.map((o) => opLink(m, o)), " ")}
            </p>
          ) : null}
          <Sections m={m} secs={page.sections as never} src="forum" />
        </article>
      </>
    );
  },
});
