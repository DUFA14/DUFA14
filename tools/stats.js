// Блок активности. Считает календарь контрибуций и рисует SVG под обе темы.
// Запуск в CI: node tools/stats.js <выходная-папка>
// Токен из GITHUB_TOKEN / GH_TOKEN. Календарь публичный — штатного токена Actions хватает.

const fs = require('fs');
const path = require('path');
const { word } = require('./glyphs.js');

const USER = process.env.GH_USER || 'DUFA14';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const OUT = process.argv[2] || 'assets';

const MONO = "Consolas,'Lucida Console',Monaco,'DejaVu Sans Mono','Liberation Mono',ui-monospace,monospace";
const W = 1000, H = 130;

const THEMES = {
  dark:  { frame: '#30363d', textPrimary: '#e6edf3', textDim: '#7d8590', tick: '#21262d' },
  light: { frame: '#d0d7de', textPrimary: '#1f2328', textDim: '#59636e', tick: '#e4e8ec' },
};

async function calendar() {
  if (!TOKEN) throw new Error('нет GITHUB_TOKEN / GH_TOKEN в окружении');
  const query = `{ user(login:"${USER}"){ contributionsCollection {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': USER },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error('GraphQL: ' + JSON.stringify(json.errors));
  return json.data.user.contributionsCollection.contributionCalendar;
}

function metrics(cal) {
  const days = cal.weeks.flatMap(w => w.contributionDays);
  const active = days.filter(d => d.contributionCount > 0);
  let cur = 0, best = 0;
  for (const d of days) { if (d.contributionCount > 0) { if (++cur > best) best = cur; } else cur = 0; }
  return [
    { n: cal.totalContributions, label: 'контрибуций за год' },
    { n: active.length,          label: 'активных дней' },
    { n: best,                   label: 'лучшая серия, дней' },
    { n: Math.max(0, ...days.map(d => d.contributionCount)), label: 'лучший день' },
  ];
}

function pane(x0, y0, x1, y1, label, c) {
  const lx = x0 + 14, lw = label.length * 6.7 + 8;
  const L = (a, b, d, e) => `<line x1="${a}" y1="${b}" x2="${d}" y2="${e}" stroke="${c.frame}" stroke-width="1"/>`;
  return `${L(x0, y0, lx - 5, y0)}${L(lx + lw, y0, x1, y0)}${L(x1, y0, x1, y1)}${L(x1, y1, x0, y1)}${L(x0, y1, x0, y0)}
  <text x="${lx}" y="${y0 + 3.5}" font-family="${MONO}" font-size="10" letter-spacing="1.6" fill="${c.textDim}">${label}</text>`;
}

function render(theme, stats) {
  const c = THEMES[theme];
  const X = 28, COL = (984 - X) / 4;

  const cells = stats.map((s, i) => {
    const x = X + i * COL;
    const tick = i === 0 ? '' :
      `<line x1="${(x - 22).toFixed(1)}" y1="34" x2="${(x - 22).toFixed(1)}" y2="106" stroke="${c.tick}" stroke-width="1"/>`;
    // числа тем же растровым шрифтом, что и вордмарк
    const num = word(String(s.n), x, 40, 6, 7, c.textPrimary);
    return `${tick}
    <g opacity="0">
      <animate attributeName="opacity" values="0;1" dur="0.4s" begin="${(0.1 * i).toFixed(2)}s" fill="freeze"/>
      ${num.svg}
      <text x="${x}" y="${100}" font-family="${MONO}" font-size="11" letter-spacing="0.4" fill="${c.textDim}">${s.label}</text>
    </g>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="st sd">
  <title id="st">Активность за последний год</title>
  <desc id="sd">${stats.map(s => `${s.label}: ${s.n}`).join(', ')}.</desc>
  ${pane(8.5, 8.5, 991.5, 121.5, 'activity.365d', c)}
  ${cells}
</svg>
`;
}

(async () => {
  const stats = metrics(await calendar());
  fs.mkdirSync(OUT, { recursive: true });
  for (const t of Object.keys(THEMES)) {
    const p = path.join(OUT, `stats-${t}.svg`);
    fs.writeFileSync(p, render(t, stats));
    console.log(p, fs.statSync(p).size, 'bytes');
  }
  console.log(stats.map(s => `${s.label}: ${s.n}`).join(' | '));
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
