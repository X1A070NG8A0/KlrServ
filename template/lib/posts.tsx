// Forum posts, on the thread page and on the page of each post.
import { esc, raw, type Html } from "ggass";
import { join } from "./render.tsx";

export type PostPage = { id?: string; author?: string; date?: string; text: string; images?: string[] };

export const postHeading = (p: PostPage): string => [`Post ${p.id}`, p.author, p.date].filter(Boolean).join(", ");

// The text of a post, escaped, with its line breaks, and links to its images.
export const PostBody = ({ post }: { post: PostPage }): Html => (
  <>
    <div class="post-text">{raw(esc(post.text).replace(/\n/g, "<br>"))}</div>
    {post.images?.length ? (
      <p class="meta">
        Images:{" "}
        {join(
          post.images.map((u) => (
            <a href={u} rel="noreferrer">
              {u}
            </a>
          )),
          ", ",
        )}
      </p>
    ) : null}
  </>
);
