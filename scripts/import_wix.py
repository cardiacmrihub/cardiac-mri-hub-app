#!/usr/bin/env python3
"""One-time import of Cardiac MRI Hub blog posts from Wix into this app.

Writes one Markdown guide per post into content/guides/ and downloads every
image into content/images/. After this runs, the app no longer needs Wix.

Usage (from the project folder):
  python3 scripts/import_wix.py                     # fetch everything live
  python3 scripts/import_wix.py --html-dir DIR      # use saved post pages (DIR/<wix-slug>.html)
                                                    #   images are taken from DIR/images/ when present,
                                                    #   otherwise downloaded live; any that can't be fetched
                                                    #   are listed in content/import/missing-images.txt
  python3 scripts/import_wix.py --dump DIR          # also save each post's raw content JSON for checking

Only the Python standard library is used.
"""
import argparse
import html
import json
import os
import re
import sys
import urllib.request
from datetime import datetime
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDES = os.path.join(ROOT, "content", "guides")
IMAGES = os.path.join(ROOT, "content", "images")
MAP_FILE = os.path.join(ROOT, "content", "import", "wix-posts.json")
MEDIA_BASE = "https://static.wixstatic.com/media/"
UA = "CardiacMRIHub-import/1.0 (one-time migration of the site's own posts)"

log = lambda *a: print(*a, file=sys.stderr)


# ------------------------------------------------------------------ fetching
def http_get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en"})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


# ------------------------------------------------------------------ finding the post data in the page
def json_scripts(page):
    """Every JSON blob embedded in <script> tags."""
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", page, re.S | re.I):
        attrs, body = m.group(1), m.group(2).strip()
        if not body or body[0] not in "{[":
            continue
        if "json" not in attrs.lower() and not body.startswith("{"):
            continue
        try:
            yield json.loads(body)
        except Exception:
            continue


def walk(obj, depth=0):
    if depth > 60:
        return
    yield obj
    if isinstance(obj, dict):
        for v in obj.values():
            yield from walk(v, depth + 1)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v, depth + 1)


RICOS_TYPES = {"PARAGRAPH", "HEADING", "IMAGE", "BULLETED_LIST", "ORDERED_LIST", "GALLERY", "TABLE", "BLOCKQUOTE", "VIDEO", "DIVIDER", "CODE_BLOCK", "COLLAPSIBLE_LIST"}


def maybe_json_string(v):
    if isinstance(v, str) and len(v) > 50 and v.lstrip()[:1] in "{[":
        try:
            return json.loads(v)
        except Exception:
            return None
    return None


def find_content(page):
    """Return ('ricos', doc) or ('draft', doc) for the biggest rich-content document in the page, plus post metadata."""
    best, best_size, meta = None, 0, {}
    for blob in json_scripts(page):
        for node in walk(blob):
            if not isinstance(node, dict):
                continue
            for v in list(node.values()):
                parsed = maybe_json_string(v)
                if parsed is not None:
                    for sub in walk(parsed):
                        best, best_size = consider(sub, best, best_size)
            best, best_size = consider(node, best, best_size)
            # Post metadata (title / dates / cover) lives on the post object.
            if "slug" in node and "title" in node and isinstance(node.get("title"), str) and (
                "firstPublishedDate" in node or "content" in node or "richContent" in node or "coverImage" in node or "media" in node
            ):
                if len(json.dumps(node)) > len(json.dumps(meta)) if meta else True:
                    meta = node
    return best, meta


def consider(node, best, best_size):
    if not isinstance(node, dict):
        return best, best_size
    nodes = node.get("nodes")
    if isinstance(nodes, list) and nodes and all(isinstance(n, dict) and "type" in n for n in nodes[:5]):
        if any(n.get("type") in RICOS_TYPES for n in nodes):
            size = len(json.dumps(node))
            if size > best_size:
                return ("ricos", node), size
    blocks = node.get("blocks")
    if isinstance(blocks, list) and blocks and isinstance(node.get("entityMap"), dict) and all(isinstance(b, dict) and "text" in b for b in blocks[:5]):
        size = len(json.dumps(node))
        if size > best_size:
            return ("draft", node), size
    return best, best_size


