'use strict';
// Group means, disparity and permutation tests. Compared with geomorph's pairwise() and morphol.disparity()
// using the same permutations (see tests/fixtures/geomorph-reference.R).
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../../src/gm.js');
const ref = require('../fixtures/geomorph-reference.json').groups;
const { near } = require('./helpers.js');

const levels = ['a', 'b', 'c'];
const index = ref.labels.map(l => levels.indexOf(l));
const run = opts => GM.groupStats({ coords: ref.coords, csize: ref.csize }, index, levels, opts);

test('group means are the averages of the aligned coordinates (as geomorph)', () => {
  const r = run({ permutations: 0 });
  assert.deepEqual(r.groups.map(g => g.name), levels);
  assert.deepEqual(r.groups.map(g => g.n), [10, 12, 8]);
  r.groups.forEach((g, k) => g.mean.forEach((p, i) => p.forEach((v, d) => near(v, ref.means[k][i][d], 1e-10, `${g.name} ${i}`))));
});

test('distances between group means match pairwise()', () => {
  const r = run({ permutations: 0 });
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) near(r.distances[a][b], ref.distances[a][b], 1e-10, `${a}-${b}`);
  assert.equal(r.pDistance, null, 'no p-values without permutations');
});

test('Procrustes variance and its differences match morphol.disparity()', () => {
  const r = run({ permutations: 0 });
  r.groups.forEach((g, k) => near(g.disparity, ref.disparity[k], 1e-12, g.name));
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) near(r.disparityDiff[a][b], ref.disparity_diff[a][b], 1e-12);
});

test('with the same permutations, p-values equal geomorph’s', () => {
  const r = run({ perms: ref.perms });
  assert.equal(r.permutations, ref.perms.length);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    if (a === b) continue;
    near(r.pDistance[a][b], ref.p_distances[a][b], 1e-12, `distance ${a}-${b}`);
    near(r.pDisparity[a][b], ref.p_disparity[a][b], 1e-12, `disparity ${a}-${b}`);
  }
});

test('mean centroid size per group', () => {
  const r = run({ permutations: 0 });
  r.groups.forEach((g, k) => {
    const sizes = ref.csize.filter((_, i) => index[i] === k);
    near(g.csize, sizes.reduce((s, v) => s + v, 0) / sizes.length, 1e-12);
  });
});

/* ---------- invented data ---------- */
const { rng } = require('./helpers.js');
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
function sample(seed, n, shift) {
  const r = rng(seed), base = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 1.4]];
  return Array.from({ length: n }, () => base.map((p, i) => [p[0] + (i === 4 ? shift : 0) + 0.03 * gauss(r), p[1] + 0.03 * gauss(r)]));
}

test('clearly different groups give small p-values; random groups do not', () => {
  const raw = sample(3, 20, 0).concat(sample(4, 20, 0.25));
  const g = GM.gpa(raw);
  const split = raw.map((_, i) => (i < 20 ? 0 : 1));
  const real = GM.groupStats({ coords: g.tangent, csize: g.csize }, split, ['x', 'y'], { permutations: 199, seed: 1 });
  assert.ok(real.pDistance[0][1] <= 0.01, `p = ${real.pDistance[0][1]}`);
  const mixed = raw.map((_, i) => i % 2);
  const none = GM.groupStats({ coords: g.tangent, csize: g.csize }, mixed, ['x', 'y'], { permutations: 199, seed: 1 });
  assert.ok(none.pDistance[0][1] > 0.05, `p = ${none.pDistance[0][1]}`);
});

test('permutations are repeatable with a seed and p-values are never 0', () => {
  const raw = sample(5, 12, 0).concat(sample(6, 12, 0.3));
  const g = GM.gpa(raw);
  const split = raw.map((_, i) => (i < 12 ? 0 : 1));
  const a = GM.groupStats({ coords: g.tangent, csize: g.csize }, split, ['x', 'y'], { permutations: 99, seed: 9 });
  const b = GM.groupStats({ coords: g.tangent, csize: g.csize }, split, ['x', 'y'], { permutations: 99, seed: 9 });
  assert.deepEqual(a.pDistance, b.pDistance);
  assert.deepEqual(a.pDisparity, b.pDisparity);
  assert.ok(a.pDistance[0][1] >= 1 / 100);
});

