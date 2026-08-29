// Граф в терминальной логике: узлы стоят на знакоместах, трассы идут
// только по горизонтали и вертикали. Никаких диагоналей и плавной глубины —
// в TUI всё дискретно.
//
//   1. Точки набрасываются по полю value-noise -> связные сгущения и пустоты
//      (обычный Math.random даёт равномерную кашу без структуры).
//   2. Связи — RNG, relative neighborhood graph: ребро AB есть, если нет
//      точки C, которая ближе и к A, и к B одновременно. Разреженнее графа
//      Габриэля, поэтому ортогональные трассы не слипаются.
//   3. Каждое ребро разводится буквой Г; направление выбирается по тому,
//      какой вариант меньше накладывается на уже занятые клетки.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rnd, N) {
  const g = [];
  for (let i = 0; i <= N; i++) { g[i] = []; for (let j = 0; j <= N; j++) g[i][j] = rnd(); }
  const sm = t => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = Math.max(0, Math.min(N - 1e-6, u * N)), y = Math.max(0, Math.min(N - 1e-6, v * N));
    const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
    const a = g[i][j] * (1 - fx) + g[i + 1][j] * fx;
    const b = g[i][j + 1] * (1 - fx) + g[i + 1][j + 1] * fx;
    return a * (1 - fy) + b * fy;
  };
}

function buildGrid(seed, opt = {}) {
  const COLS = opt.cols || 44, ROWS = opt.rows || 19;
  const TARGET = opt.n || 35, MIND = opt.mind || 3;
  const rnd = mulberry32(seed);
  const density = makeNoise(rnd, 4);

  // --- узлы на знакоместах ---
  const nodes = [];
  let tries = 0;
  while (nodes.length < TARGET && tries < 40000) {
    tries++;
    const c = 1 + Math.floor(rnd() * (COLS - 2));
    const r = 1 + Math.floor(rnd() * (ROWS - 2));
    const d = 0.46 + 0.54 * density(c / COLS, r / ROWS);
    if (rnd() > Math.pow(d, 1.3)) continue;
    // Чебышёв: узлам нужен коридор, иначе трассам негде пройти
    if (nodes.some(n => Math.max(Math.abs(n.c - c), Math.abs(n.r - r)) < MIND)) continue;
    nodes.push({ c, r });
  }

  // --- RNG ---
  const D = (a, b) => Math.hypot(a.c - b.c, a.r - b.r);
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dij = D(nodes[i], nodes[j]);
      let ok = true;
      for (let k = 0; k < nodes.length; k++) {
        if (k === i || k === j) continue;
        if (Math.max(D(nodes[i], nodes[k]), D(nodes[j], nodes[k])) < dij) { ok = false; break; }
      }
      if (ok) edges.push({ i, j, d: dij });
    }
  }

  // RNG срезает локальное резервирование, которое в реальных сетях есть.
  // Возвращаем его: короткие рёбра Габриэля, которых нет в RNG.
  const have = new Set(edges.map(e => e.i + ':' + e.j));
  const extra = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (have.has(i + ':' + j)) continue;
      const dij = D(nodes[i], nodes[j]);
      const mc = (nodes[i].c + nodes[j].c) / 2, mr = (nodes[i].r + nodes[j].r) / 2;
      let ok = true;
      for (let k = 0; k < nodes.length; k++) {
        if (k === i || k === j) continue;
        if (Math.hypot(nodes[k].c - mc, nodes[k].r - mr) < dij / 2) { ok = false; break; }
      }
      if (ok) extra.push({ i, j, d: dij });
    }
  }
  extra.sort((a, b) => a.d - b.d);
  edges.push(...extra.slice(0, Math.round(nodes.length * 0.3)));

  // --- разводка буквой Г, с учётом занятости клеток ---
  const used = new Map();
  const load = (c, r) => used.get(c + ',' + r) || 0;
  const mark = (c, r) => used.set(c + ',' + r, load(c, r) + 1);

  const span = (from, to) => { const s = []; const st = from <= to ? 1 : -1; for (let v = from; v !== to + st; v += st) s.push(v); return s; };
  const legH = (r, c0, c1) => span(c0, c1).map(c => [c, r]);
  const legV = (c, r0, r1) => span(r0, r1).map(r => [c, r]);

  edges.sort((a, b) => a.d - b.d);
  for (const e of edges) {
    const a = nodes[e.i], b = nodes[e.j];
    const varA = [...legH(a.r, a.c, b.c), ...legV(b.c, a.r, b.r)];   // сперва по горизонтали
    const varB = [...legV(a.c, a.r, b.r), ...legH(b.r, a.c, b.c)];   // сперва по вертикали
    const cost = (cells) => cells.reduce((s, [c, r]) => s + load(c, r), 0);
    const pick = cost(varA) <= cost(varB) ? varA : varB;
    pick.forEach(([c, r]) => mark(c, r));
    e.corner = (pick === varA) ? { c: b.c, r: a.r } : { c: a.c, r: b.r };
  }

  const deg = nodes.map(() => 0);
  edges.forEach(e => { deg[e.i]++; deg[e.j]++; });
  nodes.forEach((n, i) => { n.deg = deg[i]; });

  return { nodes, edges, COLS, ROWS };
}

module.exports = { buildGrid, mulberry32 };