# ------------------------------------------------------------------ images
class Images:
    def __init__(self, local_dir=None):
        self.local_dir = local_dir
        self.missing = []
        self.wanted = []
        os.makedirs(IMAGES, exist_ok=True)

    @staticmethod
    def media_id(src):
        """Normalize any Wix image reference to its media id, e.g. 51892d_abc~mv2.png"""
        if not src:
            return None
        s = src
        m = re.match(r"wix:image://v1/([^/#]+)", s)
        if m:
            return m.group(1)
        m = re.search(r"static\.wixstatic\.com/media/([^/?#]+)", s)
        if m:
            return m.group(1)
        if re.match(r"^[0-9a-f]{6}_[0-9a-f]{32}", s) or "~mv2" in s:
            return s.split("/")[0]
        return None

    def get(self, src):
        """Return the app-relative path for an image, downloading it if needed."""
        mid = self.media_id(src)
        if not mid:
            if src and src.startswith("http"):
                return src  # external image: left as a link
            return None
        fname = re.sub(r"[^A-Za-z0-9._-]", "-", mid)
        if "." not in fname:
            fname += ".jpg"
        webp = os.path.splitext(fname)[0] + ".webp"
        if os.path.exists(os.path.join(IMAGES, webp)):  # already shrunk by optimize_images.py
            return f"../images/{webp}"
        dest = os.path.join(IMAGES, fname)
        url = MEDIA_BASE + mid
        self.wanted.append((url, fname))
        if not os.path.exists(dest):
            ok = False
            if self.local_dir:
                for cand in (fname, mid):
                    p = os.path.join(self.local_dir, cand)
                    if os.path.exists(p):
                        with open(p, "rb") as fi, open(dest, "wb") as fo:
                            fo.write(fi.read())
                        ok = True
                        break
            if not ok:
                try:
                    data = http_get(url, binary=True)
                    with open(dest, "wb") as fo:
                        fo.write(data)
                    ok = True
                except Exception as e:
                    self.missing.append((url, fname, str(e)))
        return f"../images/{fname}"


# ------------------------------------------------------------------ Ricos → Markdown
MD_ESC = re.compile(r"([\\`*_\[\]])")


def esc_md(t):
    return MD_ESC.sub(r"\\\1", t)


def text_runs(nodes):
    out = []
    for n in nodes or []:
        t = n.get("type")
        if t == "TEXT":
            td = n.get("textData", {})
            txt = td.get("text", "")
            if not txt:
                continue
            decos = td.get("decorations", []) or []
            types = {d.get("type") for d in decos}
            lead = len(txt) - len(txt.lstrip())
            trail = len(txt) - len(txt.rstrip())
            core = esc_md(txt.strip()).replace("\n", "  \n")
            if core:
                if "BOLD" in types or any(d.get("type") == "FONT_WEIGHT" and (d.get("fontWeightValue") or 0) >= 600 for d in decos):
                    core = f"**{core}**"
                if "ITALIC" in types:
                    core = f"*{core}*"
                link = next((d for d in decos if d.get("type") == "LINK"), None)
                if link:
                    url = (link.get("linkData", {}).get("link", {}) or {}).get("url") or ""
                    if url:
                        core = f"[{core}]({url})"
                    else:
                        anchor = (link.get("linkData", {}).get("link", {}) or {}).get("anchor")
                        if anchor:
                            core = core  # in-page anchors aren't carried over
            out.append(" " * min(lead, 1) + core + " " * min(trail, 1))
        elif t in ("MENTION",):
            out.append(esc_md(n.get("mentionData", {}).get("name", "")))
        elif n.get("nodes"):
            out.append(text_runs(n["nodes"]))
    s = "".join(out)
    s = s.replace("****", "")  # adjacent bold runs
    return s


