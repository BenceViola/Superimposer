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

/* ---------- curves, for sliding semilandmarks ----------
 * Fixed landmarks first, then the curve points; the points are unevenly spaced along each curve,
 * so sliding has something to do. sliders-2d.csv / sliders-3d.csv give geomorph's curves matrix (1-based). */
function curveSet(seed, n, k) {
  const r = rng(seed), out = [];
  for (let s = 0; s < n; s++) {
    const a = gauss(r), b = gauss(r), c = gauss(r);
    const z = (x, y, h) => (k === 3 ? [x, y, h] : [x, y]);
    const F = [z(-1, 0, 0), z(1, 0.05 * a, 0), z(0.05 * b, 1.2 + 0.08 * a, 0.2), z(0, -0.8, -0.1 * c), z(-0.6, 0.6 + 0.05 * c, 0.1)];
    const pts = F.slice();
    const uneven = (m, i) => (i + 1 + 0.35 * (2 * r() - 1)) / (m + 1);
    // C1: an arc anchored on F1 and F2
    const h = 0.5 + 0.1 * a;
    for (let i = 0; i < 6; i++) {
      const t = uneven(6, i);
      const p = F[0].map((v, d) => v + t * (F[1][d] - v));
      p[1] += h * Math.sin(Math.PI * t);
      if (k === 3) p[2] += (0.3 + 0.05 * b) * Math.sin(Math.PI * t);
      pts.push(p);
    }
    if (k === 2) {
      // C2: a closed loop
      for (let j = 0; j < 8; j++) {
        const th = (2 * Math.PI * (j + 0.2 * (2 * r() - 1))) / 8;
        pts.push([0.3 + (0.25 + 0.03 * b) * Math.cos(th), 0.4 + 0.15 * Math.sin(th)]);
      }
    }
    // C3: a curve with free ends
    for (let i = 0; i < 5; i++) {
      const t = i === 0 ? 0 : i === 4 ? 1 : (i + 0.35 * (2 * r() - 1)) / 4;
      pts.push(z(-0.8 + 1.4 * t, -0.5 - 0.1 * t - (0.2 + 0.04 * c) * Math.sin(Math.PI * t), 0.15 * Math.sin(Math.PI * t)));
    }
    const noisy = pts.map(p => p.map(v => v + 0.004 * gauss(r)));
    const size = 40 * Math.exp(0.15 * gauss(r)), th = r() * 2 * Math.PI, co = Math.cos(th), si = Math.sin(th);
    const shift = Array.from({ length: k }, () => 200 * r());
    out.push(noisy.map(p => {
      const q = p.slice();
      [q[0], q[1]] = [co * p[0] - si * p[1], si * p[0] + co * p[1]];
      if (k === 3) { const t = q[1]; q[1] = co * t - si * q[2]; q[2] = si * t + co * q[2]; }
      return q.map((v, d) => v * size + shift[d]);
    }));
  }
  return out;
}
function slidersOf(k) {
  const rows = [];
  const curve = (first, m, before, after, closed) => {
    for (let i = 0; i < m; i++) {
      const p = first + i;
      if (closed) rows.push([i ? p - 1 : first + m - 1, p, i < m - 1 ? p + 1 : first]);
      else if ((i > 0 || before) && (i < m - 1 || after)) rows.push([i ? p - 1 : before, p, i < m - 1 ? p + 1 : after]);
    }
  };
  curve(6, 6, 1, 2, false);
  if (k === 2) { curve(12, 8, 0, 0, true); curve(20, 5, 0, 0, false); } else curve(12, 5, 0, 0, false);
  return 'before,slide,after\n' + rows.map(x => x.join(',')).join('\n') + '\n';
}
fs.writeFileSync(path.join(dir, 'curves-2d.tps'), toTps(curveSet(21, 20, 2), 'LM', 0.01));
fs.writeFileSync(path.join(dir, 'curves-3d.tps'), toTps(curveSet(22, 16, 3), 'LM3', 0));
fs.writeFileSync(path.join(dir, 'sliders-2d.csv'), slidersOf(2));
fs.writeFileSync(path.join(dir, 'sliders-3d.csv'), slidersOf(3));
