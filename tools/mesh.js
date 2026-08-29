// Топология строится из геометрии, а не назначается руками.
//   1. Точки раскладываются по полю value-noise -> естественные сгущения и пустоты.
//   2. Связи — граф Габриэля: ребро AB есть, если в круге с диаметром AB нет других точек.
//      Это стандартная модель топологии беспроводных mesh-сетей; кластеры и перемычки
//      возникают сами, без ручных "бэкбонов".
//   3. Глубина z берётся из второго поля шума, поэтому она пространственно связная:
//      соседние узлы лежат на близких планах, а не мерцают вразнобой.

const W = 1000, H = 280;
let X0 = -18, X1 = 548, Y0 = 12, Y1 = 268;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// решётчатый value-noise со сглаживанием — даёт связные пятна плотности
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

function build(seed, opt) {
  if (opt && opt.bounds) { [X0, Y0, X1, Y1] = opt.bounds; }
  const rnd = mulberry32(seed);
  const density = makeNoise(rnd, 5);
  const depth = makeNoise(rnd, 3);
  const TARGET = (opt && opt.n) || 54;

  const norm = (x, y) => [(x - X0) / (X1 - X0), (y - Y0) / (Y1 - Y0)];

  const nodes = [];
  let tries = 0;
  while (nodes.length < TARGET && tries < 60000) {
    tries++;
    const x = X0 + rnd() * (X1 - X0);
    const y = Y0 + rnd() * (Y1 - Y0);
    const [u, v] = norm(x, y);

    // плотность падает вправо, чтобы сеть растворялась перед типографикой
    const d = 0.28 + 0.72 * density(u, v);
    if (rnd() > Math.pow(d, 1.25)) continue;

    // в плотных местах узлы стоят теснее — отсюда берутся сгущения
    const minD = 21 + 32 * (1 - d);
    if (nodes.some(n => (n.x - x) ** 2 + (n.y - y) ** 2 < minD * minD)) continue;

    nodes.push({ x, y, z: depth(u, v) });
  }

  // --- граф Габриэля ---
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const r2 = ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / 4;
      let ok = true;
      for (let k = 0; k < nodes.length; k++) {
        if (k === i || k === j) continue;
        if ((nodes[k].x - mx) ** 2 + (nodes[k].y - my) ** 2 < r2) { ok = false; break; }
      }
      if (ok) edges.push({ i, j, d: Math.hypot(a.x - b.x, a.y - b.y) });
    }
  }

  nodes.forEach(n => { n.x = +n.x.toFixed(1); n.y = +n.y.toFixed(1); n.z = +n.z.toFixed(3); });
  edges.forEach(e => { e.d = +e.d.toFixed(1); });
  return { nodes, edges };
}

module.exports = { W, H, build, mulberry32 };