def ricos_to_md(doc, images):
    lines = []

    def block(n, indent=""):
        t = n.get("type")
        kids = n.get("nodes", []) or []
        if t == "PARAGRAPH":
            s = text_runs(kids).strip()
            if s:
                lines.append(indent + s)
                lines.append("")
        elif t == "HEADING":
            s = text_runs(kids).strip()
            if s:
                level = (n.get("headingData", {}) or {}).get("level", 2)
                lines.append("#" * max(1, min(5, level - 1)) + " " + s)
                lines.append("")
        elif t in ("BULLETED_LIST", "ORDERED_LIST"):
            num = 1
            for li in kids:
                marker = f"{num}." if t == "ORDERED_LIST" else "-"
                first = True
                for c in li.get("nodes", []) or []:
                    if c.get("type") in ("PARAGRAPH", "HEADING"):
                        s = text_runs(c.get("nodes", [])).strip()
                        if not s:
                            continue
                        if first:
                            lines.append(f"{indent}{marker} {s}")
                            first = False
                        else:
                            lines.append(f"{indent}   {s}")
                    elif c.get("type") in ("BULLETED_LIST", "ORDERED_LIST"):
                        if lines and lines[-1] == "":
                            lines.pop()
                        block(c, indent + "   ")
                        if lines and lines[-1] == "":
                            lines.pop()
                    else:
                        block(c, indent + "   ")
                num += 1
            lines.append("")
        elif t == "BLOCKQUOTE":
            for c in kids:
                s = text_runs(c.get("nodes", [])).strip()
                if s:
                    lines.append("> " + s)
            lines.append("")
        elif t == "CODE_BLOCK":
            lines.append("```")
            lines.append("".join(k.get("textData", {}).get("text", "") for k in kids))
            lines.append("```")
            lines.append("")
        elif t == "DIVIDER":
            lines.append("---")
            lines.append("")
        elif t == "IMAGE":
            d = n.get("imageData", {}) or {}
            img = d.get("image", {}) or {}
            src = (img.get("src", {}) or {})
            path = images.get(src.get("id") or src.get("url"))
            cap = ""
            for c in kids:
                if c.get("type") == "CAPTION":
                    cap = text_runs(c.get("nodes", [])).strip()
            cap = cap or d.get("caption", "") or ""
            alt = d.get("altText") or cap or ""
            if path:
                lines.append(f"![{alt.replace(']', '')}]({path}" + (f' "{cap.replace(chr(34), chr(39))}"' if cap else "") + ")")
                lines.append("")
        elif t == "GALLERY":
            for it in (n.get("galleryData", {}) or {}).get("items", []) or []:
                media = ((it.get("image", {}) or {}).get("media", {}) or {})
                src = media.get("src", {}) or {}
                path = images.get(src.get("id") or src.get("url"))
                title = it.get("title") or it.get("altText") or ""
                if path:
                    lines.append(f"![{title}]({path}" + (f' "{title}"' if title else "") + ")")
                    lines.append("")
        elif t == "VIDEO":
            v = ((n.get("videoData", {}) or {}).get("video", {}) or {}).get("src", {}) or {}
            url = v.get("url") or (("https://video.wixstatic.com/" + v["id"]) if v.get("id") else "")
            if url:
                lines.append(f"[Watch the video]({url})")
                lines.append("")
                log(f"    note: video kept as a link: {url}")
        elif t == "TABLE":
            rows = []
            for r in kids:
                rows.append([" ".join(text_runs(p.get("nodes", [])).strip() for p in (cell.get("nodes", []) or [])).replace("|", "/") for cell in (r.get("nodes", []) or [])])
            if rows:
                w = max(len(r) for r in rows)
                rows = [r + [""] * (w - len(r)) for r in rows]
                lines.append("| " + " | ".join(rows[0]) + " |")
                lines.append("|" + "---|" * w)
                for r in rows[1:]:
                    lines.append("| " + " | ".join(r) + " |")
                lines.append("")
        elif t == "COLLAPSIBLE_LIST":
            for item in kids:
                title, body = "", []
                for part in item.get("nodes", []) or []:
                    sub = []
                    for c in part.get("nodes", []) or []:
                        s = text_runs(c.get("nodes", [])).strip()
                        if s:
                            sub.append(s)
                    if part.get("type") == "COLLAPSIBLE_ITEM_TITLE":
                        title = " ".join(sub)
                    else:
                        body += sub
                lines.append(f"### {title}")
                lines.append("")
                for s in body:
                    lines.append(s)
                    lines.append("")
        elif t == "BUTTON":
            d = n.get("buttonData", {}) or {}
            url = ((d.get("link", {}) or {}).get("url")) or ""
            if url:
                lines.append(f"[{d.get('text') or url}]({url})")
                lines.append("")
        elif t in ("LINK_PREVIEW", "EMBED"):
            d = n.get("linkPreviewData") or n.get("embedData") or {}
            url = ((d.get("link", {}) or {}).get("url")) or d.get("url") or ""
            title = d.get("title") or url
            if url:
                lines.append(f"[{title}]({url})")
                lines.append("")
        elif t == "HTML":
            url = (n.get("htmlData", {}) or {}).get("url")
            if url:
                lines.append(f"[Embedded content]({url})")
                lines.append("")
            else:
                log("    note: an embedded HTML block was skipped")
        elif kids:
            for c in kids:
                block(c, indent)

    for n in doc.get("nodes", []):
        block(n)
    return tidy("\n".join(lines))


