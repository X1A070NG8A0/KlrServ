// One forum post: a child page of pagedef/threads/<slug>.yaml, so that a
// citation can open only this post in a popup window.
import { list, optional, template, text } from "ggass";
import { PostBody, postHeading } from "./lib/posts.tsx";

export default template({
  fields: {
    author: optional(text()),
    date: optional(text()),
    // The address of the post on klr650.net.
    permalink: text(),
    // Plain text. The page keeps its line breaks.
    text: text(),
    images: optional(list(text())),
  },
  render: (page, site) => {
    const thread = site.parent(page)!;
    return (
      <>
        <p class="crumb">
          <a href={`${thread.url}#post-${page.id}`}>{thread.title}</a>
        </p>
        <h1>{postHeading(page)}</h1>
        <PostBody post={page} />
      </>
    );
  },
});
