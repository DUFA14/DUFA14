const fs = require('fs');
const { buildGrid, mulberry32 } = require('./mesh.js');
const { word } = require('./glyphs.js');

const MONO = "Consolas,'Lucida Console',Monaco,'DejaVu Sans Mono','Liberation Mono',ui-monospace,monospace";
const out = process.argv[2] || 'assets';
const W = 1000, H = 280;

const THEMES = {
  dark: {
    frame: '#30363d', frameDim: '#21262d', grid: '#8b949e', trace: '#454f5e', signal: '#2ea043',
    levels: ['#0e4429', '#006d32', '#26a641', '#39d353'], packet: '#39d353',
    textPrimary: '#e6edf3', textDim: '#7d8590', accent: '#3fb950',
  },
  light: {
    frame: '#d0d7de', frameDim: '#e4e8ec', grid: '#8c959f', trace: '#c2ccd6', signal: '#2da44e',
    levels: ['#aceebb', '#4ac26b', '#2da44e', '#116329'], packet: '#1a7f37',
    textPrimary: '#1f2328', textDim: '#59636e', accent: '#1a7f37',
  },
};

const f = (n) => +n.toFixed(2);
const PANE = [8, 26, 524, 254];
const CELL = 11.5, TX = 560;
const levelOf = (d) => d >= 4 ? 3 : d >= 3 ? 2 : d >= 2 ? 1 : 0;

function pane(x0, y0, x1, y1, label, c) {
  const lx = x0 + 14, lw = label.length * 6.7 + 8;
  const L = (a, b, d, e) => `<line x1="${a}" y1="${b}" x2="${d}" y2="${e}" stroke="${c.frame}" stroke-width="1"/>`;
  return `${L(x0, y0, lx - 5, y0)}${L(lx + lw, y0, x1, y0)}${L(x1, y0, x1, y1)}${L(x1, y1, x0, y1)}${L(x0, y1, x0, y0)}
  <text x="${lx}" y="${y0 + 3.5}" font-family="${MONO}" font-size="10" letter-spacing="1.6" fill="${c.textDim}">${label}</text>`;
}

function emit(theme) {
  const c = THEMES[theme];
  const { nodes, edges } = buildGrid(11);
  const rnd = mulberry32(29);

  const X0 = PANE[0] + 1 + CELL / 2, Y0 = PANE[1] + 1 + CELL / 2;
  const px = (col) => f(X0 + col * CELL), py = (row) => f(Y0 + row * CELL);

  // трасса: только прямые углы, поворот в заранее посчитанной точке
  const trace = (e) => {
    const a = nodes[e.i], b = nodes[e.j];
    return `M ${px(a.c)} ${py(a.r)} L ${px(e.corner.c)} ${py(e.corner.r)} L ${px(b.c)} ${py(b.r)}`;
  };
  const traceLen = (e) => {
    const a = nodes[e.i], b = nodes[e.j];
    return (Math.abs(a.c - b.c) + Math.abs(a.r - b.r)) * CELL;
  };

  const traces = edges.map(e =>
    `<path d="${trace(e)}" fill="none" stroke="${c.trace}" stroke-width="1.2" stroke-linecap="square" stroke-linejoin="miter"/>`
  ).join('');

  // мигание дискретное: в терминале яркость переключается, а не нарастает
  const nodeEls = nodes.map((n) => {
    const lvl = levelOf(n.deg);
    const s = 5 + lvl * 1.6;
    const dur = f(5 + rnd() * 6), begin = f(rnd() * 11);
    const lo = f(0.5 + lvl * 0.08);
    return `<rect x="${f(px(n.c) - s / 2)}" y="${f(py(n.r) - s / 2)}" width="${s}" height="${s}" fill="${c.levels[lvl]}" opacity="${lo}">
      <animate attributeName="opacity" values="${lo};1;${lo}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="discrete"/></rect>`;
  }).join('');

  const long = [...edges].sort((a, b) => traceLen(b) - traceLen(a)).slice(0, 12);
  const wave = (k) => f((k % 3) * 4.0 + rnd() * 2.6);

  const signals = long.filter((_, k) => k % 3 === 0).slice(0, 4).map((e, k) => {
    const len = traceLen(e), dash = 20, tail = f(len * 1.4), dur = f(4.0 + rnd() * 2.6);
    return `<path d="${trace(e)}" fill="none" stroke="${c.signal}" stroke-width="1.2" stroke-linecap="square" opacity="0.85" stroke-dasharray="${dash} ${tail}" stroke-dashoffset="${f(tail + dash)}">
      <animate attributeName="stroke-dashoffset" values="${f(tail + dash)};${-dash}" dur="${dur}s" begin="${wave(k)}s" repeatCount="indefinite"/></path>`;
  }).join('');

  const packets = long.filter((_, k) => k % 3 === 1).slice(0, 4).map((e, k) => {
    const dur = f(4.6 + rnd() * 3.0), b = wave(k + 1);
    return `<rect x="-2.5" y="-2.5" width="5" height="5" fill="${c.packet}" opacity="0">
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.88;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>
      <animateMotion dur="${dur}s" begin="${b}s" repeatCount="indefinite" path="${trace(e)}"/></rect>`;
  }).join('');

  const mark = word('DUFA', TX, 92, 13, 16, c.textPrimary);
  const sep = `<tspan fill="${c.accent}"> | </tspan>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="ttl dsc">
  <title id="ttl">DUFA — systems, networks, firmware, gamedev</title>
  <desc id="dsc">Схема сети на сетке знакомест: узлы соединены ортогональными трассами, по ним идут пакеты.</desc>
  <defs>
    <clipPath id="paneClip"><rect x="${PANE[0] + 1}" y="${PANE[1] + 1}" width="${PANE[2] - PANE[0] - 2}" height="${PANE[3] - PANE[1] - 2}"/></clipPath>
    <pattern id="cells" width="${CELL}" height="${CELL}" patternUnits="userSpaceOnUse" x="${f(X0 - CELL / 2)}" y="${f(Y0 - CELL / 2)}">
      <rect x="0" y="0" width="1" height="1" fill="${c.grid}" opacity="0.16"/>
    </pattern>
  </defs>

  ${pane(PANE[0] + 0.5, PANE[1] + 0.5, PANE[2] + 0.5, PANE[3] + 0.5, 'net.topology', c)}
  <g clip-path="url(#paneClip)">
    <rect x="${PANE[0] + 1}" y="${PANE[1] + 1}" width="${PANE[2] - PANE[0] - 2}" height="${PANE[3] - PANE[1] - 2}" fill="url(#cells)"/>
    ${traces}${signals}${nodeEls}${packets}
  </g>

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
