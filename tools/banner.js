const fs = require('fs');
const { build, rasterize } = require('./mesh.js');
const { boxGlyph, nodeGlyph, boxName, glyphDefs, word, PACKET } = require('./glyphs.js');

const MONO = "Consolas,'Lucida Console',Monaco,'DejaVu Sans Mono','Liberation Mono',ui-monospace,monospace";
const out = process.argv[2] || 'assets';
const W = 1000, H = 292;
const PANE = [8, 26, 524, 252];
const TX = 560;

const THEMES = {
  dark: {
    frame: '#30363d', frameDim: '#21262d', trace: '#4d5866',
    textPrimary: '#e6edf3', textDim: '#7d8590', textFaint: '#616b76',
    accent: '#3fb950', packet: '#39d353',
  },
  light: {
    frame: '#d0d7de', frameDim: '#e4e8ec', trace: '#aab5c2',
    textPrimary: '#1f2328', textDim: '#59636e', textFaint: '#818b96',
    accent: '#1a7f37', packet: '#1a7f37',
  },
};

const f = (n) => +n.toFixed(2);

// русские числительные: 21 репозиторий, 22 репозитория, 25 репозиториев
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  const w = (a > 10 && a < 20) ? many : b === 1 ? one : (b >= 2 && b <= 4) ? few : many;
  return `${n} ${w}`;
}

