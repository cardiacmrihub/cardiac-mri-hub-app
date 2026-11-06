#!/usr/bin/env python3
"""Makes the picture shown when a guide's link is shared (Messages, Teams, Slack, Facebook…).

Writes content/previews/<guide>.jpg (1200×630) from the guide's cover image, or its first
large image when the cover is small, plus content/previews/site.jpg for the home page
(from content/site-preview.png when it exists).
Run it after adding guides or changing a cover, then rebuild:

  pip install pillow
  python3 scripts/make_previews.py
  node scripts/build-content.mjs
"""
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDES = os.path.join(ROOT, "content", "guides")
IMAGES = os.path.join(ROOT, "content", "images")
PREVIEWS = os.path.join(ROOT, "content", "previews")
ICON = os.path.join(ROOT, "icons", "icon-512.png")

W, H = 1200, 630
BG = (20, 28, 36)  # the app's dark theme background
MIN_WIDTH = 600    # smaller images look blurry as previews


def image_refs(md):
    cover = re.search(r"^cover:\s*\.\./images/(\S+)\s*$", md, re.M)
    refs = [cover.group(1)] if cover else []
    refs += re.findall(r"!\[[^\]]*\]\(\.\./images/([^)\s]+)", md)
    return refs


def pick(refs):
    for name in refs:
        path = os.path.join(IMAGES, name)
        if not os.path.exists(path):
            continue
        with Image.open(path) as im:
            if im.width >= MIN_WIDTH:
                return path
    return None


def compose(src, dest, scale=1.0):
    canvas = Image.new("RGB", (W, H), BG)
    with Image.open(src) as im:
        im = im.convert("RGBA")
        im.thumbnail((int(W * scale), int(H * scale)), Image.LANCZOS)
        canvas.paste(im, ((W - im.width) // 2, (H - im.height) // 2), im)
    canvas.save(dest, "JPEG", quality=84, optimize=True, progressive=True)


def main():
    os.makedirs(PREVIEWS, exist_ok=True)
    made, fallback = 0, []
    for f in sorted(os.listdir(GUIDES)):
        if not f.endswith(".md"):
            continue
        slug = f[:-3]
        src = pick(image_refs(open(os.path.join(GUIDES, f), encoding="utf-8").read()))
        if src:
            compose(src, os.path.join(PREVIEWS, slug + ".jpg"))
            made += 1
        else:
            fallback.append(slug)
    # The home page's picture: content/site-preview.png (1200 × 630) if there is one, else the app icon.
    site_art = os.path.join(ROOT, "content", "site-preview.png")
    if os.path.exists(site_art):
        compose(site_art, os.path.join(PREVIEWS, "site.jpg"))
    else:
        compose(ICON, os.path.join(PREVIEWS, "site.jpg"), scale=0.62)
    print(f"Made {made} guide preview(s) and the site preview in content/previews/.")
    if fallback:
        print("No large image for: " + ", ".join(fallback) + " (they use the site preview).")
    print("Next: node scripts/build-content.mjs")


if __name__ == "__main__":
    sys.exit(main())
