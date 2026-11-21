// The home page: a search field, the four parts of the site and the frequent jobs.
import { list, template, text } from "ggass";
import { opLink } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: {
    lede: text(),
    // The placeholder of the search field.
    search: text(),
    cards: list({ href: text(), label: text(), text: text() }),
    // Procedure ids.
    frequent: list(text()),
  },
  render: (page, site) => {
    const m = siteModel(site);
    return (
      <>
        <h1 class="brandmark">{site.config.name}</h1>
        <p class="lede">{page.lede}</p>
        <site-search>
          <form class="home-search" action="/search.html">
            <label class="field" for="home-q">Search</label>
            <input type="search" id="home-q" name="q" placeholder={page.search} />
          </form>
        </site-search>
        <ul class="cards">
          {page.cards.map((c) => (
            <li>
              <a href={c.href}>{c.label}</a>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
        <h2>Frequent jobs</h2>
        <ul class="frequent">
          {page.frequent
            .filter((o) => m.ops.has(o))
            .map((o) => (
              <li>{opLink(m, o)}</li>
            ))}
        </ul>
      </>
    );
  },
});
