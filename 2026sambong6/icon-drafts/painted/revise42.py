"""검수 후속. 홈·가위바위보와 10개만 고친다. 승인본 set41-approved 는 건드리지 않는다."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from compose import INNER, clip_to, plate_mask
from set41 import LABELS, ORDER, save_canvas

ROOT = Path('/workspace/2026sambong6/icon-drafts/painted')
SRC = Path('/opt/cursor/artifacts/assets')
FRAME = Image.open(ROOT / 'frame-enamel.png').convert('RGBA')

# 홈은 신전을 키우고, 10개는 피사체 윤곽이 판의 약 75%가 되게 맞춘다.
REDRAWS = [
    'home', 'estate', 'constitution', 'vote', 'classboard', 'openlesson',
    'more', 'martial', 'morning', 'lottery', 'help',
]
FILL = 0.88


def subject_mask(arr):
    rgb = arr[:, :, :3].astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sky = (b > r + 8) & (b + 6 > g) & (b > 48) & (lum < 155)
    return ~sky


def crop_to_subject(im, fill=FILL):
    arr = np.asarray(im.convert('RGB'))
    mask = subject_mask(arr)
    ys, xs = np.where(mask)
    if len(xs) < 200:
        return im
    x0, x1 = np.percentile(xs, [3, 97])
    y0, y1 = np.percentile(ys, [3, 97])
    bw = max(8, x1 - x0)
    bh = max(8, y1 - y0)
    crop_w = bw / fill
    crop_h = bh / fill
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    left = int(round(cx - crop_w / 2))
    top = int(round(cy - crop_h / 2))
    right = int(round(cx + crop_w / 2))
    bottom = int(round(cy + crop_h / 2))
    left = max(0, left)
    top = max(0, top)
    right = min(arr.shape[1], right)
    bottom = min(arr.shape[0], bottom)
    return im.crop((left, top, right, bottom))


def place(art, cover=True):
    if cover:
        scale = max(INNER['w'] / art.width, INNER['h'] / art.height)
    else:
        scale = min(INNER['w'] / art.width, INNER['h'] / art.height)
    resized = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
        Image.Resampling.LANCZOS,
    )
    layer = Image.new('RGBA', FRAME.size, (0, 0, 0, 0))
    ox = round(INNER['x'] + (INNER['w'] - resized.width) / 2)
    oy = round(INNER['y'] + (INNER['h'] - resized.height) / 2)
    layer.paste(resized, (ox, oy))
    return clip_to(layer, plate_mask(FRAME.size))


def place_help():
    """불꽃은 키우고, 손잡이가 잘려 금덩어리가 되지 않게 횃불 실루엣은 남긴다."""
    art = scrub_pink(Image.open(SRC / 'oly42b-help.jpg'))
    cropped = art.crop((250, 70, 780, 760))
    sky = Image.new('RGB', (1024, 1024), (14, 52, 112))
    scale = 900 / cropped.width
    resized = cropped.resize(
        (900, max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    top = max(0, (1024 - resized.height) // 2)
    if resized.height > 1024:
        resized = resized.crop((0, 0, resized.width, 1024))
        top = 0
    sky.paste(resized, ((1024 - resized.width) // 2, top))
    return place(sky.convert('RGBA'), cover=True)


def scrub_pink(im):
    arr = np.array(im.convert('RGB'))
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    pink = (r > 170) & (g < 130) & (b > 80) & ((r - g) > 45) & ((b - g) > 15)
    arr[pink] = (18, 62, 122)
    return Image.fromarray(arr, 'RGB')


def components(mask, keep_n=3):
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    found = []
    ys, xs = np.where(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        stack = [(x, y)]
        seen[y, x] = True
        pixels = []
        while stack:
            cx, cy = stack.pop()
            pixels.append((cx, cy))
            for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((nx, ny))
        found.append(pixels)
    found.sort(key=len, reverse=True)
    out = np.zeros_like(mask)
    for pixels in found[:keep_n]:
        for x, y in pixels:
            out[y, x] = True
    return out, [len(pixels) for pixels in found[:keep_n]]


def outline_rps():
    approved = ROOT / 'set41-approved' / '512' / 'rps.png'
    src = Image.open(approved).convert('RGBA')
    arr = np.array(src)
    rgb = arr[:, :, :3].astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    plate = Image.new('L', src.size, 0)
    scale = src.width / 1024
    x = INNER['x'] * scale
    y = INNER['y'] * scale
    w = INNER['w'] * scale
    h = INNER['h'] * scale
    ImageDraw.Draw(plate).rounded_rectangle(
        [x + 2, y + 2, x + w - 2, y + h - 2],
        radius=INNER['rx'] * scale,
        fill=255,
    )
    inside = np.array(plate) > 0
    marble = inside & (lum > 168) & (sat < 62) & (r > 170) & (g > 160) & (b > 145)
    hands, sizes = components(marble, 3)
    hand_img = Image.fromarray((hands.astype(np.uint8) * 255))
    # 512px에서 두께 13px. 48px로 줄이면 약 1.2px인 진한 금선.
    dilated = np.array(hand_img.filter(ImageFilter.MaxFilter(27))) > 0
    outline = dilated & ~hands & inside
    painted = arr.copy()
    painted[outline, 0] = 138
    painted[outline, 1] = 98
    painted[outline, 2] = 20
    image = Image.fromarray(painted, 'RGBA')
    image.save(ROOT / 'set41' / '512' / 'rps.png')
    for size in (96, 192, 288):
        image.resize((size, size), Image.Resampling.LANCZOS).save(
            ROOT / 'set41' / 'webp' / str(size) / 'rps.webp', 'WEBP', quality=92, method=6
        )
    print('rps hands', sizes, 'outline', int(outline.sum()))


def share(icon_id):
    im = Image.open(ROOT / 'set41' / '512' / f'{icon_id}.png').convert('RGB')
    arr = np.asarray(im).astype(np.int16)
    mask = subject_mask(arr)
    plate = Image.new('L', im.size, 0)
    scale = im.width / 1024
    x = INNER['x'] * scale
    y = INNER['y'] * scale
    w = INNER['w'] * scale
    h = INNER['h'] * scale
    ImageDraw.Draw(plate).rounded_rectangle([x, y, x + w, y + h], radius=INNER['rx'] * scale, fill=255)
    inside = np.array(plate) > 0
    sub = mask & inside
    ys, xs = np.where(sub)
    if len(xs) == 0:
        print(icon_id, 'empty')
        return
    bw = xs.max() - xs.min() + 1
    bh = ys.max() - ys.min() + 1
    box = bw * bh / im.size[0] / im.size[1]
    plate_box = bw * bh / max(1, int(inside.sum()))
    print(
        f'{icon_id:14} box/icon {box:.2f} box/plate {plate_box:.2f} mass/icon {sub.mean():.2f}'
    )


def place_more():
    art = Image.open(SRC / 'oly42c-more.jpg').convert('RGBA')
    return place(art, cover=True)


def main():
    for icon_id in REDRAWS:
        if icon_id == 'help':
            canvas = FRAME.copy()
            canvas.alpha_composite(place_help())
            save_canvas(icon_id, canvas)
            print('drew', icon_id, 'torch')
            continue
        if icon_id == 'more':
            canvas = FRAME.copy()
            canvas.alpha_composite(place_more())
            save_canvas(icon_id, canvas)
            print('drew', icon_id, 'dots')
            continue
        art = crop_to_subject(Image.open(SRC / f'oly42-{icon_id}.jpg')).convert('RGBA')
        canvas = FRAME.copy()
        canvas.alpha_composite(place(art))
        save_canvas(icon_id, canvas)
        print('drew', icon_id, LABELS[icon_id], art.size)
    outline_rps()
    for icon_id in REDRAWS + ['rps']:
        share(icon_id)
    missing = [i for i in ORDER if not (ROOT / 'set41' / '512' / f'{i}.png').exists()]
    print('missing', missing)


if __name__ == '__main__':
    main()