function prng(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pane(x0, y0, x1, y1, label, c) {
  const lx = x0 + 14, lw = label.length * 6.7 + 8;
  const L = (a, b, d, e) => `<line x1="${a}" y1="${b}" x2="${d}" y2="${e}" stroke="${c.frame}" stroke-width="1"/>`;
  return `${L(x0, y0, lx - 5, y0)}${L(lx + lw, y0, x1, y0)}${L(x1, y0, x1, y1)}${L(x1, y1, x0, y1)}${L(x0, y1, x0, y0)}
  <text x="${lx}" y="${y0 + 3.5}" font-family="${MONO}" font-size="10" letter-spacing="1.6" fill="${c.textDim}">${label}</text>`;
}

function emit(theme) {
  const c = THEMES[theme];
  const graph = build();
  const { cells, COLS, ROWS } = rasterize(graph);
  const rnd = prng(29);

  const IX = PANE[0] + 1, IY = PANE[1] + 1;
  const CW = (PANE[2] - PANE[0] - 2) / COLS, CH = (PANE[3] - PANE[1] - 2) / ROWS;
  const px = (col) => f(IX + col * CW), py = (row) => f(IY + row * CH);

  const used = new Map();
  const need = (id, rows) => { if (!used.has(id)) used.set(id, rows); return id; };

  // --- подписи строк: язык своим цветом, следом число репозиториев ---
  const headers = graph.rows.map(rw =>
    `<text x="${f(px(graph.LABEL) - 7)}" y="${f(py(rw.row) + CH / 2 + 3)}" font-family="${MONO}" font-size="8.5" text-anchor="end" fill="${rw.color}">${rw.short}<tspan fill="${c.textFaint}" dx="5">${rw.repos.length}</tspan></text>`
  ).join('');

  // --- клетки схемы ---
  const placements = cells.map(cell => {
    if (cell.node) {
      const n = cell.node;
      const id = need('n' + n.level, nodeGlyph(n.level));
      const op = f(0.36 + n.fresh * 0.4 + n.level * 0.05);
      const dur = f(9 - n.fresh * 4.5), begin = f(rnd() * 11);
      return `<use href="#${id}" x="${px(cell.c)}" y="${py(cell.r)}" fill="${n.color}" opacity="${op}">
      <animate attributeName="opacity" values="${op};${f(Math.min(1, op + 0.4))};${op}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="discrete"/></use>`;
    }
    const id = need(boxName(cell.u, cell.d, cell.l, cell.ri), boxGlyph(cell.u, cell.d, cell.l, cell.ri));
    return `<use href="#${id}" x="${px(cell.c)}" y="${py(cell.r)}" fill="${c.trace}"/>`;
  }).join('');

  // --- пакеты по самым длинным связям: перескакивают по клеткам ---
  const pid = need('pk', PACKET);
  const routes = graph.edges.filter(e => e.span && e.cells.length > 5)
    .sort((a, b) => b.cells.length - a.cells.length).slice(0, 8);
  const packets = routes.filter((_, k) => k % 2 === 0).slice(0, 4).map((e, k) => {
    const pts = e.cells;
    const path = pts.map((p, i) => (i ? 'L' : 'M') + px(p[0]) + ' ' + py(p[1])).join(' ');
    const keys = pts.map((_, i) => f(i / (pts.length - 1))).join(';');
    const dur = f(pts.length * 0.24 + 1.4), begin = f(k * 2.4 + rnd() * 2.0);
    return `<use href="#${pid}" fill="${c.packet}" opacity="0">
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.94;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="discrete" keyPoints="${keys}" keyTimes="${keys}" path="${path}"/></use>`;
  }).join('');

  // --- аннотация: крупнейшее семейство. Имя не пишем — репозитории приватные ---
  const famRepos = {}, famLangs = {};
  graph.nodes.forEach(n => {
    famRepos[n.fam] = (famRepos[n.fam] || 0) + 1;
    (famLangs[n.fam] = famLangs[n.fam] || new Set()).add(n.lang);
  });
  const top = Object.keys(famRepos).sort((a, b) => famRepos[b] - famRepos[a])[0];
  const note = `<text x="${px(19)}" y="${f(py(6) + CH / 2 + 3)}" font-family="${MONO}" font-size="9" fill="${c.textDim}">крупнейший проект</text>
  <text x="${px(19)}" y="${f(py(7.3) + CH / 2 + 3)}" font-family="${MONO}" font-size="9" fill="${c.textFaint}">${plural(famRepos[top], 'репозиторий', 'репозитория', 'репозиториев')}<tspan fill="${c.frame}"> · </tspan>${plural(famLangs[top].size, 'язык', 'языка', 'языков')}</text>`;

  const defs = glyphDefs([...used.entries()], CW / 5, CH / 7);
  const mark = word('DUFA', TX, 92, 13, 16, c.textPrimary);
  const sep = `<tspan fill="${c.accent}"> | </tspan>`;
  const dot = `<tspan fill="${c.frame}"> · </tspan>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="ttl dsc">
  <title id="ttl">DUFA — systems, networks, firmware, gamedev</title>
  <desc id="dsc">Схема репозиториев: строка — язык, точка — репозиторий (размер по объёму кода), линия — репозитории одного проекта. Семейство hexora охватывает восемь языков.</desc>
  <defs>${defs}</defs>

  ${pane(PANE[0] + 0.5, PANE[1] + 0.5, PANE[2] + 0.5, PANE[3] + 0.5, 'repo.graph', c)}
  ${headers}
  <g>${placements}${packets}</g>
  ${note}
  <text x="${PANE[0] + 2}" y="${PANE[3] + 16}" font-family="${MONO}" font-size="8.5" fill="${c.textFaint}">строка = язык${dot}точка = репозиторий, размер по объёму кода${dot}линия = один проект</text>

  <text x="${TX}" y="78" font-family="${MONO}" font-size="11" letter-spacing="4.5" fill="${c.textDim}">@DUFA14</text>
  ${mark.svg}
  <line x1="${TX}" y1="204" x2="946" y2="204" stroke="${c.frameDim}" stroke-width="1"/>
  <text x="${TX}" y="226" font-family="${MONO}" font-size="11.5" letter-spacing="1.4" fill="${c.textDim}">systems${sep}networks${sep}firmware${sep}gamedev</text>
</svg>
`;
}

for (const t of Object.keys(THEMES)) {
  fs.writeFileSync(`${out}/banner-${t}.svg`, emit(t));
  console.log(`banner-${t}.svg`, fs.statSync(`${out}/banner-${t}.svg`).size, 'bytes');
}
