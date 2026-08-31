#!/usr/bin/env python3
"""Convert the canonical Forge brand images into platform icon formats.

No logo drawing or styling occurs here. Requires Pillow; ICNS conversion uses
macOS iconutil. The legacy filename is retained for existing build tooling.
Run from any working directory. --check verifies committed output content.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
BRANDING = ROOT / 'branding'
SIZES = (16, 32, 48, 64, 128, 256, 512)


def resized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def assets() -> dict[Path, Image.Image]:
    icon = Image.open(BRANDING / 'forge-app-icon.png').convert('RGBA')
    mark = Image.open(BRANDING / 'forge-mark.png').convert('RGBA')
    for source in (icon, mark):
        if source.width != source.height or source.getextrema()[3] != (0, 255):
            raise ValueError('Canonical assets must be square with a transparent exterior and an opaque mark')
    outputs = {ROOT / 'icon.png': resized(icon, 1024), ROOT / 'icon-256.png': resized(icon, 256)}
    outputs.update({ROOT / 'icons' / f'{size}x{size}.png': resized(icon, size) for size in SIZES})
    for size in (192, 512):
        outputs[BRANDING / 'exports' / f'forge-{size}.png'] = resized(icon, size)
    outputs[BRANDING / 'exports' / 'tray.png'] = resized(mark, 18)
    # macOS template images require monochrome color; preserve the original alpha silhouette.
    for suffix, size in (('', 18), ('@2x', 36)):
        template = Image.new('RGBA', (size, size), (0, 0, 0, 255))
        template.putalpha(resized(mark, size).getchannel('A'))
        outputs[BRANDING / 'exports' / f'trayTemplate{suffix}.png'] = template
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    arguments = parser.parse_args()
    outputs = assets()
    if arguments.check:
        for target, expected in outputs.items():
            actual = Image.open(target).convert('RGBA')
            if actual.size != expected.size or actual.tobytes() != expected.tobytes():
                raise ValueError(f'Icon is out of date: {target.relative_to(ROOT)}')
        ico = Image.open(ROOT / 'icon.ico')
        if ico.ico.sizes() != {(size, size) for size in (16, 24, 32, 48, 64, 128, 256)}:
            raise ValueError('Windows ICO does not contain the required sizes')
        actual = ico.ico.getimage((256, 256)).convert('RGBA')
        if actual.tobytes() != outputs[ROOT / 'icon-256.png'].tobytes():
            raise ValueError('Windows ICO differs from the canonical icon')
        icns = Image.open(ROOT / 'icon.icns').convert('RGBA')
        if icns.tobytes() != outputs[ROOT / 'icon.png'].tobytes():
            raise ValueError('macOS ICNS differs from the canonical icon')
        print(f'PASS: {len(outputs)} PNG assets, ICO sizes/content and ICNS content match canonical Forge images')
        return
    for target, image in outputs.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target)
    icon = Image.open(BRANDING / 'forge-app-icon.png').convert('RGBA')
    resized(icon, 256).save(ROOT / 'icon.ico', format='ICO', sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)])
    if sys.platform != 'darwin':
        raise RuntimeError('PNG/ICO generated; ICNS regeneration requires macOS iconutil')
    with tempfile.TemporaryDirectory(prefix='forge-icon-format-') as temporary:
        iconset = Path(temporary) / 'Forge.iconset'
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            resized(icon, size).save(iconset / f'icon_{size}x{size}.png')
            resized(icon, size * 2).save(iconset / f'icon_{size}x{size}@2x.png')
        subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(ROOT / 'icon.icns')], check=True)
    manifest = {
        'brand': 'Forge', 'createdAt': '2026-09-28', 'generation': 'built-in imagegen',
        'sourceAssets': {file.name: {'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'size': list(Image.open(file).size)} for file in (BRANDING / 'forge-mark.png', BRANDING / 'forge-app-icon.png')},
        'conversion': 'Pillow resize/format conversion; iconutil ICNS; template tray preserves mark alpha',
        'outputs': [str(target.relative_to(ROOT)) for target in outputs] + ['icon.ico', 'icon.icns'],
    }
    (BRANDING / 'assets.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(f'Generated {len(outputs)} PNG assets, ICO and ICNS from canonical Forge images')


if __name__ == '__main__':
    main()
