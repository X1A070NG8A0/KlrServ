// The tool list: each tool that a procedure names, by group, with the procedures that use it.
import { html, template } from "ggass";
import { FilterBox, lower, opLink, SubNotes, Variants } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";
import { KAW, tools } from "./lib/tools.ts";

export default template({
  fields: { intro: html() },
  render: (page, site) => {
    const m = siteModel(site);
    const { groups, index } = tools(m);
    return (
      <>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        <FilterBox items="ul.toollist > li" label="Filter the tools" placeholder="for example micrometer, fork, tire" />
        {groups.map((g) => {
          const list = [...index.values()].filter((t) => t.group === g).sort((a, b) => b.ops.length - a.ops.length || a.name.localeCompare(b.name));
          if (!list.length) return null;
          return (
            <section>
              <h2>{g}</h2>
              <check-list>
                <ul class="checklist toollist">
                  {list.map((t) => (
                    <li id={`tool-${t.id}`} data-search={lower(`${t.name} ${t.ops.map((o) => o.title).join(" ")}`)}>
                      <label>
                        <input type="checkbox" data-done-key={`tool:${t.id}`} aria-label={`I have: ${t.name}`} /> <span class="name">{t.name}</span>
                      </label>{" "}
                      <span class="meta">
                        {t.ops.length} procedure{t.ops.length === 1 ? "" : "s"}
                      </span>
                      {g === KAW && <p class="meta">{t.why[0]}</p>}
                      <Variants m={m} variants={t.variants} fold={4} />
                      <SubNotes m={m} kind="tool" name={t.id} />
                      <details>
                        <summary>Used in</summary>
                        <ul>
                          {t.ops.map((o) => (
                            <li>{opLink(m, o.id)}</li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </check-list>
            </section>
          );
        })}
      </>
    );
  },
});
