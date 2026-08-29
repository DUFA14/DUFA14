// Растровый алфавит 5x7. Рисуется прямоугольниками, поэтому не зависит от
// шрифтов системы: SVG внутри <img> на GitHub не может подгружать внешние,
// а символы псевдографики есть не в каждом моноширинном.

const W = 5, H = 7, CX = 2, CY = 3;

const LETTERS = {
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

const blank = () => Array.from({ length: H }, () => Array(W).fill(0));
const toStrings = (m) => m.map(row => row.join(''));

// псевдографика собирается из четырёх лучей: вверх, вниз, влево, вправо
function boxGlyph(u, d, l, r) {
  const m = blank();
  if (l) for (let c = 0; c <= CX; c++) m[CY][c] = 1;
  if (r) for (let c = CX; c < W; c++) m[CY][c] = 1;
  if (u) for (let y = 0; y <= CY; y++) m[y][CX] = 1;
  if (d) for (let y = CY; y < H; y++) m[y][CX] = 1;
  if (!u && !d && !l && !r) m[CY][CX] = 1;
  return toStrings(m);
}

// узлы: четыре ступени заметности, как четыре градации яркости в терминале
function nodeGlyph(level) {
  const m = blank();
  const put = (y0, y1, x0, x1, hollow) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!hollow || y === y0 || y === y1 || x === x0 || x === x1) m[y][x] = 1;
    }
  };
  if (level === 0) put(2, 4, 1, 3, true);
  else if (level === 1) put(2, 4, 1, 3, false);
  else if (level === 2) put(1, 5, 0, 4, true);
  else put(1, 5, 0, 4, false);
  return toStrings(m);
}

// packet — заполненный ромб, отличим от узлов на ходу
const PACKET = ['00000', '00100', '01110', '11111', '01110', '00100', '00000'];

// имя глифа псевдографики по маске лучей: u d l r
const boxName = (u, d, l, r) => 'b' + (u ? 'u' : '') + (d ? 'd' : '') + (l ? 'l' : '') + (r ? 'r' : '') || 'bdot';

// <g> для <defs>: прямоугольники без fill, цвет придёт от <use>
function glyphDefs(entries, pxW, pxH, gapRatio = 0.11) {
  const gw = +(pxW * (1 - gapRatio)).toFixed(2), gh = +(pxH * (1 - gapRatio)).toFixed(2);
  return entries.map(([id, rows]) => {
    const rects = [];
    rows.forEach((row, y) => [...row].forEach((bit, x) => {
      if (bit === '1') rects.push(`<rect x="${+(x * pxW).toFixed(2)}" y="${+(y * pxH).toFixed(2)}" width="${gw}" height="${gh}"/>`);
    }));
    return `<g id="${id}">${rects.join('')}</g>`;
  }).join('');
}

// прямая отрисовка (для вордмарка): квадратные пиксели, свой размер клетки
function word(text, x, y, cell, letterGap, fill, gap = cell * 0.17) {
  const out = [];
  let cx = x;
  for (const ch of text) {
    const g = LETTERS[ch];
    if (!g) { cx += cell * W + letterGap; continue; }
    g.forEach((row, r) => [...row].forEach((bit, c) => {
      if (bit === '1') out.push(`<rect x="${(cx + c * cell).toFixed(1)}" y="${(y + r * cell).toFixed(1)}" width="${(cell - gap).toFixed(1)}" height="${(cell - gap).toFixed(1)}" fill="${fill}"/>`);
    }));
    cx += cell * W + letterGap;
  }
  return { svg: out.join(''), width: cx - x - letterGap, height: cell * H - gap };
}

module.exports = { W, H, LETTERS, boxGlyph, nodeGlyph, boxName, glyphDefs, word, PACKET };
