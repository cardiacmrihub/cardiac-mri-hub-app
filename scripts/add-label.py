#!/usr/bin/env python3
"""Add the "Cardiac MRI Hub" label to the bottom left of a picture, matching the site's Canva template.

Every picture that goes on the site gets this label (the owner's rule, Nov 2026). For a cine, label every frame
before encoding.

    python3 scripts/add-label.py picture.webp [out.webp]     # writes over the picture when no out is given

Recipe, as a share of the image width: a white box at 19% opacity, flush left, 25.25% wide and 3.6% tall,
0.25% above the bottom edge; "Cardiac MRI Hub" in Montserrat weight 650, colour RGB 12,12,18, 24.1% wide,
0.2% in from the left, its top 0.45% below the box top.

Needs Pillow and the Montserrat variable font (SIL Open Font License), e.g.
    curl -L -o ~/fonts/Montserrat.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf"
Set MONTSERRAT to another path if it's elsewhere. WebP output is quality 82, as for the site's other pictures.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

FONT = os.environ.get("MONTSERRAT", os.path.expanduser("~/fonts/Montserrat.ttf"))
TEXT = "Cardiac MRI Hub"

def font_for(width_px):
    lo, hi = 4, 400
    while lo < hi:  # the largest size whose ink is no wider than width_px
        mid = (lo + hi + 1) // 2
        f = ImageFont.truetype(FONT, mid); f.set_variation_by_axes([650])
        l, t, r, b = f.getbbox(TEXT)
        lo, hi = (mid, hi) if r - l <= width_px else (lo, mid - 1)
    f = ImageFont.truetype(FONT, lo); f.set_variation_by_axes([650])
    return f

def add_label(im):
    im = im.convert("RGB")
    W, H = im.size
    box_w, box_h = round(0.2525 * W), round(0.036 * W)
    box_bottom = H - round(0.0025 * W)
    box_top = box_bottom - box_h
    over = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    d.rectangle([0, box_top, box_w - 1, box_bottom - 1], fill=(255, 255, 255, round(0.19 * 255)))
    f = font_for(0.241 * W)
    l, t, r, b = f.getbbox(TEXT)
    d.text((round(0.002 * W) - l, box_top + round(0.0045 * W) - t), TEXT, font=f, fill=(12, 12, 18, 255))
    return Image.alpha_composite(im.convert("RGBA"), over).convert("RGB")

if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) == 3 else src
    im = add_label(Image.open(src))
    im.save(out, "WEBP", quality=82, method=6) if out.lower().endswith(".webp") else im.save(out)
    print(f"labelled {out} ({im.width}x{im.height})")
