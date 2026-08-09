#!/usr/bin/env python3
"""Generate the original Forge Glass Preview desktop icon set.

The faceted F follows Forge's own favicon geometry. The silver-blue glass
surface is drawn here from scratch; no Aperant artwork is used.

Requires Pillow and macOS iconutil. Run from any working directory.
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
SIZE = 2048
LINUX_SIZES = (16, 32, 48, 64, 128, 256, 512)


def resized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def rounded_mask(inset: int = 34) -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE))
    ImageDraw.Draw(mask).rounded_rectangle(
        (inset, inset, SIZE - inset - 1, SIZE - inset - 1),
        radius=455,
        fill=255,
    )
    return mask


def draw_icon() -> Image.Image:
    # Light glass body with a clear, dark mark that survives a 32 px downsample.
    body = Image.new("RGBA", (SIZE, SIZE))
    gradient = ImageDraw.Draw(body)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        gradient.line(
            (0, y, SIZE, y),
            fill=(
                round(242 - 81 * t),
                round(248 - 56 * t),
                round(255 - 32 * t),
                255,
            ),
        )

    light = Image.new("RGBA", (SIZE, SIZE))
    ImageDraw.Draw(light).ellipse(
        (-330, -470, 1560, 1120), fill=(255, 255, 255, 106)
    )
    body = Image.alpha_composite(body, light.filter(ImageFilter.GaussianBlur(250)))

    blue = Image.new("RGBA", (SIZE, SIZE))
    ImageDraw.Draw(blue).ellipse(
        (790, 970, 2560, 2570), fill=(62, 118, 181, 54)
    )
    body = Image.alpha_composite(body, blue.filter(ImageFilter.GaussianBlur(310)))
    body.putalpha(rounded_mask())

    rim = Image.new("RGBA", (SIZE, SIZE))
    ImageDraw.Draw(rim).rounded_rectangle(
        (46, 46, SIZE - 47, SIZE - 47),
        radius=444,
        outline=(255, 255, 255, 162),
        width=14,
    )
    body = Image.alpha_composite(body, rim)

    # The angled terminals distinguish Forge's F from a generic type glyph.
    # Coordinates are scaled from Forge's 64 x 64 favicon and enlarged for Dock.
    original = (
        (20, 45), (27, 18), (49, 18), (47, 25), (33, 25),
        (31, 31), (43, 31), (41, 38), (29, 38), (27, 45),
    )
    points = [
        (round((x - 34.5) * 39 + 1024), round((y - 31.5) * 39 + 1024))
        for x, y in original
    ]

    shadow = Image.new("RGBA", (SIZE, SIZE))
    ImageDraw.Draw(shadow).polygon(
        [(x + 14, y + 28) for x, y in points], fill=(34, 63, 94, 76)
    )
    body = Image.alpha_composite(body, shadow.filter(ImageFilter.GaussianBlur(36)))

    mark_mask = Image.new("L", (SIZE, SIZE))
    ImageDraw.Draw(mark_mask).polygon(points, fill=255)
    mark = Image.new("RGBA", (SIZE, SIZE))
    mark_draw = ImageDraw.Draw(mark)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        mark_draw.line(
            (0, y, SIZE, y),
            fill=(round(31 - 6 * t), round(72 - 25 * t), round(108 - 35 * t), 255),
        )
    mark.putalpha(mark_mask)
    return Image.alpha_composite(body, mark)


def main() -> None:
    image = draw_icon()
    resized(image, 1024).save(ROOT / "icon.png")
    resized(image, 256).save(ROOT / "icon-256.png")

    icons = ROOT / "icons"
    icons.mkdir(exist_ok=True)
    for size in LINUX_SIZES:
        resized(image, size).save(icons / f"{size}x{size}.png")

    image.save(
        ROOT / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)],
    )

    with tempfile.TemporaryDirectory(prefix="forge-preview-icon-") as tmp:
        iconset = Path(tmp) / "ForgePreview.iconset"
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            resized(image, size).save(iconset / f"icon_{size}x{size}.png")
            resized(image, size * 2).save(iconset / f"icon_{size}x{size}@2x.png")
        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(ROOT / "icon.icns")],
            check=True,
        )


if __name__ == "__main__":
    main()