test('specimens without a group are left out and counted', () => {
  const raw = sample(7, 9, 0);
  const g = GM.gpa(raw);
  const idx = [0, 0, 0, 1, 1, 1, -1, -1, 0];
  const r = GM.groupStats({ coords: g.tangent, csize: g.csize }, idx, ['x', 'y'], { permutations: 19, seed: 2 });
  assert.equal(r.unassigned, 2);
  assert.deepEqual(r.groups.map(x => x.n), [4, 3]);
  assert.deepEqual(r.groups[0].members, [0, 1, 2, 8]);
});

test('groups of one have a mean but no disparity, and empty levels are dropped', () => {
  const raw = sample(8, 6, 0);
  const g = GM.gpa(raw);
  const r = GM.groupStats({ coords: g.tangent, csize: g.csize }, [0, 0, 0, 0, 0, 2], ['x', 'y', 'z'], { permutations: 19, seed: 2 });
  assert.deepEqual(r.groups.map(x => x.name), ['x', 'z']);
  assert.equal(r.groups[1].n, 1);
  assert.equal(r.groups[1].disparity, null);
  assert.equal(r.disparityDiff[0][1], null);
  assert.equal(r.pDisparity[0][1], null);
  assert.ok(Number.isFinite(r.pDistance[0][1]));
});

test('fewer than two groups gives means only', () => {
  const raw = sample(9, 6, 0);
  const g = GM.gpa(raw);
  const r = GM.groupStats({ coords: g.tangent, csize: g.csize }, [0, 0, 0, -1, -1, -1], ['x'], { permutations: 19 });
  assert.equal(r.groups.length, 1);
  assert.equal(r.pDistance, null);
});

test('the mean of all specimens is the consensus', () => {
  const raw = sample(10, 15, 0.1);
  const g = GM.gpa(raw);
  const all = GM.meanShape(g.tangent);
  all.forEach((p, i) => p.forEach((v, d) => near(v, g.consensus[i][d], 1e-12)));
});

test('permutation tests stay fast for a few hundred specimens with many landmarks', () => {
  const r = rng(11), n = 300, p = 400;
  const coords = Array.from({ length: n }, () => Array.from({ length: p }, () => [r(), r(), r()]));
  const idx = coords.map((_, i) => i % 4);
  const t0 = Date.now();
  const res = GM.groupStats({ coords, csize: coords.map(() => 1) }, idx, ['a', 'b', 'c', 'd'], { permutations: 999, seed: 1 });
  assert.ok(Date.now() - t0 < 6000, `${Date.now() - t0} ms`);
  assert.equal(res.permutations, 999);
});

/* ---------- ellipses ---------- */
test('95% ellipse: its outline lies at the chi-square distance', () => {
  const r = rng(12), x = [], y = [];
  for (let i = 0; i < 50; i++) { const a = gauss(r), b = gauss(r); x.push(2 + a); y.push(-1 + 0.5 * a + 0.3 * b); }
  const e = GM.ellipse(x, y, 0.95);
  const mx = x.reduce((s, v) => s + v, 0) / 50, my = y.reduce((s, v) => s + v, 0) / 50;
  let sxx = 0, syy = 0, sxy = 0;
  x.forEach((v, i) => { sxx += (v - mx) ** 2; syy += (y[i] - my) ** 2; sxy += (v - mx) * (y[i] - my); });
  sxx /= 49; syy /= 49; sxy /= 49;
  const det = sxx * syy - sxy * sxy;
  for (const [px, py] of e) {
    const dx = px - mx, dy = py - my;
    near((syy * dx * dx - 2 * sxy * dx * dy + sxx * dy * dy) / det, 5.991464547, 1e-6);
  }
  assert.ok(e.length >= 48);
});

test('no ellipse for fewer than three points or no spread', () => {
  assert.equal(GM.ellipse([1, 2], [3, 4]), null);
  assert.equal(GM.ellipse([1, 1, 1], [2, 2, 2]), null);
});
