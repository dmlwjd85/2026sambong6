"""3차 스타일로 41개 아이콘을 맞춘다. 기존 8개는 보완본을 그대로 쓴다."""
from pathlib import Path

from PIL import Image

from compose import INNER, clip_to, key_image, plate_mask

ROOT = Path('/workspace/2026sambong6/icon-drafts/painted')
SRC = Path('/opt/cursor/artifacts/assets')
OUT = ROOT / 'set41'
FRAME = Image.open(ROOT / 'frame-enamel.png').convert('RGBA')

KEEP = ['shop', 'quest', 'challenge', 'home', 'literature', 'chalk', 'wheel', 'rps']

NEW = [
    'plaza', 'jobs', 'economy', 'lunch', 'constitution', 'classtools', 'admin', 'settings', 'help', 'more',
    'bank', 'estate', 'groupbuy', 'skin', 'item', 'convenience', 'classitem', 'lotto',
    'goldenbell', 'speedquiz', 'raid', 'rank',
    'timetable', 'thermo', 'timer', 'lottery', 'vote', 'boardgames', 'martial', 'morning', 'padlet', 'classboard', 'openlesson',
]

LABELS = {
    'home': '홈', 'plaza': '광장', 'quest': '퀘스트', 'literature': '문학', 'jobs': '직업', 'economy': '경제',
    'lunch': '밥줄', 'challenge': '도전', 'constitution': '헌법', 'classtools': '수업', 'admin': '마스터',
    'settings': '설정', 'help': '도움말', 'more': '더보기', 'shop': '상점', 'bank': '은행', 'estate': '부동산',
    'groupbuy': '공동구매', 'skin': '캐릭터', 'item': '아이템', 'convenience': '편의점', 'classitem': '학급상점',
    'lotto': '복권', 'goldenbell': '골든벨', 'speedquiz': '스피드퀴즈', 'raid': '레이드', 'rank': '순위',
    'timetable': '시간표', 'thermo': '온도계', 'chalk': '칠판', 'timer': '타이머', 'lottery': '제비뽑기',
    'vote': '투표', 'rps': '가위바위보', 'boardgames': '보드게임', 'wheel': '돌림판', 'martial': '비상계엄',
    'morning': '아침', 'padlet': '생각판', 'classboard': '학급판', 'openlesson': '공개수업',
}

ORDER = [
    'home', 'plaza', 'quest', 'literature', 'jobs', 'economy', 'lunch', 'challenge', 'constitution', 'classtools', 'admin', 'settings', 'help', 'more',
    'shop', 'bank', 'estate', 'groupbuy', 'skin', 'item', 'convenience', 'classitem', 'lotto',
    'goldenbell', 'speedquiz', 'raid', 'rank',
    'timetable', 'thermo', 'chalk', 'timer', 'lottery', 'vote', 'rps', 'boardgames', 'wheel', 'martial', 'morning', 'padlet', 'classboard', 'openlesson',
]

