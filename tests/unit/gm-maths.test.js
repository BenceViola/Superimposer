'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../../src/gm.js');
const { near, nearAll, rng } = require('./helpers.js');

const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, i) => s + v * B[i][j], 0)));
const T = A => A[0].map((_, j) => A.map(r => r[j]));
const rot2 = t => [[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]];
const applyR = (R, pts) => pts.map(p => R.map(r => r.reduce((s, v, i) => s + v * p[i], 0)));
const rx = t => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const rz = t => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
const shape2 = [[0, 0], [4, 0.5], [5, 3], [1, 4], [-1, 2]];
const shape3 = [[0, 0, 0], [4, 0.5, 1], [5, 3, -1], [1, 4, 2], [-1, 2, 3]];

test('symEig returns sorted eigenvalues and orthonormal eigenvectors', () => {
  const A = [[4, 1, 2], [1, 3, 0], [2, 0, 5]];
  const { values, vectors } = GM.symEig(A);
  assert.ok(values[0] >= values[1] && values[1] >= values[2]);
  near(values.reduce((a, b) => a + b), 12, 1e-9);
  const V = vectors;
  nearAll(mul(T(V), V), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 1e-9);
  const D = values.map((v, i) => values.map((_, j) => (i === j ? v : 0)));
  nearAll(mul(mul(V, D), T(V)), A, 1e-9);
});

test('symEig handles a diagonal matrix and a zero matrix', () => {
  assert.deepEqual(GM.symEig([[1, 0], [0, 3]]).values, [3, 1]);
  assert.deepEqual(GM.symEig([[0, 0], [0, 0]]).values, [0, 0]);
});

test('centroid size is the root of summed squared distances from the centroid', () => {
  near(GM.centroidSize([[1, 1], [-1, 1], [-1, -1], [1, -1]]), Math.sqrt(8));
  near(GM.centroidSize([[11, 1], [9, 1], [9, -1], [11, -1]]), Math.sqrt(8));
});

test('rotateOnto recovers a 2D rotation', () => {
  const y = applyR(rot2(1.1), shape2);
  nearAll(GM.rotateOnto(shape2, y), shape2, 1e-9);
});

test('rotateOnto recovers a 3D rotation', () => {
  const R = mul(rx(0.7), rz(-2.1));
  nearAll(GM.rotateOnto(shape3, applyR(R, shape3)), shape3, 1e-9);
});

test('rotateOnto never reflects: a mirror image cannot reach its original (2D, 3D)', () => {
  const center = pts => { const k = pts[0].length; const m = Array(k).fill(0).map((_, d) => pts.reduce((s, p) => s + p[d], 0) / pts.length); return pts.map(p => p.map((v, d) => v - m[d])); };
  for (const shape of [shape2, shape3]) {
    const a = center(shape), mirrored = a.map(p => [-p[0], ...p.slice(1)]);
    const r = GM.rotateOnto(a, mirrored);
    const err = r.flat().reduce((s, v, i) => s + (v - a.flat()[i]) ** 2, 0);
    assert.ok(err > 0.1, `residual ${err}`);
  }
});

test('rotateOnto works on planar 3D configurations', () => {
  const flat = [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 5, 0]];
  const c = flat.map(p => [p[0] - 2, p[1] - 2, 0]);
  const y = applyR(mul(rx(1), rz(0.4)), c);
  nearAll(GM.rotateOnto(c, y), c, 1e-9);
});

function jittered(seed, base, n) {
  const r = rng(seed);
  return Array.from({ length: n }, () => base.map(p => p.map(v => v + 0.1 * (r() - 0.5))));
}

test('GPA gives centred, unit-size configurations', () => {
  const g = GM.gpa(jittered(1, shape2, 8));
  for (const c of g.aligned) {
    near(GM.centroidSize(c), 1, 1e-9);
    for (const d of [0, 1]) near(c.reduce((s, p) => s + p[d], 0), 0, 1e-12);
  }
  near(GM.centroidSize(g.consensus), 1, 1e-9);
  assert.ok(g.converged);
});

test('GPA keeps the centroid sizes of the raw data', () => {
  const raw = jittered(2, shape2, 5);
  const g = GM.gpa(raw);
  raw.forEach((c, i) => near(g.csize[i], GM.centroidSize(c), 1e-12));
});