# ------------------------------------------------------------------ Draft.js → Markdown (older Wix blog format)
def draft_to_md(doc, images):
    ents = doc.get("entityMap", {})
    lines = []
    num = 0
    for b in doc.get("blocks", []):
        t, text = b.get("type", "unstyled"), b.get("text", "")
        # inline styles
        marks = [""] * (len(text) + 1)
        for r in b.get("inlineStyleRanges", []) or []:
            o, l, s = r.get("offset", 0), r.get("length", 0), r.get("style", "")
            tag = "**" if s == "BOLD" else "*" if s == "ITALIC" else ""
            if tag and l:
                marks[o] = marks[o] + tag
                marks[o + l] = tag + marks[o + l]
        for r in b.get("entityRanges", []) or []:
            e = ents.get(str(r.get("key"))) or {}
            if e.get("type") == "LINK":
                o, l = r.get("offset", 0), r.get("length", 0)
                marks[o] = marks[o] + "["
                marks[o + l] = f"]({(e.get('data') or {}).get('url', '')})" + marks[o + l]
        s = "".join(marks[i] + esc_md(ch) for i, ch in enumerate(text)) + marks[len(text)]
        s = s.strip()
        num = num + 1 if t == "ordered-list-item" else 0
        if t == "atomic":
            for r in b.get("entityRanges", []) or []:
                e = ents.get(str(r.get("key"))) or {}
                data = e.get("data") or {}
                src = data.get("src") or {}
                ref = src.get("file_name") or src.get("id") or src.get("url") if isinstance(src, dict) else src
                path = images.get(ref)
                cap = (data.get("metadata") or {}).get("caption") or ""
                if path:
                    lines += [f"![{cap}]({path}" + (f' "{cap}"' if cap else "") + ")", ""]
        elif not s:
            continue
        elif t.startswith("header-"):
            lvl = {"header-one": 1, "header-two": 1, "header-three": 2, "header-four": 3}.get(t, 2)
            lines += ["#" * lvl + " " + s, ""]
        elif t == "unordered-list-item":
            lines.append("- " + s)
        elif t == "ordered-list-item":
            lines.append(f"{num}. " + s)
        elif t == "blockquote":
            lines += ["> " + s, ""]
        else:
            lines += [s, ""]
        if t not in ("unordered-list-item", "ordered-list-item") and lines and lines[-1] != "":
            lines.append("")
    return tidy("\n".join(lines))


def tidy(md):
    md = re.sub(r"\n{3,}", "\n\n", md)
    # a list followed directly by a paragraph needs a blank line
    md = re.sub(r"(\n(?:-|\d+\.) [^\n]+)\n(?!(?:\s*-|\s*\d+\.|\s{3}|\n))", r"\1\n\n", md)
    return md.strip() + "\n"


# ------------------------------------------------------------------ HTML fallback
class Node:
    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []


VOID = {"br", "img", "hr", "meta", "link", "input", "source", "wbr"}


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", [])
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_endtag(self, tag):
        p = self.cur
        while p is not self.root and p.tag != tag:
            p = p.parent
        if p is not self.root:
            self.cur = p.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def count(node, tag):
    return sum((1 if isinstance(c, Node) and c.tag == tag else 0) + (count(c, tag) if isinstance(c, Node) else 0) for c in node.children)


