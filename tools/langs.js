const fs = require('fs');
const data = require('./langs.json');

const MONO = "Consolas,'Lucida Console',Monaco,'DejaVu Sans Mono','Liberation Mono',ui-monospace,monospace";
const out = process.argv[2] || 'assets';
const W = 1000, H = 142, TOP = 9, CELLS = 100;

const THEMES = {
  dark:  { frame: '#30363d', textPrimary: '#e6edf3', textDim: '#7d8590', track: '#21262d', rest: '#484f58' },
  light: { frame: '#d0d7de', textPrimary: '#1f2328', textDim: '#59636e', track: '#eaeef2', rest: '#afb8c1' },
};

const total = data.reduce((s, x) => s + x.bytes, 0);
const top = data.slice(0, TOP);
const rest = total - top.reduce((s, x) => s + x.bytes, 0);
const pct = (b) => (100 * b) / total;

function pane(x0, y0, x1, y1, label, c) {
  const lx = x0 + 14, lw = label.length * 6.7 + 8;
  const L = (a, b, d, e) => `<line x1="${a}" y1="${b}" x2="${d}" y2="${e}" stroke="${c.frame}" stroke-width="1"/>`;
  return `${L(x0, y0, lx - 5, y0)}${L(lx + lw, y0, x1, y0)}${L(x1, y0, x1, y1)}${L(x1, y1, x0, y1)}${L(x0, y1, x0, y0)}
  <text x="${lx}" y="${y0 + 3.5}" font-family="${MONO}" font-size="10" letter-spacing="1.6" fill="${c.textDim}">${label}</text>`;
}

function emit(theme) {
  const c = THEMES[theme];
  const items = [...top.map(x => ({ name: x.lang, color: x.color || c.rest, p: pct(x.bytes) })),
                 { name: 'остальное', color: c.rest, p: pct(rest) }];

  // индикатор из ста клеток: одна клетка = один процент, как в терминале
  const X = 22, PITCH = 9.56, BW = 8.1, BY = 40, BH = 17;
  const cellColor = [];
  let acc = 0;
  items.forEach(it => { const n = Math.round(it.p); for (let k = 0; k < n && acc < CELLS; k++, acc++) cellColor.push(it.color); });
  while (acc < CELLS) { cellColor.push(items[items.length - 1].color); acc++; }

  const cells = cellColor.map((col, i) =>
    `<rect x="${(X + i * PITCH).toFixed(2)}" y="${BY}" width="${BW}" height="${BH}" fill="${col}"/>`).join('');

  const COL = (984 - X) / 5;
  const legend = items.map((it, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    const lx = X + col * COL, ly = row === 0 ? 88 : 112;
    return `<rect x="${lx.toFixed(1)}" y="${ly - 8}" width="8" height="8" fill="${it.color}"/>
    <text x="${(lx + 14).toFixed(1)}" y="${ly}" font-family="${MONO}" font-size="11.5" fill="${c.textPrimary}">${it.name}<tspan fill="${c.textDim}" dx="7">${it.p.toFixed(1)}%</tspan></text>`;
  }).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="lt ld">
  <title id="lt">Языки по объёму кода</title>
  <desc id="ld">${items.map(i => `${i.name} ${i.p.toFixed(1)}%`).join(', ')}.</desc>
  <defs><clipPath id="grow"><rect x="0" y="0" width="0" height="${H}">
    <animate attributeName="width" values="0;${W}" dur="1.1s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"/>
  </rect></clipPath></defs>
  ${pane(8.5, 8.5, 991.5, 133.5, 'languages', c)}
  <rect x="${X}" y="${BY}" width="${(CELLS * PITCH - (PITCH - BW)).toFixed(1)}" height="${BH}" fill="${c.track}"/>
  <g clip-path="url(#grow)">${cells}</g>
  ${legend}
</svg>
`;
}

for (const t of Object.keys(THEMES)) {
  fs.writeFileSync(`${out}/langs-${t}.svg`, emit(t));
  console.log(`langs-${t}.svg`, fs.statSync(`${out}/langs-${t}.svg`).size, 'bytes');
}
