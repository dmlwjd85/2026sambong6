"""3차 그림은 그대로 두고, 하늘만 조금 진하게 한 뒤 금빛 림과 엷은 그림자만 더한다."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path('/workspace/2026sambong6/icon-drafts/painted')
SRC = ROOT / 'v87'
OUT = ROOT / 'enhanced'
IDS = ['shop', 'quest', 'challenge', 'home', 'literature', 'chalk', 'wheel', 'rps']
DEEP = np.array([28, 100, 168], np.float32)
NAVY = np.array([27, 42, 74], np.float32)
GOLD = np.array([243, 216, 138], np.float32)


def luminance(rgb):
    return (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]) / 255 * 100


def plate_box(size):
    x0 = int(round(7 / 96 * size))
    y0 = int(round(7 / 96 * size))
    x1 = int(round(89 / 96 * size))
    y1 = int(round(89 / 96 * size))
    return x0, y0, x1, y1


def sky_mask(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (b > r + 12) & (b > g - 5) & (b > 70)


def measure(im):
    small = im.convert('RGB').resize((48, 48), Image.Resampling.LANCZOS)
    rgb = np.asarray(small).astype(np.float32)
    lum = luminance(rgb)
    plate = np.zeros((48, 48), dtype=bool)
    plate[4:44, 4:44] = True
    sky = plate & sky_mask(rgb)
    floor = np.zeros((48, 48), dtype=bool)
    floor[31:44, 4:44] = True
    subject = plate & ~sky & ~floor
    if sky.sum() < 8 or subject.sum() < 8:
        return None
    return float(lum[subject].mean()), float(lum[sky].mean()), float(lum[subject].mean() - lum[sky].mean())


def enhance(im):
    arr = np.array(im.convert('RGBA')).astype(np.float32)
    h, w = arr.shape[:2]
    x0, y0, x1, y1 = plate_box(w)
    rgb = arr[..., :3]
    sky = np.zeros((h, w), dtype=bool)
    sky[y0:y1, x0:x1] = sky_mask(rgb[y0:y1, x0:x1])
    rgb[sky] = rgb[sky] * 0.86 + DEEP * 0.14
    subject = np.zeros((h, w), dtype=bool)
    lum = luminance(rgb)
    cloud = (lum > 78) & (np.max(rgb, axis=2) - np.min(rgb, axis=2) < 28)
    subject[y0:y1, x0:x1] = ~sky[y0:y1, x0:x1] & ~cloud[y0:y1, x0:x1]
    mask = Image.fromarray((subject.astype(np.uint8) * 255))
    grown = np.array(mask.filter(ImageFilter.MaxFilter(11))) > 0
    rim = grown & ~subject & sky
    soft = np.array(mask.filter(ImageFilter.MaxFilter(7))) > 0
    shadow = np.zeros_like(subject)
    ox, oy = 5, 6
    shadow[oy:, ox:] = soft[:-oy, :-ox]
    shadow = shadow & sky & ~grown
    rgb[shadow] = rgb[shadow] * 0.62 + NAVY * 0.38
    rgb[rim] = rgb[rim] * 0.22 + GOLD * 0.78
    arr[..., :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def main():
    for folder in ['512', 'webp/96', 'webp/192', 'webp/288', 'svg24']:
        (OUT / folder).mkdir(parents=True, exist_ok=True)
    for icon_id in IDS:
        src = Image.open(SRC / '512' / f'{icon_id}.png')
        before = measure(src)
        out = enhance(src)
        after = measure(out)
        out.resize((512, 512), Image.Resampling.LANCZOS).save(OUT / '512' / f'{icon_id}.png')
        for size in (96, 192, 288):
            out.resize((size, size), Image.Resampling.LANCZOS).save(
                OUT / 'webp' / str(size) / f'{icon_id}.webp', 'WEBP', quality=92, method=6
            )
        svg = (SRC / 'svg24' / f'{icon_id}.svg').read_text(encoding='utf-8')
        (OUT / 'svg24' / f'{icon_id}.svg').write_text(svg, encoding='utf-8')
        b = ' '.join(f'{v:.1f}' for v in before)
        a = ' '.join(f'{v:.1f}' for v in after)
        print(f'{icon_id} before {b} after {a}')


if __name__ == '__main__':
    main()
