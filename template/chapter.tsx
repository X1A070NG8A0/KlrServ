// A chapter of the manual: pagedef/book/chNN/index.yaml. Each section is a child page.
import { children, template } from "ggass";
import { FilterBox, lower, secLink } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: { pages: children("section") },
  render: (page, site) => {
    const m = siteModel(site);
    const c = m.book.find((x) => x.url === page.url)!;
    return (
      <>
        <p class="crumb">
          <a href="/book/">Full reference</a>
        </p>
        <h1>{page.title}</h1>
        <FilterBox items="ol.secs > li" label="Filter this chapter" placeholder="for example removal, inspection" />
        <ol class="secs">
          {c.sections.map((s) => (
            <li data-search={lower(`${s.title} ${s.ops.map((o) => m.ops.get(o)?.title ?? "").join(" ")} ${s.summary?.[0]?.t ?? ""}`)}>
              {secLink(c, s)}
              {s.summary?.[0] && <p class="meta">{s.summary[0].t}</p>}
            </li>
          ))}
        </ol>
      </>
    );
  },
});