SIL = {
    'plaza': '<path d="M4.2 14.6h15.6v2.6c0 1.2-2.2 2.4-4.2 2.4H8.4c-2 0-4.2-1.2-4.2-2.4z" fill="var(--gold)"/><path d="M7.2 13.2c1.4-3 3-4.6 4.8-4.6s3.4 1.6 4.8 4.6" fill="none" stroke="var(--gold-rim-hi)" stroke-width="2.2"/>',
    'jobs': '<path d="M4.4 8.2h9.2v3.4H4.4z" fill="var(--gold-rim-hi)"/><rect x="8" y="8.2" width="2.4" height="6.2" fill="var(--gold-rim-lo)"/><path d="M4.6 15.2h14.8l-1.4 3.2H6z" fill="var(--gold)"/>',
    'economy': '<ellipse cx="8.2" cy="15.2" rx="3.4" ry="1.5" fill="var(--gold-rim-lo)"/><ellipse cx="8.2" cy="13.6" rx="3.4" ry="1.5" fill="var(--gold)"/><ellipse cx="8.2" cy="12" rx="3.4" ry="1.5" fill="var(--gold-rim-hi)"/><path d="M13.2 8.2c2.4-1.6 4.6-.4 5.2 1.2-2 .2-3.6 1.2-5.2 2.8 1.2 1.2 3.2 2 5.2 2.2-.4 1.6-2.6 2.6-5.2.8z" fill="var(--gold-light)"/>',
    'lunch': '<path d="M5 12.2h14v2.2c0 2.4-3 4.2-7 4.2s-7-1.8-7-4.2z" fill="var(--gold)"/><ellipse cx="12" cy="12.2" rx="7" ry="2.2" fill="var(--gold-rim-hi)"/>',
    'constitution': '<rect x="7.2" y="4.4" width="6.4" height="14.2" rx="0.6" fill="var(--marble)"/><path d="M15.2 8.2h3.2M16.8 8.2v5.2M14.6 13.4h4.4" fill="none" stroke="var(--gold)" stroke-width="2"/>',
    'classtools': '<ellipse cx="12" cy="12.4" rx="5.2" ry="4.2" fill="var(--gold-light)"/><circle cx="10.2" cy="11.4" r="1.1" fill="var(--ink)"/><circle cx="13.8" cy="11.4" r="1.1" fill="var(--ink)"/><path d="M6.4 8.2c1.4-2.4 3-3.4 5.6-3.4M17.6 8.2c-1.4-2.4-3-3.4-5.6-3.4" fill="none" stroke="var(--gold)" stroke-width="2"/>',
    'admin': '<path d="M4.4 14.6 7 7.2 12 10.6 17 7.2 19.6 14.6z" fill="var(--gold-rim-hi)"/><rect x="5" y="15.2" width="14" height="2.6" rx="0.4" fill="var(--gold)"/>',
    'settings': '<circle cx="12" cy="12.2" r="3.1" fill="var(--gold-rim-hi)"/><path d="M12 5.2v2.2M12 17v2.2M5.2 12.2h2.2M16.6 12.2h2.2M7.2 7.4l1.6 1.6M15.2 15.4l1.6 1.6M16.8 7.4l-1.6 1.6M8.8 15.4l-1.6 1.6" stroke="var(--gold)" stroke-width="2.1" stroke-linecap="square"/>',
    'help': '<path d="M12 4.6c2.4 2.2 3.4 3.6 3.4 5.4 0 2.2-1.6 3.4-3.4 5.2-1.8-1.8-3.4-3-3.4-5.2 0-1.8 1-3.2 3.4-5.4z" fill="var(--gold-rim-hi)"/><rect x="10.8" y="14.6" width="2.4" height="4.4" fill="var(--gold)"/>',
    'more': '<rect x="4.2" y="7.2" width="15.6" height="9.2" rx="1.6" fill="var(--gold)"/><circle cx="8" cy="11.8" r="1.35" fill="var(--gold-rim-hi)"/><circle cx="12" cy="11.8" r="1.35" fill="var(--gold-rim-hi)"/><circle cx="16" cy="11.8" r="1.35" fill="var(--gold-rim-hi)"/>',
    'bank': '<path d="M4.2 9.4 12 4.6l7.8 4.8z" fill="var(--gold-rim-lo)"/><rect x="6" y="9.6" width="2.6" height="6.2" fill="var(--gold)"/><rect x="10.7" y="9.6" width="2.6" height="6.2" fill="var(--gold)"/><rect x="15.4" y="9.6" width="2.6" height="6.2" fill="var(--gold)"/><rect x="7.6" y="11.4" width="8.8" height="3.2" rx="0.4" fill="var(--navy)"/>',
    'estate': '<path d="M3.8 12.2 12 6.2l8.2 6z" fill="var(--gold-rim-hi)"/><rect x="6.2" y="12" width="11.6" height="6" fill="var(--marble)"/><rect x="10.4" y="13.6" width="3.2" height="4.4" fill="var(--gold)"/>',
    'groupbuy': '<path d="M5.2 15.4c1.6-3.2 3.2-4.6 4.2-4.2 1 .4.6 2.2-.4 3.6M14.6 11.2c1-.2 2.8 1 4.2 4.2M8.4 14.2c1.2-2.6 2.4-3.6 3.6-3.2 1.2.4.8 2.4-.2 4" fill="none" stroke="var(--gold-light)" stroke-width="2.2" stroke-linecap="round"/><path d="M9.2 8.2h5.6l.8 3.2H8.4z" fill="var(--gold)"/>',
    'skin': '<path d="M8 6.4c2.2-1.6 5.8-1.6 8 0 1.2 3.2.4 6.4-1.6 8.2H9.6C7.6 12.8 6.8 9.6 8 6.4z" fill="var(--gold-light)"/><path d="M9.2 10.2h2.2M12.6 10.2h2.2" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>',
    'item': '<path d="M5.2 10.2h13.6l-1.4 7.2H6.6z" fill="var(--gold)"/><path d="M8 10.2c0-2.4 1.6-4 4-4s4 1.6 4 4" fill="none" stroke="var(--gold-rim-lo)" stroke-width="2.2"/>',
    'convenience': '<path d="M4.6 8.2h14.8v2.4H4.6z" fill="var(--gold-rim-hi)"/><rect x="6.4" y="11" width="11.2" height="6.2" rx="0.6" fill="var(--gold)"/>',
    'classitem': '<path d="M4.6 10.2h14.8v7.2H4.6z" fill="var(--gold)"/><path d="M4.6 10.2 12 6.4l7.4 3.8" fill="var(--gold-rim-hi)"/>',
    'lotto': '<rect x="5.2" y="7.2" width="9.4" height="9.6" rx="0.8" fill="var(--gold-light)" transform="rotate(-8 10 12)"/><circle cx="16.4" cy="14.6" r="2.3" fill="var(--surface)"/><circle cx="16.2" cy="8.4" r="2.1" fill="var(--gold-rim-hi)"/>',
    'goldenbell': '<path d="M7 8.4c0 4 2.2 6.6 5 6.6s5-2.6 5-6.6c-1.6 1.4-3.2 2-5 2s-3.4-.6-5-2z" fill="var(--gold-rim-hi)"/><rect x="10.6" y="14.6" width="2.8" height="3.2" fill="var(--gold)"/>',
    'speedquiz': '<path d="M6.4 8.2h8.4l2.2 2.4V17H6.4z" fill="var(--gold-light)"/><path d="M14.2 6.2c2.2.2 3.6 1.6 4.2 3.2-1.6.2-2.8 1-3.6 2.2" fill="none" stroke="var(--gold)" stroke-width="2"/>',
    'raid': '<circle cx="12" cy="12.2" r="6.4" fill="var(--gold)"/><path d="M12.6 7.4 9.2 12.4h2.4l-.8 4.2 3.6-5.4h-2.4z" fill="var(--gold-rim-hi)"/>',
    'rank': '<circle cx="12" cy="11.2" r="4.2" fill="var(--gold-rim-hi)"/><path d="M7.2 16.8c1.2-2 2.8-2.8 4.8-2.8s3.6.8 4.8 2.8" fill="none" stroke="var(--laurel)" stroke-width="2.2"/>',
    'timetable': '<circle cx="12" cy="12.2" r="6.2" fill="none" stroke="var(--gold)" stroke-width="2.4"/><path d="M12 8.4v4.2l2.6 1.6" fill="none" stroke="var(--gold-rim-lo)" stroke-width="2"/>',
    'thermo': '<rect x="10.2" y="4.4" width="3.6" height="12.2" rx="1.8" fill="var(--surface)" stroke="var(--gold)" stroke-width="2"/><circle cx="12" cy="16.6" r="2.3" fill="var(--wine)"/>',
    'timer': '<path d="M8.2 5.2h7.6M9 6.4c0 3.2 6 3.2 6 6.4S9 16 9 19.2M15 6.4c0 3.2-6 3.2-6 6.4s6 3.2 6 6.4" fill="none" stroke="var(--gold)" stroke-width="2.1"/>',
    'lottery': '<path d="M7.2 8.4h9.6l-1.2 9.2H8.4z" fill="var(--gold)"/><path d="M12 5.2v4" stroke="var(--gold-rim-lo)" stroke-width="2.2" stroke-linecap="round"/>',
    'vote': '<path d="M7.2 8.4h9.6v9.2H7.2z" fill="var(--marble)" stroke="var(--gold)" stroke-width="2"/><circle cx="16.6" cy="15.8" r="1.7" fill="var(--gold-rim-hi)"/>',
    'boardgames': '<rect x="4.6" y="5.2" width="14.8" height="13.6" rx="1.2" fill="var(--marble)" stroke="var(--gold)" stroke-width="2"/><circle cx="9" cy="10" r="1.5" fill="var(--gold)"/><circle cx="15" cy="14" r="1.5" fill="var(--ink)"/>',
    'martial': '<circle cx="12" cy="12.2" r="6.6" fill="var(--gold)" stroke="var(--gold-rim-lo)" stroke-width="2"/><circle cx="12" cy="12.2" r="2.2" fill="var(--gold-rim-hi)"/>',
    'morning': '<circle cx="8.4" cy="10" r="3.4" fill="var(--gold-rim-hi)"/><rect x="11.2" y="8.2" width="7.2" height="8.4" rx="0.6" fill="var(--gold-light)"/>',
    'padlet': '<rect x="4.2" y="6.2" width="4.4" height="11" rx="0.5" fill="var(--gold-light)"/><rect x="9.8" y="6.2" width="4.4" height="11" rx="0.5" fill="var(--surface)"/><rect x="15.4" y="6.2" width="4.4" height="11" rx="0.5" fill="var(--gold-light)"/>',
    'classboard': '<rect x="4.4" y="5.2" width="15.2" height="12.4" rx="1.2" fill="var(--marble)" stroke="var(--gold)" stroke-width="2.2"/><rect x="7" y="8" width="4.2" height="3.2" fill="var(--gold-light)"/>',
    'openlesson': '<path d="M4.2 16.8V8.4L12 5.2l7.8 3.2v8.4" fill="none" stroke="var(--gold)" stroke-width="2.2"/><path d="M9.2 11.2h5.6v5.6H9.2z" fill="var(--gold-light)"/>',
}


