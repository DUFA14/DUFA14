// Схема репозиториев, разложенная на символьную сетку.
//
// Раскладка выбрана так, чтобы её можно было прочитать без пояснений:
//   строка = язык (подписан слева)
//   точка  = репозиторий, ступень размера по объёму кода
//   линия  = один проект: семейство имён (hexora-*, voxel-*)
//
// Смысл виден сразу: семейство hexora прошивает восемь языковых строк —
// один проект, разложенный по всем платформам.

const REPOS = require('./repos.json');

// семейство приходит из repos.json уже обезличенным номером

// длинные имена не влезают в столбец шириной ~43px
const SHORT = { 'TypeScript': 'TS', 'JavaScript': 'JS', 'Wolfram Language': 'Wolfram' };
const shortLang = (l) => SHORT[l] || l;

function build(opt = {}) {
  const LABEL = opt.label || 9;      // клеток сетки под подписи языков слева
  const STEP = opt.step || 3;        // шаг между репозиториями вдоль строки

  const live = REPOS.filter(r => r.bytes > 0);

  // --- строки по языкам, самый населённый сверху ---
  const byLang = {};
  live.forEach(r => { (byLang[r.lang] = byLang[r.lang] || []).push(r); });
  const rows = Object.entries(byLang)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([lang, repos], i) => ({
      lang, short: shortLang(lang), i, row: i,
      color: repos[0].color || '#484f58',
      repos: [...repos].sort((x, y) => y.bytes - x.bytes),
    }));

  // --- узлы: вдоль своей строки слева направо, крупные первыми ---
  const nodes = [];
  rows.forEach(rw => {
    rw.repos.forEach((repo, j) => {
      nodes.push({
        c: LABEL + j * STEP, r: rw.row,
        fam: repo.fam, lang: repo.lang,
        color: rw.color, bytes: repo.bytes, pushed: repo.pushed, rowIdx: rw.i,
      });
    });
  });

  const COLS = LABEL + Math.max(...rows.map(r => r.repos.length)) * STEP;
  const ROWS = rows.length;

  // --- связи одного проекта ---
  const edges = [];
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const fams = {};
  nodes.forEach(n => { (fams[n.fam] = fams[n.fam] || []).push(n); });

  for (const members of Object.values(fams)) {
    if (members.length < 2) continue;

    // внутри строки — связка соседей по горизонтали
    const byRow = {};
    members.forEach(n => { (byRow[n.rowIdx] = byRow[n.rowIdx] || []).push(n); });
    for (const group of Object.values(byRow)) {
      group.sort((a, b) => a.c - b.c);
      for (let k = 0; k + 1 < group.length; k++) edges.push({ i: idx.get(group[k]), j: idx.get(group[k + 1]) });
    }

    // между строками — по одной связи на соседнюю пару, от крупнейшего к крупнейшему
    const reps = Object.keys(byRow).map(Number).sort((a, b) => a - b)
      .map(ri => byRow[ri].reduce((m, n) => n.bytes > m.bytes ? n : m));
    for (let k = 0; k + 1 < reps.length; k++) edges.push({ i: idx.get(reps[k]), j: idx.get(reps[k + 1]), span: true });
  }

  // --- ортогональная разводка; клетки узлов дороги, трассы их обходят ---
  const load = new Map();
  const key = (c, r) => c + ',' + r;
  nodes.forEach(n => load.set(key(n.c, n.r), 40));
  const cost = (cs) => cs.reduce((s, p) => s + (load.get(key(p[0], p[1])) || 0), 0);
  const span = (a, b) => { const s = [], st = a <= b ? 1 : -1; for (let v = a; v !== b + st; v += st) s.push(v); return s; };

  for (const e of edges) {
    const a = nodes[e.i], b = nodes[e.j];
    const varA = [...span(a.c, b.c).map(c => [c, a.r]), ...span(a.r, b.r).map(r => [b.c, r])];
    const varB = [...span(a.r, b.r).map(r => [a.c, r]), ...span(a.c, b.c).map(c => [c, b.r])];
    const cs = cost(varA) <= cost(varB) ? varA : varB;
    e.cells = cs.filter((p, k) => k === 0 || p[0] !== cs[k - 1][0] || p[1] !== cs[k - 1][1]);
    e.cells.forEach(p => {
      const kk = key(p[0], p[1]);
      load.set(kk, (load.get(kk) || 0) + 1);
    });
  }

  // --- ступень по объёму кода и свежесть последнего пуша ---
  const sorted = nodes.map(n => n.bytes).sort((a, b) => a - b);
  const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
  const t1 = q(0.45), t2 = q(0.75), t3 = q(0.92);
  const newest = Math.max(...nodes.map(n => Date.parse(n.pushed)));
  nodes.forEach(n => {
    n.level = n.bytes >= t3 ? 3 : n.bytes >= t2 ? 2 : n.bytes >= t1 ? 1 : 0;
    n.fresh = Math.max(0, Math.min(1, 1 - (newest - Date.parse(n.pushed)) / 864e5 / 400));
  });

  return { nodes, edges, rows, LABEL, COLS, ROWS };
}

// --- растеризация: каждой клетке достаётся маска лучей псевдографики ---
function rasterize(graph) {
  const { nodes, edges, COLS, ROWS } = graph;
  const cells = new Map();
  const at = (c, r) => {
    const k = c + ',' + r;
    if (!cells.has(k)) cells.set(k, { c, r, u: 0, d: 0, l: 0, ri: 0, node: null });
    return cells.get(k);
  };

  for (const e of edges) {
    for (let k = 0; k + 1 < e.cells.length; k++) {
      const p = e.cells[k], n = e.cells[k + 1];
      const A = at(p[0], p[1]), B = at(n[0], n[1]);
      if (n[0] > p[0]) { A.ri = 1; B.l = 1; }
      else if (n[0] < p[0]) { A.l = 1; B.ri = 1; }
      else if (n[1] > p[1]) { A.d = 1; B.u = 1; }
      else if (n[1] < p[1]) { A.u = 1; B.d = 1; }
    }
  }
  nodes.forEach(n => { at(n.c, n.r).node = n; });

  return { cells: [...cells.values()], COLS, ROWS };
}

module.exports = { build, rasterize };