def html_fallback(page, images):
    t = Tree()
    t.feed(page)
    # The article body is the element with the most paragraphs that has no single child holding most of them.
    best, best_n = None, 0
    stack = [t.root]
    while stack:
        n = stack.pop()
        for c in n.children:
            if isinstance(c, Node) and c.tag not in ("script", "style", "nav", "header", "footer"):
                stack.append(c)
        if n.tag in ("article", "div", "section", "main"):
            k = count(n, "p")
            hook = (n.attrs.get("data-hook") or "") + (n.attrs.get("data-id") or "")
            if "post-description" in hook or "content-viewer" in hook or "rich-content" in hook:
                k += 1000
            if k > best_n:
                best, best_n = n, k
    if not best:
        return ""

    def inl(n):
        out = ""
        for c in n.children:
            if isinstance(c, str):
                out += esc_md(re.sub(r"\s+", " ", c))
            elif c.tag in ("strong", "b"):
                s = inl(c).strip()
                out += f"**{s}**" if s else ""
            elif c.tag in ("em", "i"):
                s = inl(c).strip()
                out += f"*{s}*" if s else ""
            elif c.tag == "a":
                s = inl(c).strip()
                href = c.attrs.get("href", "")
                out += f"[{s}]({href})" if s and href.startswith("http") else s
            elif c.tag == "br":
                out += "  \n"
            elif c.tag not in ("script", "style", "button", "svg"):
                out += inl(c)
        return out

    lines = []

    def blk(n, indent=""):
        for c in n.children:
            if isinstance(c, str):
                continue
            tag = c.tag
            if tag in ("script", "style", "button", "svg", "nav"):
                continue
            if re.match(r"h[1-6]$", tag):
                s = inl(c).strip()
                if s:
                    lines.extend(["#" * max(1, int(tag[1]) - 1) + " " + s, ""])
            elif tag == "p":
                s = inl(c).strip()
                if s:
                    lines.extend([indent + s, ""])
            elif tag in ("ul", "ol"):
                i = 1
                for li in c.children:
                    if isinstance(li, Node) and li.tag == "li":
                        s = inl(li).strip()
                        lines.append(f"{indent}{f'{i}.' if tag == 'ol' else '-'} {s}")
                        i += 1
                lines.append("")
            elif tag == "img":
                src = c.attrs.get("src") or c.attrs.get("data-src") or ""
                path = images.get(src)
                if path:
                    lines.extend([f"![{c.attrs.get('alt', '')}]({path})", ""])
            elif tag == "figcaption":
                s = inl(c).strip()
                if s and lines and lines[-1] == "" and lines[-2].startswith("!["):
                    lines[-2] = lines[-2][:-1] + f' "{s}")'
            elif tag == "blockquote":
                s = inl(c).strip()
                if s:
                    lines.extend(["> " + s, ""])
            elif tag == "hr":
                lines.extend(["---", ""])
            else:
                blk(c, indent)

    blk(best)
    return tidy("\n".join(lines))


# ------------------------------------------------------------------ Wix blog article HTML → Markdown
# Current Wix blog pages render the post server-side as plain HTML inside
# <section data-hook="post-description">, with no rich-content JSON in the page.
VIDEOS = os.path.join(ROOT, "content", "videos")


class Videos:
    def __init__(self, local_dir=None):
        self.local_dir = local_dir
        self.missing = []
        os.makedirs(VIDEOS, exist_ok=True)

    def get(self, url):
        m = re.search(r"video\.wixstatic\.com/video/([0-9a-f]{6}_[0-9a-f]{32})", url or "")
        if not m:
            return url or None  # not a Wix video: keep the link
        fname = m.group(1) + ".mp4"
        dest = os.path.join(VIDEOS, fname)
        if not os.path.exists(dest):
            src = os.path.join(self.local_dir, fname) if self.local_dir else None
            try:
                if src and os.path.exists(src):
                    data = open(src, "rb").read()
                else:
                    data = http_get(url, binary=True)
                with open(dest, "wb") as fo:
                    fo.write(data)
            except Exception as e:
                self.missing.append((url, fname, str(e)))
        return f"../videos/{fname}"


