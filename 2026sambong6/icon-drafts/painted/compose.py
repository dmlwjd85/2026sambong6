"""가운데 일러스트를 기존 금테·바탕판 위에 얹고 512 PNG와 WebP를 만든다."""
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path('/workspace/2026sambong6')
HERE = ROOT / 'icon-drafts' / 'painted'
SRC = Path('/opt/cursor/artifacts/assets')
SCALE = 1024 / 96
INNER = {
    'x': 7 * SCALE,
    'y': 7 * SCALE,
    'w': 82 * SCALE,
    'h': 82 * SCALE,
    'rx': 17 * SCALE,
}

ICONS = [
    {'id': 'shop', 'label': '상점', 'plate': 'enamel', 'main': 'nav/nav-shop.webp', 'src': 'oly3-shop.jpg'},
    {'id': 'quest', 'label': '퀘스트', 'plate': 'enamel', 'main': 'nav/nav-quests.webp', 'src': 'oly3-quest.jpg'},
    {'id': 'challenge', 'label': '도전', 'plate': 'enamel', 'main': 'nav/nav-challenge.webp', 'src': 'oly2-challenge.jpg'},
    {'id': 'home', 'label': '홈', 'plate': 'enamel', 'main': 'nav/nav-home.webp', 'src': 'oly3-home.jpg'},
    {'id': 'literature', 'label': '문학', 'plate': 'enamel', 'main': 'nav/nav-literature.webp', 'src': 'oly3-literature.jpg'},
    {'id': 'chalk', 'label': '칠판', 'plate': 'marble', 'main': 'nav/tool-chalk.webp', 'src': 'oly2-chalk.jpg'},
    {'id': 'wheel', 'label': '돌림판', 'plate': 'enamel', 'main': 'nav/tool-wheel.webp', 'src': 'oly2-wheel.jpg'},
    {'id': 'rps', 'label': '가위바위보', 'plate': 'enamel', 'main': 'nav/tool-rps.webp', 'src': 'oly3-rps.jpg'},
]

REDRAW = {'shop', 'quest', 'home', 'literature', 'rps'}
SKY = np.array([110, 193, 240], np.float32)
DEEP = np.array([28, 100, 168], np.float32)
NAVY = np.array([27, 42, 74], np.float32)


def is_magenta(rgb):
    r, g, b = (int(v) for v in rgb)
    return r > 150 and b > 70 and g < 150 and (r - g) > 45 and (b - g) > 25 and b > 90


def key_image(path):
    im = Image.open(path).convert('RGB')
    arr = np.asarray(im)
    height, width, _ = arr.shape
    bg = np.zeros((height, width), dtype=bool)
    seen = np.zeros((height, width), dtype=bool)
    q = deque()
    for x in range(width):
        q.append((x, 0))
        q.append((x, height - 1))
    for y in range(height):
        q.append((0, y))
        q.append((width - 1, y))
    while q:
        x, y = q.popleft()
        if seen[y, x]:
            continue
        seen[y, x] = True
        if not is_magenta(arr[y, x]):
            continue
        bg[y, x] = True
        if x > 0:
            q.append((x - 1, y))
        if x + 1 < width:
            q.append((x + 1, y))
        if y > 0:
            q.append((x, y - 1))
        if y + 1 < height:
            q.append((x, y + 1))
    # JPEG 가장자리의 분홍 테두리를 한 픽셀 더 걷어 낸다.
    fringe = bg.copy()
    fringe[1:] |= bg[:-1]
    fringe[:-1] |= bg[1:]
    fringe[:, 1:] |= bg[:, :-1]
    fringe[:, :-1] |= bg[:, 1:]
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    holes = (r > 150) & (b > 80) & (g < 100) & ((r - g) > 50) & ((b - g) > 30)
    gone = fringe | holes
    gone[1:] |= holes[:-1]
    gone[:-1] |= holes[1:]
    gone[:, 1:] |= holes[:, :-1]
    gone[:, :-1] |= holes[:, 1:]
    alpha = np.where(gone, 0, 255).astype(np.uint8)
    out = np.dstack([arr, alpha])
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        raise RuntimeError(f'그림이 비었습니다: {path}')
    crop = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return Image.fromarray(out, 'RGBA').crop(crop)


