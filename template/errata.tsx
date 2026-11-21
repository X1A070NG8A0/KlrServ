// The errata: owner reports, source disagreements and values that no source gives.
import { html, template, type Html } from "ggass";
import { FilterBox, lower, opLink, supplementCite } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: { intro: html() },
  render: (page, site) => {
    const m = siteModel(site);
    const conflicts: Html[] = [];
    const gaps: Html[] = [];
    for (const op of m.ops.values())
      for (const sec of op.sections)
        for (const st of sec.steps) {
          const item = (body: Html) => (
            <li data-search={lower(`${op.title} ${st.t} ${String(body).replace(/<[^>]+>/g, "")}`)}>
              {opLink(m, op.id)}
              <p>{st.t}</p>
              {body}
            </li>
          );
          const c = st.conflict;
          if (c)
            conflicts.push(
              item(
                <>
                  <p class="conflict-note">
                    {c.agrees ? "Other sources agree." : "Sources disagree."} {c.note}
                  </p>
                  <div class="parallel">
                    {c.others.map((o) => (
                      <blockquote>
                        {o.t} {supplementCite(m, o.cite, op.source)}
                      </blockquote>
                    ))}
                  </div>
                </>,
              ),
            );
          if (st.gap) gaps.push(item(<p class="gap">{st.gap}</p>));
        }
    return (
      <>
        <p class="crumb">
          <a href="/book/">Full reference</a>
        </p>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        <FilterBox items=".errata > li" label="Filter the errata" placeholder="for example snap ring, torque, thermostat" />
        <h2>Owner reports from klr650.net</h2>
        <ul class="errata">
          {[...m.issues.values()].map((i) => (
            <li data-search={lower(`${i.title} ${i.summary.map((s) => s.t).join(" ")}`)}>
              <a href={i.url}>{i.title}</a>
              <p class="meta">{i.summary[0]?.t ?? ""}</p>
            </li>
          ))}
        </ul>
        <h2>Source disagreements ({conflicts.length})</h2>
        <ul class="errata">{conflicts}</ul>
        <h2>Values that the sources do not give ({gaps.length})</h2>
        <ul class="errata">{gaps}</ul>
      </>
    );
  },
});