def fit(art):
    pad = INNER['w'] * 0.03
    max_w = INNER['w'] - pad * 2
    max_h = INNER['h'] - pad * 2
    scale = min(max_w / art.width, max_h / art.height)
    resized = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.Resampling.LANCZOS)
    layer = Image.new('RGBA', FRAME.size, (0, 0, 0, 0))
    ox = round(INNER['x'] + (INNER['w'] - resized.width) / 2)
    oy = round(INNER['y'] + (INNER['h'] - resized.height) / 2)
    layer.paste(resized, (ox, oy), resized)
    return clip_to(layer, plate_mask(FRAME.size))


def write_svg(icon_id):
    body = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img">
  <title>{LABELS[icon_id]}</title>
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
  </defs>
  <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" fill="url(#rim)"/>
  <rect x="1.75" y="1.75" width="20.5" height="20.5" rx="4.25" fill="url(#enamel)"/>
  {SIL[icon_id]}
</svg>
'''
    (OUT / 'svg24' / f'{icon_id}.svg').write_text(body, encoding='utf-8')


def save_canvas(icon_id, canvas):
    canvas.resize((512, 512), Image.Resampling.LANCZOS).save(OUT / '512' / f'{icon_id}.png')
    for size in (96, 192, 288):
        canvas.resize((size, size), Image.Resampling.LANCZOS).save(
            OUT / 'webp' / str(size) / f'{icon_id}.webp', 'WEBP', quality=92, method=6
        )


def main():
    for folder in ['512', 'webp/96', 'webp/192', 'webp/288', 'svg24']:
        (OUT / folder).mkdir(parents=True, exist_ok=True)
    enhanced = ROOT / 'enhanced'
    for icon_id in KEEP:
        for folder, ext in [('512', 'png'), ('webp/96', 'webp'), ('webp/192', 'webp'), ('webp/288', 'webp'), ('svg24', 'svg')]:
            src = enhanced / folder / f'{icon_id}.{ext}'
            dest = OUT / folder / f'{icon_id}.{ext}'
            dest.write_bytes(src.read_bytes())
        print('keep', icon_id)
    for icon_id in NEW:
        art = key_image(SRC / f'oly41-{icon_id}.jpg')
        canvas = FRAME.copy()
        canvas.alpha_composite(fit(art))
        save_canvas(icon_id, canvas)
        write_svg(icon_id)
        print('new', icon_id, art.size)
    missing = [i for i in ORDER if not (OUT / '512' / f'{i}.png').exists()]
    print('count', len(ORDER), 'missing', missing)


if __name__ == '__main__':
    main()
