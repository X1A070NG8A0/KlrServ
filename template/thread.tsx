// A saved klr650.net thread: pagedef/threads/<slug>.yaml. Each post is a child page.
import { children, number, optional, template, text } from "ggass";
import { PostBody, postHeading, type PostPage } from "./lib/posts.tsx";

export default template({
  fields: {
    // The address of the thread on klr650.net.
    link: text(),
    fetched: text(),
    // The number of forum pages that the thread had when it was saved.
    forum_pages: optional(number()),
    pages: children("post"),
  },
  render: (page) => (
    <>
      <p class="crumb">
        <a href="/book/errata.html">Errata</a>
      </p>
      <h1>{page.title}</h1>
      <p class="meta">
        Saved from{" "}
        <a href={page.link} rel="noreferrer">
          klr650.net
        </a>{" "}
        on {page.fetched}.
      </p>
      {(page.pages ?? []).map((p) => (
        <article class="post" id={`post-${p.id}`}>
          <h3 data-notoc>{postHeading(p as unknown as PostPage)}</h3>
          <PostBody post={p as unknown as PostPage} />
        </article>
      ))}
    </>
  ),
});
