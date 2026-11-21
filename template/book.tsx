// The index of the full reference: /book/.
import { html, template } from "ggass";
import { chapterHref, FilterBox, lower, secLink } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: { intro: html() },
  render: (page, site) => {
    const m = siteModel(site);
    const opTitles = (ops: string[]) => ops.map((o) => m.ops.get(o)?.title ?? "").join(" ");
    return (
      <>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        <FilterBox items="li.chap" label="Filter the chapters" placeholder="for example fork, clutch, stator" />
        <p class="jump">
          <a href="/specs.html">Specifications</a> · <a href="/book/errata.html">Errata</a> · <a href="/search.html">Search all</a>
        </p>
        <ol class="chapters">
          {m.book.map((c) => (
            <li class="chap" data-search={lower(`${c.title} ${c.sections.map((s) => `${s.title} ${opTitles(s.ops)}`).join(" ")}`)}>
              <a href={chapterHref(c)}>
                Chapter {c.n}: {c.title}
              </a>
              <ul class="secs">
                {c.sections.map((s) => (
                  <li>{secLink(c, s)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </>
    );
  },
});