test('GPA removes position, scale and rotation', () => {
  const raw = jittered(3, shape2, 10);
  const r = rng(9);
  const moved = raw.map(c => {
    const s = 0.5 + 3 * r(), dx = 50 * r(), dy = -50 * r(), R = rot2(6 * r());
    return applyR(R, c).map(p => [p[0] * s + dx, p[1] * s + dy]);
  });
  const a = GM.gpa(raw), b = GM.gpa(moved);
  a.procD.forEach((d, i) => near(d, b.procD[i], 1e-7, `specimen ${i}`));
});

test('GPA in 3D removes position, scale and rotation', () => {
  const raw = jittered(4, shape3, 10);
  const r = rng(10);
  const moved = raw.map(c => applyR(mul(rx(6 * r()), rz(6 * r())), c).map(p => p.map(v => v * 2 + 7)));
  const a = GM.gpa(raw), b = GM.gpa(moved);
  a.procD.forEach((d, i) => near(d, b.procD[i], 1e-7, `specimen ${i}`));
});

test('identical specimens have zero Procrustes distance', () => {
  const g = GM.gpa([shape2, shape2.map(p => [p[0] * 3, p[1] * 3]), applyR(rot2(2), shape2)]);
  g.procD.forEach(d => near(d, 0, 1e-7));
});

test('the consensus is on the principal axes, so results do not depend on input order', () => {
  const raw = jittered(5, shape2, 9);
  const a = GM.gpa(raw), b = GM.gpa([...raw].reverse());
  nearAll(a.consensus.map(p => p.map(Math.abs)), b.consensus.map(p => p.map(Math.abs)), 1e-6);
});

test('PCA: scores are centred, variance adds up, loadings are orthonormal', () => {
  const g = GM.gpa(jittered(6, shape2, 12));
  const p = GM.pca(g.tangent);
  const k = p.values.length;
  assert.ok(k > 0);
  for (let c = 0; c < k; c++) near(p.scores.reduce((s, r) => s + r[c], 0), 0, 1e-9);
  near(p.proportion.reduce((a, b) => a + b), 1, 1e-9);
  const LLt = mul(p.loadings, T(p.loadings));
  nearAll(LLt, LLt.map((r, i) => r.map((_, j) => (i === j ? 1 : 0))), 1e-8);
  for (let i = 1; i < k; i++) assert.ok(p.values[i - 1] >= p.values[i]);
});

test('PCA: variance of each score column equals its eigenvalue', () => {
  const p = GM.pca(GM.gpa(jittered(7, shape2, 14)).tangent);
  const n = p.scores.length;
  p.values.forEach((v, c) => near(p.scores.reduce((s, r) => s + r[c] ** 2, 0) / (n - 1), v, 1e-12));
});

test('PCA: scores times loadings rebuild the data', () => {
  const g = GM.gpa(jittered(8, shape2, 6));
  const p = GM.pca(g.tangent);
  g.tangent.forEach((c, i) => {
    const rebuilt = GM.shapeFromScores(p, p.scores[i]);
    nearAll(rebuilt, c, 1e-9);
  });
});

test('PCA works whichever of n or the coordinate count is larger', () => {
  const few = GM.pca(GM.gpa(jittered(9, shape2, 4)).tangent);
  assert.ok(few.values.length <= 3);
  const many = GM.pca(GM.gpa(jittered(10, shape2, 40)).tangent);
  assert.ok(many.values.length <= 2 * shape2.length - 4);
});

test('PC signs are deterministic: the largest loading is positive', () => {
  const p = GM.pca(GM.gpa(jittered(11, shape2, 10)).tangent);
  for (const l of p.loadings) {
    const big = l.reduce((b, v) => (Math.abs(v) > Math.abs(b) ? v : b), 0);
    assert.ok(big > 0);
  }
});

test('shapeAt moves along one PC from the mean', () => {
  const p = GM.pca(GM.gpa(jittered(12, shape2, 10)).tangent);
  const s0 = GM.shapeAt(p, 0, 0);
  const s1 = GM.shapeAt(p, 0, 0.1);
  const d = Math.sqrt(s1.flat().reduce((a, v, i) => a + (v - s0.flat()[i]) ** 2, 0));
  near(d, 0.1, 1e-9);
});

test('flagHigh marks only values beyond the upper Tukey fence', () => {
  assert.deepEqual(GM.flagHigh([1, 1.1, 1, 0.9, 1, 1.05, 9]).map((f, i) => (f ? i : -1)).filter(i => i >= 0), [6]);
  assert.deepEqual(GM.flagHigh([1, 1, 1, 1]), [false, false, false, false]);
});
