/**
 * 체스 기물 SVG.
 * 기기마다 다른 이모지 글꼴 대신, 상아/흑철 재질의 자체 그림을 씁니다.
 */

import { chessPieceColor, chessPieceType } from './chessGame.js';

const PATHS = Object.freeze({
    p: 'M32 14c-5.4 0-9.6 4.4-9.2 9.6.2 2.8 1.6 5.2 3.8 6.8-5.2 2.4-9 7.8-9.6 14H14v6h36v-6H46.8c-.6-6.2-4.4-11.6-9.6-14 2.2-1.6 3.6-4 3.8-6.8C41.4 18.4 37.4 14 32 14z',
    n: 'M18 52h28v-6H42c-.4-6.2-2.2-10.4-7.2-14.6 4.2-1.2 8.6-1.6 11.4-5.2 2.2-2.8 2.4-7.2.2-10.2-2.6-3.6-7.6-4.2-11.6-2.4-1.4-3.8-5-7.6-10.6-8.2-2.2-.2-4.4.8-5.2 2.8-.8 2 0 4 2.2 5.2-2.6 1.4-4.2 4-3.8 6.8.6 4.2 4.2 6.6 6.6 9.4-4.6 2.6-8.2 7.6-8.8 14.4H18v6z',
    b: 'M32 10c-2.2 0-3.6 2.2-2.4 4.2-3.6 3.2-6.4 7.8-6.8 13.2-.4 6.2 2.4 11.4 6.6 15.2-5.2 1.8-9 6.6-9.6 12.4H16v5h32v-5h-3.8c-.6-5.8-4.4-10.6-9.6-12.4 4.2-3.8 7-9 6.6-15.2-.4-5.4-3.2-10-6.8-13.2C35.6 12.2 34.2 10 32 10zm0 9.2c2.4 0 4.4 2.6 4.4 5.8S34.4 30.8 32 30.8 27.6 28.2 27.6 25 29.6 19.2 32 19.2z',
    r: 'M14 14h8v8h4V14h12v8h4V14h8v16h-4.2l-1.6 18H19.8L18.2 30H14V14zm6 40h24v6H20v-6z',
    q: 'M12 18l6.2-8 5.4 8.8L32 10l8.4 8.8L45.8 10 52 18l-4 6c1.6 4.2.6 9.2-2.2 13.2 4 2.8 6.6 7.6 6.4 12.8H12.8c-.2-5.2 2.4-10 6.4-12.8-2.8-4-3.8-9-2.2-13.2L12 18zM16 52h32v6H16v-6z',
    k: 'M29 8h6v6h6v6h-6v5.2c6.4.8 11.4 5.2 13.2 11.2l3.8 1.6-3 7.2-4.8-2c-1.2 3.8-3.8 6.8-7.4 8.6v6.2h12v6H16v-6h12v-6.2c-3.6-1.8-6.2-4.8-7.4-8.6l-4.8 2-3-7.2 3.8-1.6C18.6 30.4 23.6 26 30 25.2V20h-6v-6h6V8z',
});

function palette(color) {
    if (color === 'b') {
        return {
            body: '#1b1f27',
            mid: '#2c3340',
            light: '#8b93a1',
            shine: '#d7dde6',
            edge: '#0b0d11',
            shade: '#0a0c10',
        };
    }
    return {
        body: '#f3e2c2',
        mid: '#e7cf9f',
        light: '#fff6e4',
        shine: '#ffffff',
        edge: '#8a6430',
        shade: '#c4a36a',
    };
}

export function chessPieceSvg(piece, { uid = '0' } = {}) {
    const type = chessPieceType(piece);
    const color = chessPieceColor(piece);
    const d = PATHS[type];
    if (!d || !color) return '';
    const pal = palette(color);
    const gid = `cp${color}${type}${String(uid).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const side = color === 'b' ? '흑철' : '상아';
    const name = { p: '폰', n: '나이트', b: '비숍', r: '룩', q: '퀸', k: '킹' }[type] || '말';
    return `<svg class="chess-piece-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${gid}g" x1="18%" y1="8%" x2="82%" y2="94%">
      <stop offset="0%" stop-color="${pal.light}"/>
      <stop offset="42%" stop-color="${pal.mid}"/>
      <stop offset="100%" stop-color="${pal.body}"/>
    </linearGradient>
    <linearGradient id="${gid}s" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="${pal.shine}" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="${pal.shine}" stop-opacity="0"/>
    </linearGradient>
    <filter id="${gid}f" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2.2" stdDeviation="1.4" flood-color="${pal.shade}" flood-opacity="0.65"/>
    </filter>
  </defs>
  <title>${side} ${name}</title>
  <path d="${d}" fill="url(#${gid}g)" stroke="${pal.edge}" stroke-width="2.1" stroke-linejoin="round" filter="url(#${gid}f)"/>
  <path d="${d}" fill="url(#${gid}s)" opacity="0.9"/>
</svg>`;
}

export function chessPieceHtml(piece, sq = 0) {
    if (!piece) return '';
    return `<span class="chess-piece chess-piece-${chessPieceColor(piece)} chess-piece-${chessPieceType(piece)}">${chessPieceSvg(piece, { uid: sq })}</span>`;
}
