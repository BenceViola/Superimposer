'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../../src/gm.js');
const IO = require('../../src/io.js');
const { doc2d, tpl2d, near, nearAll, rng } = require('./helpers.js');

const P = [[10, 10], [60, 15], [70, 60], [20, 80]];
const tpl = tpl2d({ landmarks: P.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` })) });
const r = rng(21);
const noisy = () => P.map(p => [p[0] + 3 * r(), p[1] + 3 * r()]);
const rec = (id, pts, over = {}) => IO.parseLmk(doc2d(id, pts, Object.assign({ template: tpl }, over)), `${id}.json`).specimens[0];
const data = (...s) => IO.assemble(s);

/* ---------- prepare ---------- */
test('prepare keeps complete data as it is', () => {
  const p = GM.prepare(data(rec('A', noisy()), rec('B', noisy())));
  assert.equal(p.specimens.length, 2);
  assert.equal(p.rows.length, 4);
  assert.equal(p.matrix[0].length, 4);
  assert.equal(p.dim, 2);
});

test('default: specimens with a missing landmark are dropped', () => {
  const m = noisy(); m[1] = null;
  const p = GM.prepare(data(rec('A', noisy()), rec('B', m), rec('C', noisy())));
  assert.deepEqual(p.specimens.map(s => s.id), ['A', 'C']);
  assert.equal(p.dropped.specimens[0].key, 'B');
  assert.match(p.dropped.specimens[0].reason, /LM02/);
});

test('alternatively the landmark is dropped', () => {
  const m = noisy(); m[1] = null;
  const p = GM.prepare(data(rec('A', noisy()), rec('B', m), rec('C', noisy())), { missing: 'points' });
  assert.equal(p.specimens.length, 3);
  assert.deepEqual(p.rows.map(x => x.id), ['LM01', 'LM03', 'LM04']);
  assert.equal(p.matrix[1].length, 3);
  assert.equal(p.dropped.points[0].id, 'LM02');
});

test('specimens and points can be excluded by hand', () => {
  const p = GM.prepare(data(rec('A', noisy()), rec('B', noisy()), rec('C', noisy())),
    { excludeSpecimens: new Set(['B']), excludePoints: new Set(['LM04']) });
  assert.deepEqual(p.specimens.map(s => s.id), ['A', 'C']);
  assert.equal(p.rows.length, 3);
});

test('a point excluded by hand no longer makes specimens incomplete', () => {
  const m = noisy(); m[3] = null;
  const p = GM.prepare(data(rec('A', noisy()), rec('B', m)), { excludePoints: new Set(['LM04']) });
  assert.equal(p.specimens.length, 2);
});

test('estimated landmarks are used and counted', () => {
  const d = doc2d('A', noisy(), { template: tpl });
  d.landmarks[0].status = 'estimated';
  const p = GM.prepare(data(IO.parseLmk(d, 'a').specimens[0], rec('B', noisy())));
  assert.equal(p.specimens.length, 2);
  assert.equal(p.estimated, 1);
});

const curveRec = (id, pts) => {
  const t = tpl2d({ landmarks: tpl.landmarks, curves: [{ id: 'C01', name: 'c', n_points: 2 }] });
  const d = doc2d(id, pts, { template: t });
  d.curves = [{ id: 'C01', template_id: 'C01', status: 'placed', points: [{ position: [33, 33] }, { position: [44, 40] }] }];
  return IO.parseLmk(d, 'x').specimens[0];
};

test('semilandmarks are left out by default', () => {
  const p = GM.prepare(data(curveRec('A', noisy()), curveRec('B', noisy())));
  assert.equal(p.rows.length, 4);
  assert.equal(p.semilandmarksAvailable, 2);
  assert.equal(p.semilandmarksUsed, 0);
});

test('semilandmarks can be included', () => {
  const p = GM.prepare(data(curveRec('A', noisy()), curveRec('B', noisy())), { semilandmarks: true });
  assert.equal(p.rows.length, 6);
  assert.equal(p.semilandmarksUsed, 2);
});

test('flipping mirrors x and marks the specimen', () => {
  const pts = noisy();
  const p = GM.prepare(data(rec('A', pts), rec('B', noisy())), { flip: new Set(['A']) });
  near(p.matrix[0][0][0], -pts[0][0], 1e-12);
  near(p.matrix[0][0][1], 200 - pts[0][1], 1e-12);
  assert.equal(p.specimens[0].flipped, true);
  assert.equal(p.specimens[1].flipped, false);
});

const rep = (id, n, pts, op) => rec(id, pts, { specimen: { replicate: n }, provenance: op ? { operator: op } : undefined });

test('replicates can be averaged per specimen and operator', () => {
  const a1 = noisy(), a2 = noisy();
  const p = GM.prepare(data(rep('A', 1, a1), rep('A', 2, a2), rec('B', noisy())), { replicates: 'average' });
  assert.equal(p.specimens.length, 2);
  assert.equal(p.specimens[0].id, 'A');
  assert.equal(p.specimens[0].nReplicates, 2);
  near(p.matrix[0][0][0], (a1[0][0] + a2[0][0]) / 2, 1e-12);
});

test('averaging keeps different operators apart', () => {
  const p = GM.prepare(data(rep('A', 1, noisy(), 'ann'), rep('A', 1, noisy(), 'bob')), { replicates: 'average' });
  assert.equal(p.specimens.length, 2);
});

test('averaging uses whichever replicates have the landmark', () => {
  const a = noisy(), b = noisy(); b[0] = null;
  const p = GM.prepare(data(rep('A', 1, a), rep('A', 2, b), rec('B', noisy())), { replicates: 'average' });
  assert.equal(p.specimens.length, 2);
  near(p.matrix[0][0][0], a[0][0], 1e-12);
});

test('a specimen whose points all coincide is dropped', () => {
  const p = GM.prepare(data(rec('A', P.map(() => [5, 5])), rec('B', noisy())));
  assert.deepEqual(p.specimens.map(s => s.id), ['B']);
  assert.match(p.dropped.specimens[0].reason, /same place/);
});

/* ---------- mirrored specimens ---------- */
const asym = [[0, 0], [10, 1], [12, 6], [3, 8], [-2, 3]];
function fish(seed, n) {
  const q = rng(seed);
  return Array.from({ length: n }, () => asym.map(p => [p[0] + 0.4 * q(), p[1] + 0.4 * q()]));
}
const mirror = m => m.map(p => [-p[0], p[1]]);

test('mirrored specimens are found', () => {
  const m = fish(1, 10);
  m[3] = mirror(m[3]);
  m[7] = mirror(m[7]);
  assert.deepEqual(GM.findMirrored(m), [3, 7]);
});

test('nothing is flagged in a consistent set', () => {
  assert.deepEqual(GM.findMirrored(fish(2, 10)), []);
});

test('the majority sets the direction, even when the first specimen is mirrored', () => {
  const m = fish(3, 9);
  m[0] = mirror(m[0]);
  assert.deepEqual(GM.findMirrored(m), [0]);
});

test('rotated mirror images are still found', () => {
  const m = fish(4, 8);
  const c = Math.cos(2), s = Math.sin(2);
  m[5] = mirror(m[5]).map(p => [c * p[0] - s * p[1], s * p[0] + c * p[1]]);
  assert.deepEqual(GM.findMirrored(m), [5]);
});

test('symmetric shapes are not flagged, because left and right can’t be told apart', () => {
  const q = rng(5);
  const m = Array.from({ length: 8 }, () => [[-5, 0], [5, 0], [0, 6], [0, -6]].map(p => [p[0] + 0.01 * q(), p[1] + 0.01 * q()]));
  assert.deepEqual(GM.findMirrored(m), []);
});

/* ---------- repeatability ---------- */
test('repeatability reports per-landmark distances between replicates', () => {
  const a = noisy(), b = a.map(p => p.slice());
  b[0] = [a[0][0] + 3, a[0][1] + 4];
  const res = GM.repeatability(data(rep('A', 1, a), rep('A', 2, b), rec('B', noisy())));
  assert.equal(res.units, 'px');
  assert.equal(res.specimens.length, 1);
  assert.equal(res.specimens[0].replicates, 2);
  near(res.rows[0].mean, 5, 1e-9);
  near(res.rows[1].mean, 0, 1e-9);
  assert.equal(res.rows[0].pairs, 1);
});

test('replicates by different operators are compared within operator only', () => {
  const res = GM.repeatability(data(rep('A', 1, noisy(), 'ann'), rep('A', 1, noisy(), 'bob')));
  assert.equal(res.specimens.length, 0);
});

test('poorly repeatable landmarks are flagged at twice the median', () => {
  const a = [[10, 10], [60, 15], [70, 60], [20, 80]];
  const b = [[11, 10], [61, 15], [71, 60], [20, 90]];
  const res = GM.repeatability(data(rep('A', 1, a), rep('A', 2, b)));
  assert.deepEqual(res.rows.map(x => x.flag), [false, false, false, true]);
});

test('without replicates there is nothing to report', () => {
  assert.equal(GM.repeatability(data(rec('A', noisy()))).specimens.length, 0);
});

/* ---------- analyse ---------- */
test('analyse runs the whole chain', () => {
  const res = GM.analyse(data(...['A', 'B', 'C', 'D', 'E'].map(id => rec(id, noisy()))));
  assert.equal(res.ok, true);
  assert.equal(res.gpa.aligned.length, 5);
  assert.ok(res.pca.values.length > 0);
  assert.equal(res.pca.scores.length, 5);
  assert.deepEqual(res.mirrored, []);
});

test('analyse needs at least three specimens', () => {
  const res = GM.analyse(data(rec('A', noisy()), rec('B', noisy())));
  assert.equal(res.ok, false);
  assert.match(res.message, /three specimens/i);
});

test('analyse needs at least three points', () => {
  const res = GM.analyse(data(...['A', 'B', 'C'].map(id => rec(id, noisy()))), { excludePoints: new Set(['LM01', 'LM02']) });
  assert.equal(res.ok, false);
  assert.match(res.message, /three (land)?marks|three points/i);
});

test('analyse says so when missing data removes too many specimens', () => {
  const m = () => { const x = noisy(); x[0] = null; return x; };
  const res = GM.analyse(data(rec('A', m()), rec('B', m()), rec('C', noisy())));
  assert.equal(res.ok, false);
  assert.match(res.message, /missing/i);
});

test('analyse reports mirrored specimens by key', () => {
  const list = fish(6, 8).map(m => m.map(p => [p[0] * 5 + 30, p[1] * 5 + 30]));
  list[2] = list[2].map(p => [100 - p[0], p[1]]);
  const t = tpl2d({ landmarks: asym.map((_, i) => ({ id: `LM0${i + 1}`, name: '' })) });
  const res = GM.analyse(data(...list.map((m, i) => rec(`F${i}`, m, { template: t }))));
  assert.deepEqual(res.mirrored, ['F2']);
});

test('flipping the reported specimens clears the report', () => {
  const list = fish(7, 8).map(m => m.map(p => [p[0] * 5 + 30, p[1] * 5 + 30]));
  list[2] = list[2].map(p => [100 - p[0], p[1]]);
  const t = tpl2d({ landmarks: asym.map((_, i) => ({ id: `LM0${i + 1}`, name: '' })) });
  const res = GM.analyse(data(...list.map((m, i) => rec(`F${i}`, m, { template: t }))), { flip: new Set(['F2']) });
  assert.deepEqual(res.mirrored, []);
});

test('a mirrored specimen stands out as an outlier before it is flipped', () => {
  const list = fish(8, 10).map(m => m.map(p => [p[0] * 5 + 30, p[1] * 5 + 30]));
  list[4] = list[4].map(p => [100 - p[0], p[1]]);
  const t = tpl2d({ landmarks: asym.map((_, i) => ({ id: `LM0${i + 1}`, name: '' })) });
  const res = GM.analyse(data(...list.map((m, i) => rec(`F${i}`, m, { template: t }))));
  assert.equal(res.outliers[4], true);
});
