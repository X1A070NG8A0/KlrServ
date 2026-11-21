"""Save klr650.net threads listed in doc/community/threads.yaml as pagedefs.

Each thread becomes pagedef/threads/<slug>.yaml, a page of the site: the
title, the canonical URL (`link`), the fetch date and the number of forum
pages, then each post as a child page under `pages`. A post has the number
that the forum gives it (`id`), author, date, permalink, text and image URLs.
Quoted replies are kept as "> " lines, so it is clear who said what. Image
URLs are listed for each post, so a demonstration photo can be traced to its
author. The text stays plain text: the site keeps its line breaks.

Usage: .venv/Scripts/python.exe -I scripts/save_forum_threads.py [slug ...]
"""
import datetime as dt
import re
import sys
import time
import urllib.request
from pathlib import Path

import yaml
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
LIST = ROOT / "doc" / "community" / "threads.yaml"
OUT = ROOT / "pagedef" / "threads"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) klrmanual-personal-archive"


def fetch(url: str) -> BeautifulSoup:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", errors="replace")
    time.sleep(1.0)  # be polite
    return BeautifulSoup(html, "html.parser")


def block_text(node: Tag) -> str:
    """Flatten a post body to Markdown-ish text, keeping quotes and line breaks."""
    out: list[str] = []

    def walk(n) -> None:
        if isinstance(n, NavigableString):
            out.append(str(n))
            return
        if not isinstance(n, Tag):
            return
        if n.name == "br":
            out.append("\n")
            return
        if "bbcode_container" in (n.get("class") or []) or n.name == "blockquote":
            who = n.select_one(".bbcode_postedby strong, .b-bbcode-user strong")
            body = n.select_one(".message, .quote_container, .b-bbcode__message") or n
            inner = block_text(body).strip()
            prefix = f"{who.get_text(strip=True)} wrote: " if who else ""
            quoted = "\n".join("> " + line for line in (prefix + inner).splitlines())
            out.append("\n" + quoted + "\n\n")
            return
        if n.name == "img":
            return
        if n.name in ("p", "div", "li"):
            for c in n.children:
                walk(c)
            out.append("\n")
            return
        for c in n.children:
            walk(c)

    walk(node)
    text = "".join(out).replace("\r", "")
    text = re.sub(r"[ \t\xa0]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def parse_posts(soup: BeautifulSoup) -> list[dict]:
    posts = []
    for li in soup.select("li.b-post"):
        body = li.select_one(".js-post__content-text")
        if body is None:
            continue
        count = li.select_one(".b-post__count")
        num = re.sub(r"\D", "", count.get_text()) if count else ""
        author = li.select_one("[itemprop=author] [itemprop=name]") or li.select_one("[itemprop=author]")
        when = li.select_one("[itemprop=dateCreated]")
        images = [i.get("src") or i.get("data-src") for i in body.select("img")]
        posts.append(
            {
                "n": int(num) if num else None,
                "author": author.get_text(" ", strip=True) if author else "",
                "date": when.get("datetime") if when else "",
                "permalink": count.get("href") if count else "",
                "text": block_text(body),
                "images": [i for i in images if i and "smilies" not in i],
            }
        )
    return posts


def save(slug: str, url: str) -> None:
    first = fetch(url)
    canon_tag = first.find("link", rel="canonical")
    canon = canon_tag["href"] if canon_tag else url
    title = first.title.get_text(" ", strip=True).split(" - ")[0] if first.title else slug
    # The pager renders page links as ".../pageN"; the highest N is the page count.
    page_nums = [int(m) for m in re.findall(r"/page(\d+)", str(first.select_one(".js-pagenav") or ""))]
    pages = max(page_nums, default=1)
    posts = parse_posts(first)
    for n in range(2, pages + 1):
        posts += parse_posts(fetch(f"{canon}/page{n}"))

    children = []
    for k, p in enumerate(posts, start=1):
        n = p["n"] if p["n"] is not None else k
        post = {"id": n, "title": f"{title}: post {n}", "kind": "Forum post"}
        if p["author"]:
            post["author"] = p["author"]
        if p["date"]:
            post["date"] = p["date"][:10]
        post["permalink"] = p["permalink"]
        post["text"] = p["text"] or "_(no text)_"
        if p["images"]:
            post["images"] = p["images"]
        children.append(post)
    page = {"title": title, "link": canon, "fetched": dt.date.today().isoformat(), "forum_pages": pages, "pages": children}
    text = yaml.dump(page, Dumper=PagedefDumper, sort_keys=False, allow_unicode=True, width=float("inf"))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{slug}.yaml").write_text(HEADER + text, encoding="utf-8", newline="\n")
    print(f"{slug}: {len(posts)} posts over {pages} page(s)")


HEADER = "# Saved from klr650.net by scripts/save_forum_threads.py. Each post is a child page.\n"


class PagedefDumper(yaml.SafeDumper):
    """The YAML style of the other pagedefs: lists indented under their key,
    and text with line breaks as a literal block."""

    def increase_indent(self, flow: bool = False, indentless: bool = False) -> None:
        return super().increase_indent(flow, False)


def _text(dumper: yaml.SafeDumper, s: str) -> yaml.ScalarNode:
    return dumper.represent_scalar("tag:yaml.org,2002:str", s, style="|" if "\n" in s else None)


PagedefDumper.add_representer(str, _text)


def main(only: list[str]) -> None:
    threads = yaml.safe_load(LIST.read_text(encoding="utf-8"))
    for slug, url in threads.items():
        if only and slug not in only:
            continue
        try:
            save(slug, url)
        except Exception as e:  # keep going; report the failure
            print(f"{slug}: FAILED {e}")


if __name__ == "__main__":
    main(sys.argv[1:])
