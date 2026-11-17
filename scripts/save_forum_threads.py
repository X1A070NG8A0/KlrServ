"""Save klr650.net threads listed in doc/community/threads.yaml as Markdown.

Each thread becomes doc/community/<slug>.md: a YAML header (title, canonical
URL, fetch date) followed by every post, numbered as the forum numbers them,
with author, timestamp and permalink. Quoted replies are kept as blockquotes
so it is clear who said what. Image URLs in posts are listed per post so a
demonstration photo can be traced to its author.

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
OUT = ROOT / "doc" / "community"
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
    text = "".join(out)
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
                "author": author.get_text(" ", strip=True) if author else "unknown",
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

    header = {
        "title": title,
        "url": canon,
        "fetched": dt.date.today().isoformat(),
        "pages": pages,
        "posts": len(posts),
    }
    lines = ["---", yaml.safe_dump(header, sort_keys=False, allow_unicode=True).strip(), "---", "", f"# {title}", ""]
    for p in posts:
        lines.append(f"## Post {p['n']} — {p['author']}, {p['date'][:10]}")
        lines.append(f"<{p['permalink']}>")
        lines.append("")
        lines.append(p["text"] or "_(no text)_")
        if p["images"]:
            lines.append("")
            lines.append("Images: " + ", ".join(f"<{i}>" for i in p["images"]))
        lines.append("")
    (OUT / f"{slug}.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{slug}: {len(posts)} posts over {pages} page(s)")


def main(only: list[str]) -> None:
    threads = yaml.safe_load((OUT / "threads.yaml").read_text(encoding="utf-8"))
    for slug, url in threads.items():
        if only and slug not in only:
            continue
        try:
            save(slug, url)
        except Exception as e:  # keep going; report the failure
            print(f"{slug}: FAILED {e}")


if __name__ == "__main__":
    main(sys.argv[1:])
