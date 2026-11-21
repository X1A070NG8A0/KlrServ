// A section of a chapter: a child page of pagedef/book/chNN/index.yaml.
import { list, number, optional, template, text } from "ggass";
import { nn } from "../lib/model.ts";
import { summary } from "./lib/fields.ts";
import { chapterHref, H, hasParts, join, Needs, opLink, Parts, Sections, SummaryP, ToolsBox } from "./lib/render.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: {
    // The pages of the section in the Clymer PDF, first and last.
    pdf_pages: optional(list(number())),
    summary: optional(list(summary)),
    // The procedures of the section. A procedure with this section in its
    // `section` key joins the list too.
    ops: optional(list(text())),
  },
  render: (page, site) => {
    const m = siteModel(site);
    const c = m.book.find((x) => x.sections.some((s) => s.url === page.url))!;
    const i = c.sections.findIndex((s) => s.url === page.url);
    const s = c.sections[i];
    const prev = c.sections[i - 1];
    const next = c.sections[i + 1];
    const ops = s.ops.map((o) => m.ops.get(o)).filter((o) => !!o);
    const users = [...(m.neededBy.get(`ref:${nn(c.n)}/${s.id}`) ?? [])];
    return (
      <>
        <p class="crumb">
          <a href="/book/">Full reference</a> · <a href={chapterHref(c)}>Chapter {c.n}: {c.title}</a>
        </p>
        <h1>{s.title}</h1>
        {s.summary?.map((x) => <SummaryP m={m} s={x} />)}
        {ops.length > 1 && (
          <p class="jump">
            Procedures: {join(ops.map((o) => <a href={`#op-${o.id}`}>{o.title}</a>), " · ")}
          </p>
        )}
        {ops.map((o) => (
          <article class="op" id={`op-${o.id}`}>
            <h2>
              <a href={o.url}>{o.title}</a>
            </h2>
            {o.summary && <SummaryP m={m} s={o.summary} />}
            <Needs m={m} op={o} />
            {hasParts(m, o) && (
              <section class="box">
                <H level={3}>Parts and materials</H>
                <Parts m={m} parts={o.parts!} src={o.source} />
              </section>
            )}
            <ToolsBox m={m} op={o} />
            <Sections m={m} secs={o.sections} src={o.source} chapter={o.chapter} />
          </article>
        ))}
        {users.length > 0 && (
          <p class="needs">
            <span class="lbl">Other procedures need this section:</span> {join(users.map((u) => opLink(m, u)), " ")}
          </p>
        )}
        <p class="pager">
          {prev && <a href={prev.url} rel="prev">{prev.title}</a>} <a href={chapterHref(c)}>Chapter {c.n}</a> {next && <a href={next.url} rel="next">{next.title}</a>}
        </p>
      </>
    );
  },
});
