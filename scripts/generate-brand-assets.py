#!/usr/bin/env python3
"""Makes the app's icons from the mark in assets/brand/icon.svg.

Only needed when the mark changes. It needs Python with Pillow, PyGObject, pycairo and librsvg
(on Fedora: sudo dnf install python3-pillow python3-gobject python3-cairo librsvg2).

    python3 scripts/generate-brand-assets.py
"""
import io
from pathlib import Path

import cairo
import gi
from PIL import Image, ImageDraw

gi.require_version("Rsvg", "2.0")
from gi.repository import Rsvg  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
NAVY = "#0B1F33"
LIGHT = (ROOT / "assets/brand/icon.svg").read_text()
# The mark's body is navy, which can't be seen on navy: on dark backgrounds its dark colours are
# light ones, and its shape stays as it is
DARK = LIGHT.replace("#0B3559", "#9AE8E8").replace(NAVY, "#E6F9FA")


def mark(svg, size=1024):
    """The mark alone, without the margins of its SVG."""
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    viewport = Rsvg.Rectangle()
    viewport.x = viewport.y = 0
    viewport.width = viewport.height = size
    Rsvg.Handle.new_from_data(svg.encode()).render_document(cairo.Context(surface), viewport)
    output = io.BytesIO()
    surface.write_to_png(output)
    image = Image.open(output).convert("RGBA")
    return image.crop(image.getbbox())


def centered(image, size, fraction, background=None):
    """The mark in the middle of a square, as wide (or high) as that fraction of it."""
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    fitted = image.copy()
    fitted.thumbnail((round(size * fraction), round(size * fraction)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


def tile(image, size):
    """The mark on a navy square with round corners: the icon of the app and of its window."""
    canvas = centered(image, size, 0.70, NAVY)
    mask = Image.new("L", (size * 4, size * 4))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=size * 4 * 0.22, fill=255)
    canvas.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
    return canvas


light, dark = mark(LIGHT), mark(DARK)
for image, path in (
    # The icon in the applications menu and of notifications (desktop/install.sh, desktop/serve.py)
    (tile(dark, 512), "assets/icon.png"),
    (tile(dark, 192), "assets/favicon.png"),
    (centered(light, 512, 1), "assets/splash.png"),
    (centered(dark, 512, 1), "assets/splash-dark.png"),
    # The logo in the app, on the light and the dark theme
    (centered(light, 192, 1), "src/images/icon.png"),
    (centered(dark, 192, 1), "src/images/icon-dark.png"),
):
    image.save(ROOT / path, optimize=True)
    print(path)
