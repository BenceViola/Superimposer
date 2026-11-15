'use strict';
// Large data sets: nothing may depend on spreading long arrays into function arguments,
// which overflows the call stack (much sooner in Safari than in Node).
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../../src/gm.js');
const PL = require('../../src/plots.js');
const LK = require('../../src/links.js');
const { rng } = require('./helpers.js');

function cloud(n, p, k, seed) {
  const r = rng(seed), base = Array.from({ length: p }, () => Array.from({ length: k }, () => 10 * r()));
  return Array.from({ length: n }, () => base.map(q => q.map(v => v + r())));
}

test('thin-plate spline imputation works with hundreds of landmarks', () => {
  const m = cloud(6, 420, 3, 1);
  m[2][5] = null;
  const r = GM.impute(m, { method: 'tps', canFill: () => true });
  assert.ok(r.matrix[2][5], JSON.stringify(r.notes));
});

test('figures with a quarter of a million points still draw', () => {
  const m = cloud(600, 400, 2, 2);
  const rows = m[0].map((_, i) => ({ id: `P${i}`, type: 'landmark', label: '' }));
  const s = PL.superimposition({ aligned: m, consensus: m[0], rows, keys: m.map((_, i) => `S${i}`), theme: PL.THEMES.light, labels: false });
  assert.match(s, /<\/svg>$/);
  const raw = PL.rawData({ matrix: m, keys: m.map((_, i) => `S${i}`), theme: PL.THEMES.light });
  assert.match(raw, /<\/svg>$/);
});

test('a deformation grid around a shape with many points draws', () => {
  const shape = cloud(1, 200000, 2, 3)[0];
  const s = PL.shapeChange({ mean: shape.slice(0, 5), target: shape.slice(0, 5), rows: shape.slice(0, 5).map((_, i) => ({ id: `P${i}`, type: 'landmark' })), theme: PL.THEMES.light, warp: q => q });
  assert.match(s, /<\/svg>$/);
  assert.match(PL.scatter({ x: shape.map(q => q[0]), y: shape.map(q => q[1]), keys: shape.map((_, i) => `S${i}`), xLabel: 'a', yLabel: 'b', theme: PL.THEMES.light, forExport: true }), /<\/svg>$/);
});

test('triangulating many points works', () => {
  const pts = cloud(1, 150000, 2, 4)[0];
  assert.doesNotThrow(() => LK.outline(pts, pts.map((_, i) => `P${i}`)));
});

test('symEig is accurate for a large matrix', () => {
  const r = rng(5), n = 260;
  const B = Array.from({ length: n }, () => Array.from({ length: 40 }, () => r() - 0.5));
  const A = B.map(a => B.map(b => a.reduce((s, v, i) => s + v * b[i], 0)));
  const { values, vectors } = GM.symEig(A);
  for (let i = 1; i < n; i++) assert.ok(values[i - 1] >= values[i] - 1e-12);
  for (const j of [0, 1, 5, 20, 39]) {
    const v = vectors.map(row => row[j]);
    const Av = A.map(row => row.reduce((s, x, i) => s + x * v[i], 0));
    Av.forEach((x, i) => assert.ok(Math.abs(x - values[j] * v[i]) < 1e-8, `pair ${j}`));
    assert.ok(Math.abs(v.reduce((s, x) => s + x * x, 0) - 1) < 1e-10);
  }
  assert.ok(Math.abs(values.reduce((a, b) => a + b, 0) - A.reduce((s, row, i) => s + row[i], 0)) < 1e-8);
});