def rounded_mask(size, box, radius):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    x, y, w, h = box
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=255)
    return mask


def fit_art(art, canvas_size):
    pad = INNER['w'] * 0.012
    max_w = INNER['w'] - pad * 2
    max_h = INNER['h'] - pad * 2
    scale = max(max_w / art.width, max_h / art.height)
    resized = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.Resampling.LANCZOS)
    layer = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    ox = round(INNER['x'] + (INNER['w'] - resized.width) / 2)
    oy = round(INNER['y'] + (INNER['h'] - resized.height) / 2)
    layer.paste(resized, (ox, oy), resized)
    mask = rounded_mask((canvas_size, canvas_size), (INNER['x'], INNER['y'], INNER['w'], INNER['h']), INNER['rx'])
    layer.putalpha(Image.fromarray(np.minimum(np.array(layer.getchannel('A')), np.array(mask))))
    return layer


def frame_svg(plate):
    inner = {'x': 7, 'y': 7, 'w': 82, 'h': 82, 'rx': 17}
    veins = (
        f'''<g fill="none" stroke-linecap="round">
            <path d="M{inner['x'] + inner['w'] * 0.08:.2f} {inner['y'] + inner['h'] * 0.22:.2f}C{inner['x'] + inner['w'] * 0.35:.2f} {inner['y'] + inner['h'] * 0.3:.2f},{inner['x'] + inner['w'] * 0.22:.2f} {inner['y'] + inner['h'] * 0.55:.2f},{inner['x'] + inner['w'] * 0.55:.2f} {inner['y'] + inner['h'] * 0.78:.2f}" stroke="var(--surface)" stroke-width="{(inner['w'] * 0.07):.2f}"/>
            <path d="M{inner['x'] + inner['w'] * 0.12:.2f} {inner['y'] + inner['h'] * 0.62:.2f}C{inner['x'] + inner['w'] * 0.4:.2f} {inner['y'] + inner['h'] * 0.5:.2f},{inner['x'] + inner['w'] * 0.62:.2f} {inner['y'] + inner['h'] * 0.84:.2f},{inner['x'] + inner['w'] * 0.9:.2f} {inner['y'] + inner['h'] * 0.7:.2f}" stroke="var(--ink)" stroke-width="{(inner['w'] * 0.025):.2f}" opacity="0.18"/>
            <path d="M{inner['x'] + inner['w'] * 0.4:.2f} {inner['y'] + inner['h'] * 0.12:.2f}C{inner['x'] + inner['w'] * 0.7:.2f} {inner['y'] + inner['h'] * 0.28:.2f},{inner['x'] + inner['w'] * 0.5:.2f} {inner['y'] + inner['h'] * 0.2:.2f},{inner['x'] + inner['w'] * 0.86:.2f} {inner['y'] + inner['h'] * 0.36:.2f}" stroke="var(--gold-text)" stroke-width="{(inner['w'] * 0.018):.2f}" opacity="0.28"/>
          </g>'''
        if plate == 'marble'
        else f'''<ellipse cx="{inner['x'] + inner['w'] * 0.36:.2f}" cy="{inner['y'] + inner['h'] * 0.28:.2f}" rx="{inner['w'] * 0.28:.2f}" ry="{inner['h'] * 0.16:.2f}" fill="var(--surface)" opacity="0.38"/>
           <ellipse cx="{inner['x'] + inner['w'] * 0.62:.2f}" cy="{inner['y'] + inner['h'] * 0.78:.2f}" rx="{inner['w'] * 0.32:.2f}" ry="{inner['h'] * 0.12:.2f}" fill="var(--navy)" opacity="0.18"/>'''
    )
    fill = 'url(#enamel)' if plate == 'enamel' else 'url(#marble)'
    lip = f'''
      <path d="M{inner['x'] + inner['w'] * 0.16:.2f} {inner['y'] + inner['h'] * 0.08:.2f}H{inner['x'] + inner['w'] * 0.78:.2f}" stroke="var(--surface)" stroke-width="{inner['w'] * 0.035:.2f}" stroke-linecap="round" opacity="0.8"/>
      <path d="M{inner['x'] + inner['w'] * 0.08:.2f} {inner['y'] + inner['h'] * 0.2:.2f}V{inner['y'] + inner['h'] * 0.72:.2f}" stroke="var(--surface)" stroke-width="{inner['w'] * 0.028:.2f}" stroke-linecap="round" opacity="0.45"/>
      <path d="M{inner['x'] + inner['w'] * 0.18:.2f} {inner['y'] + inner['h'] * 0.9:.2f}H{inner['x'] + inner['w'] * 0.86:.2f}" stroke="var(--navy)" stroke-width="{inner['w'] * 0.04:.2f}" stroke-linecap="round" opacity="0.22"/>
      <path d="M{inner['x'] + inner['w'] * 0.9:.2f} {inner['y'] + inner['h'] * 0.22:.2f}V{inner['y'] + inner['h'] * 0.82:.2f}" stroke="var(--navy)" stroke-width="{inner['w'] * 0.03:.2f}" stroke-linecap="round" opacity="0.16"/>
    '''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--gold-rim-hi)"/>
          <stop offset="0.46" stop-color="var(--gold)"/>
          <stop offset="1" stop-color="var(--gold-rim-lo)"/>
        </linearGradient>
        <radialGradient id="enamel" cx="0.32" cy="0.24" r="0.85">
          <stop offset="0" stop-color="var(--sky)"/>
          <stop offset="1" stop-color="var(--sky-deep)"/>
        </radialGradient>
        <linearGradient id="marble" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--surface)"/>
          <stop offset="0.45" stop-color="var(--marble)"/>
          <stop offset="1" stop-color="var(--marble)"/>
        </linearGradient>
        <clipPath id="clip"><rect x="7" y="7" width="82" height="82" rx="17"/></clipPath>
      </defs>
      <rect x="2" y="2" width="92" height="92" rx="22" fill="url(#rim)"/>
      <rect x="7" y="7" width="82" height="82" rx="17" fill="{fill}"/>
      <g clip-path="url(#clip)">{veins}{lip}</g>
    </svg>'''


def write_frame_html():
    html = f'''<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="file://{ROOT}/src/olympus-tokens.css">
      <style>html,body{{margin:0;background:#fff}} .row{{display:flex;width:2048px;height:1024px}} svg{{width:1024px;height:1024px;display:block}}</style>
      </head><body><div class="row">{frame_svg('marble')}{frame_svg('enamel')}</div></body></html>'''
    path = HERE / 'frames.html'
    path.write_text(html, encoding='utf-8')
    return path


SILHOUETTES = {
    'shop': '<path d="M7.6 6.2h5.2c.5 0 .9.4.9.9v1c2.2.8 3.4 2.5 3.4 4.6 0 3.2-2 5.4-3.8 6v1.2H6.7v-1.2c-1.8-.6-3.8-2.8-3.8-6 0-2.1 1.2-3.8 3.4-4.6v-1c0-.5.4-.9.9-.9z" fill="var(--gold)"/><circle cx="16.8" cy="7.2" r="2.5" fill="var(--gold-rim-hi)"/>',
    'quest': '<ellipse cx="6.3" cy="12" rx="2.5" ry="6.5" fill="var(--gold)"/><ellipse cx="17.7" cy="12" rx="2.5" ry="6.5" fill="var(--gold-rim-lo)"/><path d="M6.4 6.6c2.1 1.6 4.6.2 5.6.2s3.5 1.4 5.7-.2c.2 1.7-.3 3.5-.3 5.4s.5 3.7.3 5.4c-2.2-1.6-4.6-.2-5.7-.2s-3.5-1.4-5.6.2c-.2-1.7.3-3.5.3-5.4s-.5-3.7-.3-5.4z" fill="var(--gold-light)"/>',
    'challenge': '<path d="M14.8 3.2 4.6 12.8h5.8L8 20.8 19.4 9.4h-6.2z" fill="var(--gold-rim-hi)"/>',
    'home': '<path d="M3.2 12.4 12 2.8 20.8 12.4z" fill="var(--gold-rim-hi)"/><rect x="4.7" y="11.8" width="3.5" height="7.2" fill="var(--gold)"/><rect x="10.25" y="11.8" width="3.5" height="7.2" fill="var(--gold)"/><rect x="15.8" y="11.8" width="3.5" height="7.2" fill="var(--gold)"/>',
    'literature': '<path d="M3.8 7h7.2v8.8c0 1.1-1.5 2-3.5 2S3.8 16.8 3.8 15.6V7zm8.6 0h7.8v8.6c0 1.2-1.8 2.2-3.9 2.2s-3.9-1-3.9-2.2V7z" fill="var(--gold-light)"/><rect x="11" y="7" width="2" height="9.4" fill="var(--gold)"/>',
    'chalk': '<rect x="3.6" y="4.4" width="13.4" height="12" rx="1.2" fill="var(--chalk-board)" stroke="var(--gold)" stroke-width="2.2"/><rect x="17.3" y="8.2" width="2.6" height="7.6" rx="0.8" fill="var(--surface)" transform="rotate(18 18.6 12)"/>',
    'wheel': '<path d="M12 3.4 14.6 7.2H9.4z" fill="var(--wine)"/><circle cx="12" cy="13.2" r="6.2" fill="var(--sky-deep)" stroke="var(--gold)" stroke-width="2.8"/><circle cx="12" cy="13.2" r="2.4" fill="var(--gold-rim-hi)"/>',
    'rps': '<path d="M6.4 19 11 4.6h2.8L10.6 13.4 15.8 4.2h2.8L11.6 19z" fill="var(--gold-light)" stroke="var(--gold-rim-lo)" stroke-width="2"/>',
}


def write_silhouette(icon):
    plate = 'url(#enamel)' if icon['plate'] == 'enamel' else 'url(#marble)'
    body = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img">
  <title>{icon['label']}</title>
  <style>@import url("../../../src/olympus-tokens.css");</style>
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--gold-rim-hi)"/>
      <stop offset="0.46" stop-color="var(--gold)"/>
      <stop offset="1" stop-color="var(--gold-rim-lo)"/>
    </linearGradient>
    <radialGradient id="enamel" cx="0.32" cy="0.24" r="0.85">
      <stop offset="0" stop-color="var(--sky)"/>
      <stop offset="1" stop-color="var(--sky-deep)"/>
    </radialGradient>
    <linearGradient id="marble" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--surface)"/>
      <stop offset="1" stop-color="var(--marble)"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" fill="url(#rim)"/>
  <rect x="1.75" y="1.75" width="20.5" height="20.5" rx="4.25" fill="{plate}"/>
  {SILHOUETTES[icon['id']]}
</svg>
'''
    (HERE / 'svg24' / f"{icon['id']}.svg").write_text(body, encoding='utf-8')


def plate_mask(size):
    return rounded_mask(size, (INNER['x'], INNER['y'], INNER['w'], INNER['h']), INNER['rx'])


def make_sky(size):
    ys = np.linspace(0, 1, size, dtype=np.float32)[:, None]
    xs = np.linspace(0, 1, size, dtype=np.float32)[None, :]
    fade = np.broadcast_to(np.clip((ys - 0.055) / 0.11, 0, 1), (size, size))[..., None]
    col = SKY * (1 - fade) + DEEP * fade
    deeper = np.broadcast_to(np.clip((ys - 0.14) / 0.18, 0, 1), (size, size))
    col = col * (1 - 0.74 * deeper[..., None]) + NAVY * (0.74 * deeper[..., None])
    # 왼쪽 위가 조금 더 밝다. 흰 점까지 올라가지 않게 하늘색 쪽으로만 섞는다.
    corner = np.clip(1 - np.sqrt(xs ** 2 + ys ** 2) / 0.22, 0, 1) * np.clip(1 - (ys - 0.05) * 8, 0, 1)
    col = col * (1 - 0.35 * corner[..., None]) + SKY * (0.35 * corner[..., None])
    return Image.fromarray(col.astype(np.uint8), 'RGB').convert('RGBA')


def clip_to(image, mask):
    kept = np.minimum(np.array(image.getchannel('A')), np.array(mask))
    image.putalpha(Image.fromarray(kept))
    return image


def draw_floor(base, mask):
    overlay = Image.new('RGBA', base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    x, y, w, h = INNER['x'], INNER['y'], INNER['w'], INNER['h']
    floor_top = y + h * 0.67
    clouds = [
        (x + w * 0.08, floor_top + h * 0.05, x + w * 0.52, y + h * 0.96),
        (x + w * 0.38, floor_top + h * 0.12, x + w * 0.96, y + h * 0.98),
        (x + w * 0.02, floor_top + h * 0.18, x + w * 0.34, y + h * 0.94),
    ]
    for box in clouds:
        draw.ellipse(box, fill=(255, 255, 255, 168))
    step = y + h * 0.90
    draw.rounded_rectangle([x + w * 0.10, step, x + w * 0.90, y + h * 0.985], radius=20, fill=(247, 245, 240, 225))
    floor = Image.new('L', base.size, 0)
    ImageDraw.Draw(floor).rectangle([0, floor_top, base.size[0], base.size[1]], fill=255)
    limit = Image.fromarray(np.minimum(np.array(mask), np.array(floor)))
    base.alpha_composite(clip_to(overlay, limit))


def draw_awning(base, mask):
    overlay = Image.new('RGBA', base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    x, y, w, h = INNER['x'], INNER['y'], INNER['w'], INNER['h']
    top = y + h * 0.055
    bot = y + h * 0.145
    draw.rounded_rectangle([x + w * 0.08, top, x + w * 0.92, bot], radius=14, fill=(212, 166, 58, 240))
    draw.rectangle([x + w * 0.08, top, x + w * 0.92, top + (bot - top) * 0.38], fill=(243, 216, 138, 230))
    base.alpha_composite(clip_to(overlay, mask))


def fit_subject(art, canvas_size):
    target_w = INNER['w'] * 0.75
    target_h = INNER['h'] * 0.75
    scale = min(target_w / art.width, target_h / art.height)
    resized = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.Resampling.LANCZOS)
    layer = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    ox = round(INNER['x'] + (INNER['w'] - resized.width) / 2)
    bottom = INNER['y'] + INNER['h'] * 0.84
    oy = round(max(INNER['y'] + INNER['h'] * 0.03, bottom - resized.height))
    layer.paste(resized, (ox, oy), resized)
    return clip_to(layer, plate_mask((canvas_size, canvas_size)))


def lift_subject(layer):
    """어두운 주름이 48px 평균을 끌어내리지 않도록 대상 휘도 하한을 둔다."""
    arr = np.array(layer).astype(np.float32)
    rgb = arr[..., :3] / 255
    alpha = arr[..., 3]
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    target = np.maximum(np.clip(lum, 0, 1) ** 0.45, 0.80)
    scale = np.where(lum > 0.02, target / np.maximum(lum, 0.02), 1)
    scaled = np.clip(rgb * np.clip(scale, 1, 4)[..., None], 0, 1)
    new_lum = 0.2126 * scaled[..., 0] + 0.7152 * scaled[..., 1] + 0.0722 * scaled[..., 2]
    scaled = np.clip(scaled + np.clip(target - new_lum, 0, 1)[..., None], 0, 1)
    live = alpha > 16
    arr[..., :3][live] = scaled[live] * 255
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def warm_pages(layer):
    arr = np.array(layer).astype(np.float32)
    opaque = arr[..., 3] > 0
    warm = np.array([255, 214, 150], np.float32)
    arr[..., :3][opaque] = arr[..., :3][opaque] * 0.78 + warm * 0.22
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def separate(layer):
    alpha = np.array(layer.getchannel('A'))
    grown = Image.fromarray(alpha)
    rim = np.clip(np.array(grown.filter(ImageFilter.MaxFilter(29))).astype(np.int16) - alpha.astype(np.int16), 0, 255).astype(np.uint8)
    edge = np.clip(np.array(grown.filter(ImageFilter.MaxFilter(11))).astype(np.int16) - alpha.astype(np.int16), 0, 255).astype(np.uint8)
    soft = np.array(grown.filter(ImageFilter.MaxFilter(17)))
    shadow = np.zeros_like(alpha)
    ox, oy = 16, 22
    shadow[oy:, ox:] = soft[:-oy, :-ox]
    shadow = np.clip(shadow.astype(np.int16) - alpha.astype(np.int16), 0, 255).astype(np.uint8)
    shadow = (shadow.astype(np.float32) * 0.78).astype(np.uint8)

    def solid(color, band):
        out = np.zeros((*alpha.shape, 4), np.uint8)
        out[..., 0], out[..., 1], out[..., 2] = color
        out[..., 3] = band
        return Image.fromarray(out, 'RGBA')

    return solid((27, 42, 74), shadow), solid((14, 24, 48), edge), solid((243, 216, 138), rim)


def measure(canvas, subject):
    small = canvas.resize((48, 48), Image.Resampling.LANCZOS).convert('RGB')
    mask = np.array(subject.resize((48, 48), Image.Resampling.LANCZOS).getchannel('A')) > 128
    rgb = np.asarray(small).astype(np.float32)
    lum = (0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]) / 255 * 100
    plate = np.zeros((48, 48), dtype=bool)
    plate[4:44, 4:44] = True
    sky = plate & ~mask & (rgb[:, :, 2] > rgb[:, :, 0] + 12) & (rgb[:, :, 2] > rgb[:, :, 1] - 5)
    if mask.sum() < 8 or sky.sum() < 8:
        return None
    subject_lum = float(lum[mask].mean())
    background_lum = float(lum[sky].mean())
    return subject_lum, background_lum, subject_lum - background_lum, int(mask.sum()), int(sky.sum())


def main():
    for folder in ['512', 'webp/96', 'webp/192', 'webp/288', 'svg24', 'center', 'sheets']:
        (HERE / folder).mkdir(parents=True, exist_ok=True)
    frame = Image.open(HERE / 'frame-enamel.png').convert('RGBA')
    for icon in ICONS:
        if icon['id'] not in REDRAW:
            continue
        keyed = key_image(SRC / icon['src'])
        keyed.save(HERE / 'center' / f"{icon['id']}.png")
        canvas, mask = frame.copy(), plate_mask(frame.size)
        canvas.paste(make_sky(frame.width), (0, 0), mask)
        draw_floor(canvas, mask)
        if icon['id'] == 'shop':
            draw_awning(canvas, mask)
        subject = lift_subject(fit_subject(keyed, canvas.width))
        if icon['id'] == 'literature':
            subject = warm_pages(subject)
        shadow, edge, rim = separate(subject)
        canvas.alpha_composite(clip_to(shadow, mask))
        canvas.alpha_composite(clip_to(edge, mask))
        canvas.alpha_composite(clip_to(rim, mask))
        canvas.alpha_composite(subject)
        canvas.resize((512, 512), Image.Resampling.LANCZOS).save(HERE / '512' / f"{icon['id']}.png")
        for size in (96, 192, 288):
            canvas.resize((size, size), Image.Resampling.LANCZOS).save(
                HERE / 'webp' / str(size) / f"{icon['id']}.webp", 'WEBP', quality=92, method=6
            )
        write_silhouette(icon)
        stats = measure(canvas, subject)
        subject_lum, background_lum, delta, subject_n, background_n = stats
        print(f"{icon['id']} subject={subject_lum:.1f} bg={background_lum:.1f} delta={delta:.1f} n={subject_n}/{background_n}")


if __name__ == '__main__':
    main()
