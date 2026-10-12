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
    {'id': 'shop', 'label': '상점', 'plate': 'enamel', 'main': 'nav/nav-shop.webp', 'src': 'oly-shop-center.jpg'},
    {'id': 'quest', 'label': '퀘스트', 'plate': 'marble', 'main': 'nav/nav-quests.webp', 'src': 'oly-quest-center.jpg'},
    {'id': 'challenge', 'label': '도전', 'plate': 'enamel', 'main': 'nav/nav-challenge.webp', 'src': 'oly-challenge-center.jpg'},
    {'id': 'home', 'label': '홈', 'plate': 'marble', 'main': 'nav/nav-home.webp', 'src': 'oly-home-center.jpg'},
    {'id': 'literature', 'label': '문학', 'plate': 'marble', 'main': 'nav/nav-literature.webp', 'src': 'oly-literature-center.jpg'},
    {'id': 'chalk', 'label': '칠판', 'plate': 'marble', 'main': 'nav/tool-chalk.webp', 'src': 'oly-chalk-center.jpg'},
    {'id': 'wheel', 'label': '돌림판', 'plate': 'enamel', 'main': 'nav/tool-wheel.webp', 'src': 'oly-wheel-center.jpg'},
    {'id': 'rps', 'label': '가위바위보', 'plate': 'enamel', 'main': 'nav/tool-rps.webp', 'src': 'oly-rps-center.jpg'},
]


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
    pad = INNER['w'] * 0.04
    max_w = INNER['w'] - pad * 2
    max_h = INNER['h'] - pad * 2
    scale = min(max_w / art.width, max_h / art.height)
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
    'shop': '<path d="M8 6.2h5.4c.5 0 .8.4.8.9v2c2.5 1 3.8 3 3.8 5.4 0 3.4-2.2 5.6-4.2 6.2v1.2H7.6v-1.2C5.6 20.1 3.4 17.9 3.4 14.5c0-2.4 1.3-4.4 3.8-5.4V7.1c0-.5.3-.9.8-.9z" fill="var(--gold)"/><path d="M7.6 9.4C5.6 10.2 4.6 12.6 6 14.6M15.2 9.4c2 .8 3 3.2 1.6 5.2" fill="none" stroke="var(--gold-rim-lo)" stroke-width="1.4" stroke-linecap="round"/><circle cx="16.6" cy="7.4" r="2.4" fill="var(--gold-rim-hi)" stroke="var(--gold-rim-lo)" stroke-width="0.8"/>',
    'quest': '<rect x="6.4" y="6.4" width="11.2" height="11" rx="0.8" fill="var(--gold-light)"/><path d="M8.2 9.6h7.4M8.2 12.2h7.4" stroke="var(--gold-text)" stroke-width="1.2" stroke-linecap="round"/><ellipse cx="6.3" cy="11.9" rx="1.8" ry="4.6" fill="var(--gold)"/><ellipse cx="17.7" cy="11.9" rx="1.8" ry="4.6" fill="var(--gold-rim-lo)"/>',
    'challenge': '<path d="M13.4 4.4 6.2 12.4h4.4L8.8 19.6 17.8 10.2h-4.6z" fill="var(--gold-rim-hi)"/>',
    'home': '<path d="M4.6 11.2 12 5l7.4 6.2z" fill="var(--navy)"/><rect x="6.2" y="11" width="2.1" height="6.2" fill="var(--surface)"/><rect x="10.9" y="11" width="2.2" height="6.2" fill="var(--surface)"/><rect x="15.6" y="11" width="2.1" height="6.2" fill="var(--surface)"/><rect x="11.2" y="13.2" width="1.6" height="4" fill="var(--navy)"/><rect x="5" y="17.3" width="14" height="1.6" rx="0.4" fill="var(--gold-rim-lo)"/>',
    'literature': '<path d="M4.8 8.4h6.6V16H6.4c-.9 0-1.6.6-1.6 1.4V8.4z" fill="var(--gold-light)"/><path d="M12.6 8.4H19v7.6h-4.8c-.8 0-1.6.6-1.6 1.4V8.4z" fill="var(--surface)" stroke="var(--gold)" stroke-width="0.7"/><path d="M11.4 8.6v7.2" stroke="var(--gold-text)" stroke-width="0.8"/><path d="M14.6 7.2c2.2 1.4 2.8 3.6 1.2 5.2" fill="none" stroke="var(--gold-rim-lo)" stroke-width="1.3" stroke-linecap="round"/>',
    'chalk': '<rect x="6.2" y="5.2" width="11.6" height="12.2" rx="1.2" fill="var(--chalk-board)" stroke="var(--gold)" stroke-width="1.3"/><rect x="8.4" y="17.2" width="7.2" height="1.5" rx="0.4" fill="var(--gold)"/>',
    'wheel': '<path d="M12 4.4 13.6 7H10.4z" fill="var(--wine)"/><path d="M12 8.2a4.8 4.8 0 0 1 4.8 4.8H12Z" fill="var(--gold-light)"/><path d="M16.8 13A4.8 4.8 0 0 1 12 17.8V13Z" fill="var(--laurel)"/><path d="M12 17.8A4.8 4.8 0 0 1 7.2 13H12Z" fill="var(--wine)"/><path d="M7.2 13A4.8 4.8 0 0 1 12 8.2V13Z" fill="var(--sky)"/><circle cx="12" cy="13" r="4.8" fill="none" stroke="var(--gold)" stroke-width="1.5"/><circle cx="12" cy="13" r="1.6" fill="var(--gold-rim-hi)"/>',
    'rps': '<circle cx="7.4" cy="14.6" r="2.7" fill="var(--surface)" stroke="var(--gold-rim-lo)" stroke-width="1"/><rect x="10.2" y="6.2" width="4.6" height="5.2" rx="1" fill="var(--surface)" stroke="var(--gold-rim-lo)" stroke-width="1"/><path d="M15.2 9.2v4.2M17.4 8.4v5" stroke="var(--gold)" stroke-width="1.7" stroke-linecap="round"/>',
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


def main():
    for folder in ['512', 'webp/96', 'webp/192', 'webp/288', 'svg24', 'center', 'sheets']:
        (HERE / folder).mkdir(parents=True, exist_ok=True)
    frames = {
        'marble': Image.open(HERE / 'frame-marble.png').convert('RGBA'),
        'enamel': Image.open(HERE / 'frame-enamel.png').convert('RGBA'),
    }
    for icon in ICONS:
        keyed = key_image(SRC / icon['src'])
        keyed.save(HERE / 'center' / f"{icon['id']}.png")
        canvas = frames[icon['plate']].copy()
        canvas.alpha_composite(fit_art(keyed, canvas.width))
        master = canvas.resize((512, 512), Image.Resampling.LANCZOS)
        master.save(HERE / '512' / f"{icon['id']}.png")
        for size in (96, 192, 288):
            small = canvas.resize((size, size), Image.Resampling.LANCZOS)
            small.save(HERE / 'webp' / str(size) / f"{icon['id']}.webp", 'WEBP', quality=92, method=6)
        write_silhouette(icon)
        print(icon['id'], canvas.size, '-> 512')


if __name__ == '__main__':
    main()
