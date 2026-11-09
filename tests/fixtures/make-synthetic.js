// Writes the synthetic data sets used for the geomorph comparison.
//   node tests/fixtures/make-synthetic.js
// They are invented shapes, so the fixtures carry no licence strings from real data.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { rng } = require('../unit/helpers.js');

function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

function makeSet(seed, n, base, modes) {
  const r = rng(seed), k = base[0].length, out = [];
  for (let s = 0; s < n; s++) {
    const a = modes.map(() => gauss(r));
    let pts = base.map((p, i) => p.map((v, d) => v + modes.reduce((acc, m, j) => acc + a[j] * m[i][d], 0) + 0.008 * gauss(r)));
    const size = 40 * Math.exp(0.15 * gauss(r));
    const th = r() * 2 * Math.PI;
    const [c, si] = [Math.cos(th), Math.sin(th)];
    const shift = Array.from({ length: k }, () => 200 * r());
    pts = pts.map(p => {
      const q = p.slice();
      [q[0], q[1]] = [c * p[0] - si * p[1], si * p[0] + c * p[1]];
      if (k === 3) { const t = q[1]; q[1] = c * t - si * q[2]; q[2] = si * t + c * q[2]; }
      return q.map((v, d) => v * size + shift[d]);
    });
    out.push(pts);
  }
  return out;
}

function randomShape(seed, p, k, spread) {
  const r = rng(seed);
  return Array.from({ length: p }, () => Array.from({ length: k }, () => spread * (r() - 0.5)));
}

function toTps(set, tag, scale) {
  return set.map((pts, i) => [`${tag}=${pts.length}`, ...pts.map(p => p.map(v => v.toFixed(5)).join(' ')),
    `ID=S${String(i + 1).padStart(3, '0')}`, ...(scale ? [`SCALE=${scale}`] : [])].join('\n')).join('\n') + '\n';
}

const dir = __dirname;
const two = makeSet(11, 30, randomShape(1, 12, 2, 2), [randomShape(2, 12, 2, 0.12), randomShape(3, 12, 2, 0.08)]);
const three = makeSet(12, 24, randomShape(4, 10, 3, 2), [randomShape(5, 10, 3, 0.12), randomShape(6, 10, 3, 0.08)]);
fs.writeFileSync(path.join(dir, 'synthetic-2d.tps'), toTps(two, 'LM', 0.01));
fs.writeFileSync(path.join(dir, 'synthetic-3d.tps'), toTps(three, 'LM3', 0));
