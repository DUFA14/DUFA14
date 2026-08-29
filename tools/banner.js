const fs = require('fs');
const { W, H, build, mulberry32 } = require('./mesh.js');
const { word } = require('./glyphs.js');

// прямоугольные моноширинные, доступные без загрузки: Consolas (Win), Monaco (mac), DejaVu (Linux)
const MONO = "Consolas,'Lucida Console',Monaco,'DejaVu Sans Mono','Liberation Mono',ui-monospace,monospace";
const out = process.argv[2] || 'assets';

const THEMES = {
  dark: {
    frame: '#30363d', frameDim: '#21262d', edge: '#39434f', signal: '#2ea043',
    levels: ['#0e4429', '#006d32', '#26a641', '#39d353'], packet: '#39d353',
    textPrimary: '#e6edf3', textDim: '#7d8590', accent: '#3fb950',
  },
  light: {
    frame: '#d0d7de', frameDim: '#e4e8ec', edge: '#ccd4dd', signal: '#2da44e',
    levels: ['#aceebb', '#4ac26b', '#2da44e', '#116329'], packet: '#1a7f37',
    textPrimary: '#1f2328', textDim: '#59636e', accent: '#1a7f37',
  },
};

const f = (n) => +n.toFixed(2);
const levelOf = (d) => d >= 7 ? 3 : d >= 6 ? 2 : d >= 4 ? 1 : 0;

// панель в духе TUI: рамка с разрывом под заголовок
function pane(x0, y0, x1, y1, label, c) {
  const lx = x0 + 14, lw = label.length * 6.7 + 8;
  const L = (a, b, d, e) => `<line x1="${a}" y1="${b}" x2="${d}" y2="${e}" stroke="${c.frame}" stroke-width="1"/>`;
  return `${L(x0, y0, lx - 5, y0)}${L(lx + lw, y0, x1, y0)}${L(x1, y0, x1, y1)}${L(x1, y1, x0, y1)}${L(x0, y1, x0, y0)}
  <text x="${lx}" y="${y0 + 3.5}" font-family="${MONO}" font-size="10" letter-spacing="1.6" fill="${c.textDim}">${label}</text>`;
}

const PANE = [8, 26, 524, 254];
const TX = 560;

function emit(theme) {
  const c = THEMES[theme];
  const { nodes, edges } = build(11);
  const rnd = mulberry32(29);

  const deg = nodes.map(() => 0);
  edges.forEach(e => { deg[e.i]++; deg[e.j]++; });
  edges.forEach(e => { e.z = (nodes[e.i].z + nodes[e.j].z) / 2; });

  const seg = (e) => `M ${nodes[e.i].x} ${nodes[e.i].y} L ${nodes[e.j].x} ${nodes[e.j].y}`;

  const edgeEls = [...edges].sort((a, b) => a.z - b.z).map(e =>
    `<path d="${seg(e)}" fill="none" stroke="${c.edge}" stroke-width="${f(0.6 + e.z)}" opacity="${f(0.36 + e.z * 0.5)}"/>`
  ).join('');

  // узлы — квадраты: в одной логике с блочным вордмарком
  const nodeEls = nodes.map((n, i) => ({ n, i })).sort((a, b) => a.n.z - b.n.z).map(({ n, i }) => {
    const lvl = levelOf(deg[i]);
    const s = f(3.2 + n.z * 3.4 + lvl * 0.9);
    const base = f(0.44 + n.z * 0.46);
    const dur = f(6 + rnd() * 6), begin = f(rnd() * 12);
    return `<rect x="${f(n.x - s / 2)}" y="${f(n.y - s / 2)}" width="${s}" height="${s}" fill="${c.levels[lvl]}" opacity="${base}">
      <animate attributeName="opacity" values="${base};${f(Math.min(1, base + 0.42))};${base}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></rect>`;
  }).join('');

  const bridges = [...edges].sort((a, b) => b.d - a.d).slice(0, 14);
  const wave = (k) => f((k % 3) * 4.2 + rnd() * 3.0);

  const signals = bridges.filter((_, k) => k % 3 === 0).slice(0, 5).map((e, k) => {
    const dash = 22, dur = f(4.2 + rnd() * 3.0), tail = f(e.d * 1.4);
    return `<path d="${seg(e)}" fill="none" stroke="${c.signal}" stroke-width="1.3" opacity="0.8" stroke-dasharray="${dash} ${tail}" stroke-dashoffset="${f(tail + dash)}">
      <animate attributeName="stroke-dashoffset" values="${f(tail + dash)};${-dash}" dur="${dur}s" begin="${wave(k)}s" repeatCount="indefinite"/></path>`;
  }).join('');

  const packets = bridges.filter((_, k) => k % 3 === 1).slice(0, 5).map((e, k) => {
    const dur = f(5.0 + rnd() * 3.5), b = wave(k + 1);
    return `<rect x="-2" y="-2" width="4" height="4" fill="${c.packet}" opacity="0">
      <animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.14;0.86;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>
      <animateMotion dur="${dur}s" begin="${b}s" repeatCount="indefinite" path="${seg(e)}"/></rect>`;
  }).join('');

  const mark = word('DUFA', TX, 92, 13, 16, c.textPrimary);
  const sep = `<tspan fill="${c.accent}"> | </tspan>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="ttl dsc">
  <title id="ttl">DUFA — systems, networks, firmware, gamedev</title>
  <desc id="dsc">Панель с mesh-сетью: узлы разной глубины, связи построены графом Габриэля.</desc>
  <defs><clipPath id="paneClip"><rect x="${PANE[0] + 1}" y="${PANE[1] + 1}" width="${PANE[2] - PANE[0] - 2}" height="${PANE[3] - PANE[1] - 2}"/></clipPath></defs>

  ${pane(PANE[0] + 0.5, PANE[1] + 0.5, PANE[2] + 0.5, PANE[3] + 0.5, 'net.topology', c)}
  <g clip-path="url(#paneClip)">${edgeEls}${signals}${nodeEls}${packets}</g>

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
