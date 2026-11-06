#!/usr/bin/env python3
"""Shrinks guide images for the app: WebP, at most 1600 px on the long side.

Planning screenshots straight from Wix are ~1 MB PNGs; as WebP they are a
fraction of that with no visible difference on a phone or tablet, which keeps
"Save everything for offline" quick. Updates the references in content/guides/*.md.

Usage (from the project folder):
  pip install pillow
  python3 scripts/optimize_images.py              # convert anything not yet WebP
  python3 scripts/optimize_images.py --max 2000   # keep more resolution
Originals are moved to content/images-original/ (not needed online).
"""
import argparse
import os
import re
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, "content", "images")
ORIGINALS = os.path.join(ROOT, "content", "images-original")
GUIDES = os.path.join(ROOT, "content", "guides")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=1600, help="longest side in pixels (default 1600)")
    ap.add_argument("--quality", type=int, default=85, help="WebP quality 1-100 (default 85)")
    args = ap.parse_args()

    os.makedirs(ORIGINALS, exist_ok=True)
    renamed, before, after = {}, 0, 0
    for name in sorted(os.listdir(IMAGES)):
        src = os.path.join(IMAGES, name)
        stem, ext = os.path.splitext(name)
        if ext.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        with Image.open(src) as im:
            im.load()
            if getattr(im, "is_animated", False):
                continue
            mode = "RGBA" if im.mode in ("RGBA", "LA", "P") and "A" in im.getbands() or im.info.get("transparency") is not None else "RGB"
            im = im.convert(mode)
            if max(im.size) > args.max:
                im.thumbnail((args.max, args.max), Image.LANCZOS)
            out = os.path.join(IMAGES, stem + ".webp")
            im.save(out, "WEBP", quality=args.quality, method=6)
        b, a = os.path.getsize(src), os.path.getsize(out)
        before += b
        after += a
        shutil.move(src, os.path.join(ORIGINALS, name))
        renamed[name] = stem + ".webp"

    if not renamed:
        print("Nothing to convert.")
        return
    pat = re.compile(r"(images/)(" + "|".join(re.escape(k) for k in renamed) + r")\b")
    for f in os.listdir(GUIDES):
        if not f.endswith(".md"):
            continue
        p = os.path.join(GUIDES, f)
        text = open(p, encoding="utf-8").read()
        new = pat.sub(lambda m: m.group(1) + renamed[m.group(2)], text)
        if new != text:
            open(p, "w", encoding="utf-8").write(new)
    print(f"Converted {len(renamed)} image(s): {before / 1e6:.1f} MB → {after / 1e6:.1f} MB. Originals are in content/images-original/.")
    print("Next: node scripts/build-content.mjs")


if __name__ == "__main__":
    sys.exit(main())