def article_section(page):
    """The <section data-hook="post-description"> element, balanced, or ''."""
    i = page.find('data-hook="post-description"')
    if i < 0:
        return ""
    s = page.rfind("<section", 0, i)
    depth = 0
    for m in re.finditer(r"<(/?)section\b", page[s:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return page[s:s + m.end() + 1]
    return page[s:]


def post_title(page):
    m = re.search(r'<h1[^>]*data-hook="post-title"[^>]*>(.*?)</h1>', page, re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""


SKIP_TAGS = {"script", "style", "button", "svg", "noscript", "nav"}


def ricos_html_to_md(section, images, videos, link_map):
    tree = Tree()
    tree.feed(section)

    def attr(n, k):
        return n.attrs.get(k) or ""

    def is_bold(n):
        if n.tag in ("strong", "b"):
            return True
        m = re.search(r"font-weight\s*:\s*(\d+|bold)", attr(n, "style"))
        return bool(m) and (m.group(1) == "bold" or int(m.group(1)) >= 600)

    def is_italic(n):
        return n.tag in ("em", "i") or "font-style:italic" in attr(n, "style").replace(" ", "")

    def fix_link(href, label):
        if not href:
            return ""
        m = re.search(r"cardiacmrihub\.wixsite\.com/cardiac-mri-hub/post/([^/?#]+)", href)
        if m:
            return f"/guide/{link_map[m.group(1)]}/" if m.group(1) in link_map else href
        # Wix turns measurements like "1.4-1.8mm" into links to "http://1.4-1.mm"; those aren't real links.
        host = re.sub(r"^https?://", "", href).split("/")[0]
        if re.match(r"^[\d.\-]+\.[a-z]{1,3}$", host):
            return ""
        return href

    def wrap(s, mark):
        core = s.strip()
        if not core:
            return s
        lead = " " if s[:1].isspace() else ""
        trail = " " if s[-1:].isspace() else ""
        return f"{lead}{mark}{core}{mark}{trail}"

    def inl(n, bold=False, italic=False):
        out = ""
        for c in n.children:
            if isinstance(c, str):
                out += esc_md(re.sub(r"\s+", " ", c))
                continue
            if c.tag in SKIP_TAGS:
                continue
            if c.tag == "br":
                out += "\n"
                continue
            b = is_bold(c) and not bold
            it = is_italic(c) and not italic
            s = inl(c, bold or b, italic or it)
            if c.tag == "a":
                label = s
                href = fix_link(attr(c, "href"), re.sub(r"[*\\]", "", label))
                if href and label.strip():
                    s = wrap(label, "").replace(label.strip(), f"[{label.strip()}]({href})", 1)
            if it:
                s = wrap(s, "*")
            if b:
                s = wrap(s, "**")
            out += s
        return out

    def clean(s):
        s = s.replace("****", "").replace("** **", " ")
        lines = [re.sub(r"[ \t]+", " ", l).strip() for l in s.split("\n")]
        while lines and not lines[0]:
            lines.pop(0)
        while lines and not lines[-1]:
            lines.pop()
        return "  \n".join(l for l in lines)

    def find(n, pred):
        for c in n.children:
            if isinstance(c, Node):
                if pred(c):
                    return c
                r = find(c, pred)
                if r:
                    return r
        return None

    def find_all(n, pred, acc=None):
        acc = [] if acc is None else acc
        for c in n.children:
            if isinstance(c, Node):
                if pred(c):
                    acc.append(c)
                else:
                    find_all(c, pred, acc)
        return acc

    lines = []

    def emit(*ls):
        lines.extend(ls)

    def caption_of(fig):
        cap = find(fig, lambda x: x.tag == "figcaption")
        return clean(inl(cap)).replace("  \n", " ") if cap else ""

    def list_block(n, indent):
        num = int(attr(n, "start") or 1)
        for li in n.children:
            if not (isinstance(li, Node) and li.tag == "li"):
                continue
            marker = f"{num}." if n.tag == "ol" else "-"
            pad = " " * (len(marker) + 1)
            texts, nested = [], []
            for c in li.children:
                if isinstance(c, Node) and c.tag in ("ul", "ol"):
                    nested.append(c)
                elif isinstance(c, Node):
                    t = clean(inl(c))
                    if t:
                        texts.append(t)
                elif c.strip():
                    texts.append(esc_md(c.strip()))
            body = "  \n".join(texts).replace("  \n", "  \n" + indent + pad)
            emit(f"{indent}{marker} {body}".rstrip())
            for sub in nested:
                list_block(sub, indent + pad)
            num += 1

    def table_block(n):
        rows = []
        for tr in find_all(n, lambda x: x.tag == "tr"):
            cells = [c for c in tr.children if isinstance(c, Node) and c.tag in ("td", "th")]
            rows.append([clean(inl(c)).replace("  \n", " ").replace("|", "/") for c in cells])
        if not rows:
            return
        w = max(len(r) for r in rows)
        rows = [r + [""] * (w - len(r)) for r in rows]
        emit("| " + " | ".join(rows[0]) + " |", "|" + "---|" * w)
        for r in rows[1:]:
            emit("| " + " | ".join(r) + " |")
        emit("")

    def block(n):
        for c in n.children:
            if isinstance(c, str) or c.tag in SKIP_TAGS:
                continue
            t = c.tag
            hook = attr(c, "data-hook")
            if re.match(r"h[1-6]$", t):
                s = clean(inl(c)).replace("**", "").replace("  \n", " ")
                if s:
                    emit("#" * max(1, int(t[1]) - 1) + " " + s, "")
            elif t == "p":
                s = clean(inl(c))
                # Paragraphs typed with a "•" are bullet lists; consecutive ones become one list.
                m = re.match(r"^[•●▪◦]\s*(.*)$", s, re.S)
                if m and m.group(1).strip():
                    if len(lines) >= 2 and lines[-1] == "" and re.match(r"^- ", lines[-2]):
                        lines.pop()
                    emit("- " + m.group(1).strip().replace("  \n", "  \n  "), "")
                elif re.match(r"^\d+[.)] ", s):
                    # Hand-numbered paragraphs: keep consecutive ones in one numbered list.
                    if len(lines) >= 2 and lines[-1] == "" and re.match(r"^\d+[.)] ", lines[-2]):
                        lines.pop()
                    emit(s.replace("  \n", "  \n   "), "")
                elif s:
                    emit(s, "")
            elif t in ("ul", "ol"):
                list_block(c, "")
                emit("")
            elif t == "figure" and hook == "figure-VIDEO":
                v = find(c, lambda x: x.tag in ("video", "source") and attr(x, "src"))
                cap = caption_of(c)
                if v:
                    path = videos.get(attr(v, "src"))
                    if path and path.startswith("../"):
                        emit(f'![{cap}]({path}' + (f' "{cap}"' if cap else "") + ")", "")
                    elif path:
                        emit(f"[Watch the video]({path})", "")
            elif t == "figure":
                w = find(c, lambda x: x.tag == "wow-image" and attr(x, "id"))
                img = find(c, lambda x: x.tag == "img")
                ref = attr(w, "id") if w else (attr(img, "data-pin-media") or attr(img, "src") if img else "")
                path = images.get(ref)
                cap = caption_of(c)
                alt = ((attr(img, "alt") if img else "") or cap).strip()
                if path:
                    emit(f"![{alt.replace(']', '')}]({path}" + (f' "{cap.replace(chr(34), chr(39))}"' if cap else "") + ")", "")
            elif t == "table":
                table_block(c)
            elif t == "blockquote":
                s = clean(inl(c))
                if s:
                    emit(*["> " + l for l in s.split("  \n")], "")
            elif t == "pre":
                emit("```", "".join(x if isinstance(x, str) else "" for x in c.children).rstrip(), "```", "")
            elif t == "hr" or "divider" in hook:
                emit("---", "")
            elif t == "iframe" and attr(c, "src"):
                emit(f"[Embedded content]({attr(c, 'src')})", "")
            else:
                block(c)

    block(tree.root)
    return tidy("\n".join(lines))


# ------------------------------------------------------------------ page metadata
def meta_from_page(page):
    def og(prop):
        m = re.search(r'<meta[^>]+(?:property|name)="' + re.escape(prop) + r'"[^>]+content="([^"]*)"', page)
        if not m:
            m = re.search(r'<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + re.escape(prop) + r'"', page)
        return html.unescape(m.group(1)) if m else ""

    title = og("og:title") or (re.search(r"<title>(.*?)</title>", page, re.S) or [None, ""])[1]
    title = re.sub(r"\s*\|\s*Cardiac MRI Hub\s*$", "", html.unescape(title or "")).strip()
    return {
        "title": title,
        "description": og("og:description") or og("description"),
        "seo_description": og("description"),
        "image": og("og:image"),
        "published": og("article:published_time"),
        "modified": og("article:modified_time"),
    }


def iso_date(s):
    if not s:
        return ""
    if isinstance(s, (int, float)):
        return datetime.utcfromtimestamp(s / 1000 if s > 1e11 else s).strftime("%Y-%m-%d")
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(s))
    return m.group(1) if m else ""


def yaml_str(s):
    s = (s or "").replace("\n", " ").strip()
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html-dir", help="folder of saved post pages named <wix-slug>.html")
    ap.add_argument("--dump", help="folder to save each post's raw content JSON")
    ap.add_argument("--only", help="import just this Wix slug")
    args = ap.parse_args()

    spec = json.load(open(MAP_FILE))
    site = spec["site"].rstrip("/")
    os.makedirs(GUIDES, exist_ok=True)
    images = Images(os.path.join(args.html_dir, "images") if args.html_dir else None)
    videos = Videos(os.path.join(args.html_dir, "videos") if args.html_dir else None)
    link_map = {p["wix"]: p["slug"] for p in spec["posts"]}
    if args.dump:
        os.makedirs(args.dump, exist_ok=True)

    posts = spec["posts"]
    if args.only:
        posts = [p for p in posts if p["wix"] == args.only]

    done, skipped = [], []
    for p in posts:
        wix = p["wix"]
        url = f"{site}/post/{wix}"
        log(f"- {wix}")
        try:
            if args.html_dir:
                path = os.path.join(args.html_dir, wix + ".html")
                if not os.path.exists(path):
                    raise FileNotFoundError(path)
                page = open(path, encoding="utf-8", errors="replace").read()
            else:
                page = http_get(url)
        except Exception as e:
            (log if p.get("optional") else log)(f"    skipped: page not available ({e})")
            skipped.append((wix, str(e)))
            continue

        found, post = find_content(page)
        pm = meta_from_page(page)
        section = article_section(page)
        body = ricos_html_to_md(section, images, videos, link_map) if section else ""
        if body.strip():
            how = "article HTML"
        elif found and found[0] == "ricos":
            body = ricos_to_md(found[1], images)
            how = "rich content"
        elif found and found[0] == "draft":
            body = draft_to_md(found[1], images)
            how = "draft content"
        else:
            body = html_fallback(page, images)
            how = "page HTML"
        if args.dump and found:
            json.dump(found[1], open(os.path.join(args.dump, wix + ".json"), "w"), indent=1)
        if not body.strip():
            log("    skipped: no article text found in the page")
            skipped.append((wix, "no article text found"))
            continue

        title = post_title(page) or (post.get("title") if isinstance(post, dict) else "") or pm["title"]
        published = iso_date((post or {}).get("firstPublishedDate")) or iso_date(pm["published"])
        updated = iso_date((post or {}).get("lastPublishedDate")) or iso_date(pm["modified"]) or published
        summary = pm["seo_description"] or (post or {}).get("excerpt") or pm["description"] or ""
        cover = None
        cover_src = ((((post or {}).get("media") or {}).get("wixMedia") or {}).get("image") or {}) if isinstance(post, dict) else {}
        cover_ref = cover_src.get("id") or cover_src.get("url") if isinstance(cover_src, dict) else None
        cover_ref = cover_ref or ((post or {}).get("coverImage") or {}).get("src", {}).get("id") if isinstance((post or {}).get("coverImage"), dict) else cover_ref
        cover_ref = cover_ref or pm["image"]
        if cover_ref:
            cover = images.get(cover_ref)

        fm = ["---", f"title: {yaml_str(title)}"]
        if summary:
            fm.append(f"summary: {yaml_str(summary[:300])}")
        fm.append("topics: [" + ", ".join(p.get("topics", [])) + "]")
        if published:
            fm.append(f"published: {published}")
        if updated and updated != published:
            fm.append(f"updated: {updated}")
        if cover and cover.startswith("../images/"):
            fm.append(f"cover: {cover}")
        if p.get("order") is not None:
            fm.append(f"order: {p['order']}")
        if p.get("startHere"):
            fm.append("startHere: true")
        fm.append(f"sourceUrl: {url}")
        fm.append("---")
        out = "\n".join(fm) + "\n\n" + body
        with open(os.path.join(GUIDES, p["slug"] + ".md"), "w", encoding="utf-8") as f:
            f.write(out)
        n_img = body.count("](../images/")
        n_vid = body.count("](../videos/")
        log(f"    ok: {p['slug']}.md ({how}, {len(body.split())} words, {n_img} images, {n_vid} videos)")
        done.append(p["slug"])

    miss_file = os.path.join(ROOT, "content", "import", "missing-images.txt")
    if images.missing or videos.missing:
        with open(miss_file, "w") as f:
            for url, fname, _ in images.missing + videos.missing:
                f.write(f"{url}\t{fname}\n")
    elif os.path.exists(miss_file):
        os.remove(miss_file)

    log("")
    log(f"Imported {len(done)} guide(s). Skipped {len(skipped)}.")
    for w, why in skipped:
        log(f"  skipped {w}: {why}")
    if images.missing:
        log(f"{len(images.missing)} image(s) still to download — listed in content/import/missing-images.txt")
    log("Next: node scripts/build-content.mjs")


if __name__ == "__main__":
    main()
