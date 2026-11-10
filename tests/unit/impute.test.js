'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const GM = require('../../src/gm.js');
const IO = require('../../src/io.js');
const ref = require('../fixtures/geomorph-reference.json');
const { near, nearAll, rng } = require('./helpers.js');

const load = name => IO.parseTPS(fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8'), name).specimens.map(s => s.coords);
const copy = m => m.map(c => c.map(p => (p ? p.slice() : null)));
const all = () => true;

/* ---------- thin-plate spline in 3D ---------- */
const src3 = [[0, 0, 0], [4, 0.5, 1], [5, 3, -1], [1, 4, 2], [-1, 2, 3], [2, 2, -2]];

test('3D warp passes through every landmark', () => {
  const tgt = src3.map(([x, y, z], i) => [x + 0.2 * Math.sin(i), y - 0.1 * i, z + 0.15 * Math.cos(i * 2)]);
  const w = GM.tpsWarp(src3, tgt);
  src3.forEach((p, i) => nearAll(w(p), tgt[i], 1e-9, `landmark ${i}`));
});

test('3D warp recovers an affine change exactly', () => {
  const f = ([x, y, z]) => [1 + 2 * x - 0.5 * y + 0.1 * z, -3 + 0.4 * x + 1.5 * y, 2 - z + 0.3 * x];
  const w = GM.tpsWarp(src3, src3.map(f));
  for (const q of [[2, 2, 2], [10, -4, 1], [-3.3, 0.7, -2]]) nearAll(w(q), f(q), 1e-8);
});

/* ---------- against geomorph's estimate.missing ---------- */
const gapsOf = g => [].concat(g.lm);

/** Rigid fit of b onto a, using only the given landmarks: so frames can be compared. */
function onto(a, b, use) {
  const ca = a[0].map((_, d) => use.reduce((s, j) => s + a[j][d], 0) / use.length);
  const cb = b[0].map((_, d) => use.reduce((s, j) => s + b[j][d], 0) / use.length);
  const A = use.map(j => a[j].map((v, d) => v - ca[d]));
  const B = b.map(p => p.map((v, d) => v - cb[d]));
  const R = GM.fitRigid(use.map(j => B[j]), A);
  return B.map(p => R(p).map((v, d) => v + ca[d]));
}

for (const [label, file, key] of [['2D', 'synthetic-2d.tps', 'two'], ['3D', 'synthetic-3d.tps', 'three']]) {
  const M = ref.missing[key];
  const holed = () => {
    const m = load(file);
    for (const g of M.gaps) for (const j of gapsOf(g)) m[g.spec][j] = null;
    return m;
  };
  const scale = Math.sqrt(load(file)[0].flat().reduce((s, v) => s + v * v, 0));

  test(`${label}: thin-plate spline matches geomorph`, () => {
    const r = GM.impute(holed(), { method: 'tps', canFill: all });
    M.gaps.forEach((g, n) => {
      for (const j of gapsOf(g)) nearAll(r.matrix[g.spec][j], M.tps[n][j], 2e-4 * scale, `specimen ${g.spec}, landmark ${j}`);
    });
  });

  // geomorph centres an incomplete specimen on its remaining landmarks, while the complete ones are centred
  // on all of theirs. That moves it against the reference and costs accuracy (see the next test), so the app
  // places it where the reference's landmarks are. With geomorph's centring the results agree.
  test(`${label}: regression matches geomorph when centred as geomorph does`, () => {
    const r = GM.impute(holed(), { method: 'reg', canFill: all, geomorphCentring: true });
    M.gaps.forEach((g, n) => {
      const gaps = gapsOf(g), present = r.matrix[g.spec].map((_, j) => j).filter(j => !gaps.includes(j));
      const theirs = onto(r.matrix[g.spec], M.reg[n], present);
      for (const j of gaps) nearAll(r.matrix[g.spec][j], theirs[j], 2e-3 * scale, `specimen ${g.spec}, landmark ${j}`);
    });
  });

  test(`${label}: regression centred on the reference lands closer to the true landmarks than geomorph’s centring`, () => {
    const truth = load(file), r = rng(99);
    const error = extra => {
      let sum = 0;
      for (let t = 0; t < 60; t++) {
        const i = Math.floor(r() * truth.length), j = Math.floor(r() * truth[0].length);
        const m = copy(truth);
        m[i][j] = null;
        const q = GM.impute(m, Object.assign({ method: 'reg', canFill: all }, extra)).matrix[i][j];
        sum += Math.hypot(...q.map((v, d) => v - truth[i][j][d]));
      }
      return sum;
    };
    const ours = error({}), theirs = error({ geomorphCentring: true });
    assert.ok(ours < 0.5 * theirs, `${ours} vs ${theirs}`);
  });

  test(`${label}: imputed landmarks are listed, others left exactly as they were`, () => {
    const before = holed();
    for (const method of ['tps', 'reg', 'mean']) {
      const r = GM.impute(copy(before), { method, canFill: all });
      M.gaps.forEach(g => {
        assert.deepEqual(r.filled[g.spec].map(f => f.j).sort((a, b) => a - b), gapsOf(g).slice().sort((a, b) => a - b), method);
        assert.ok(r.filled[g.spec].every(f => f.method === method));
        before[g.spec].forEach((p, j) => { if (p) nearAll(r.matrix[g.spec][j], p, 1e-9, `${method} kept ${j}`); });
      });
      assert.equal(r.filled[0].length, 0);
    }
  });
}

/* ---------- mean substitution ---------- */
const base2 = [[0, 0], [4, 0.5], [5, 3], [1, 4], [-1, 2], [2, 1.5]];
function sample(seed, n, base = base2, noise = 0.15) {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const t = 6 * r(), s = 0.5 + 2 * r(), dx = 30 * r(), dy = -20 * r();
    return base.map(([x, y]) => {
      const a = x + noise * (r() - 0.5), b = y + noise * (r() - 0.5);
      return [dx + s * (Math.cos(t) * a - Math.sin(t) * b), dy + s * (Math.sin(t) * a + Math.cos(t) * b)];
    });
  });
}

test('mean substitution: no variation means an exact recovery, in the specimen’s own place, size and rotation', () => {
  const m = sample(1, 8, base2, 0);
  const truth = m[3][2].slice();
  m[3][2] = null;
  const r = GM.impute(m, { method: 'mean', canFill: all });
  nearAll(r.matrix[3][2], truth, 1e-8);
});

test('every method recovers a landmark when there is no variation', () => {
  for (const method of ['tps', 'reg', 'mean']) {
    const m = sample(2, 10, base2, 0);
    const truth = m[4][1].slice();
    m[4][1] = null;
    nearAll(GM.impute(m, { method, canFill: all }).matrix[4][1], truth, 1e-6, method);
  }
});

/* ---------- mirroring ---------- */
// Symmetric about x = 0: three midline landmarks, three pairs.
const SYM = [[0, 0, 0], [0, 3, 1], [0, 5, -1], [2, 1, 0.5], [-2, 1, 0.5], [3, 4, 1], [-3, 4, 1], [1.5, 6, -2], [-1.5, 6, -2]];
const PAIRS = [[3, 4], [5, 6], [7, 8]];
const turn = (pts, a, b) => pts.map(([x, y, z]) => {
  const x1 = Math.cos(a) * x - Math.sin(a) * y, y1 = Math.sin(a) * x + Math.cos(a) * y;
  return [x1 + 5, Math.cos(b) * y1 - Math.sin(b) * z - 2, Math.sin(b) * y1 + Math.cos(b) * z + 7];
});

test('mirroring recovers a paired landmark of a symmetric specimen, whatever its position', () => {
  const placed = turn(SYM, 0.7, -1.2);
  const m = [placed.map(p => p.slice())];
  m[0][6] = null;
  const r = GM.impute(m, { method: 'mirror', canFill: all, pairs: PAIRS });
  nearAll(r.matrix[0][6], placed[6], 1e-9);
  assert.deepEqual(r.filled[0], [{ j: 6, method: 'mirror' }]);
});

test('mirroring needs no other specimens', () => {
  const m = [SYM.map(p => p.slice())];
  m[0][3] = null;
  m[0][8] = null;
  const r = GM.impute(m, { method: 'mirror', canFill: all, pairs: PAIRS });
  nearAll(r.matrix[0][3], SYM[3], 1e-9);
  nearAll(r.matrix[0][8], SYM[8], 1e-9);
});

test('mirroring works in 2D, about a line', () => {
  const sym2 = [[0, 0], [0, 4], [2, 1], [-2, 1], [3, 3], [-3, 3]];
  const m = [sym2.map(([x, y]) => [Math.cos(1) * x - Math.sin(1) * y + 3, Math.sin(1) * x + Math.cos(1) * y])];
  const truth = m[0][5].slice();
  m[0][5] = null;
  nearAll(GM.impute(m, { method: 'mirror', canFill: all, pairs: [[2, 3], [4, 5]] }).matrix[0][5], truth, 1e-9);
});

test('mirroring cannot estimate a midline landmark, nor one whose partner is missing too', () => {
  const m = [SYM.map(p => p.slice())];
  m[0][1] = null;
  m[0][5] = null;
  m[0][6] = null;
  const r = GM.impute(m, { method: 'mirror', canFill: all, pairs: PAIRS });
  assert.equal(r.matrix[0][1], null);
  assert.equal(r.matrix[0][5], null);
  assert.equal(r.filled[0].length, 0);
  assert.match(r.notes[0].reason, /mirror/i);
});

test('mirroring without any pairs says so', () => {
  const m = [SYM.map(p => p.slice())];
  m[0][3] = null;
  const r = GM.impute(m, { method: 'mirror', canFill: all, pairs: [] });
  assert.equal(r.matrix[0][3], null);
  assert.match(r.notes[0].reason, /pair/i);
});

test('mirroring first, then another method for the rest', () => {
  const r0 = rng(5);
  const m = Array.from({ length: 8 }, () => turn(SYM.map(p => p.map(v => v + 0.02 * (r0() - 0.5))), 6 * r0(), 6 * r0()));
  const truth = m[2][4].slice();
  m[2][4] = null;   // paired: mirrored
  m[2][1] = null;   // midline: thin-plate spline
  const r = GM.impute(m, { method: 'tps', mirrorFirst: true, canFill: all, pairs: PAIRS });
  assert.deepEqual(r.filled[2].map(f => [f.j, f.method]).sort(), [[1, 'tps'], [4, 'mirror']]);
  nearAll(r.matrix[2][4], truth, 0.1);
});

/* ---------- limits and choices ---------- */
test('only landmarks allowed by canFill are estimated', () => {
  const m = sample(3, 8);
  m[2][1] = null;
  m[2][4] = null;
  const r = GM.impute(m, { method: 'tps', canFill: (i, j) => j === 1 });
  assert.ok(r.matrix[2][1]);
  assert.equal(r.matrix[2][4], null);
});

test('a specimen with more gaps than the limit is left alone, with a note', () => {
  const m = sample(4, 8);
  m[2][1] = null;
  m[2][3] = null;
  m[5][0] = null;
  const r = GM.impute(m, { method: 'tps', canFill: all, max: 1 });
  assert.equal(r.matrix[2][1], null);
  assert.ok(r.matrix[5][0]);
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].i, 2);
  assert.match(r.notes[0].reason, /2 missing.*limit of 1/);
});

test('reference-based methods need three complete specimens', () => {
  const m = sample(5, 3);
  m[0][1] = null;
  for (const method of ['tps', 'reg', 'mean']) {
    const r = GM.impute(copy(m), { method, canFill: all });
    assert.equal(r.matrix[0][1], null, method);
    assert.match(r.notes[0].reason, /three complete/i);
  }
});

test('the reference can be limited to the specimen’s own group', () => {
  const a = sample(6, 6, base2, 0);
  const b = sample(7, 6, base2.map(([x, y]) => [x * 1.6, y]), 0);
  const m = [...a, ...b];
  const truth = m[8][2].slice();
  m[8][2] = null;
  const groups = [...a.map(() => 'A'), ...b.map(() => 'B')];
  const own = GM.impute(copy(m), { method: 'mean', canFill: all, groups });
  nearAll(own.matrix[8][2], truth, 1e-6);
  const pooled = GM.impute(copy(m), { method: 'mean', canFill: all });
  assert.ok(Math.hypot(pooled.matrix[8][2][0] - truth[0], pooled.matrix[8][2][1] - truth[1]) > 0.01);
});

test('a specimen without a group cannot use a group reference', () => {
  const m = sample(8, 8);
  m[0][1] = null;
  const r = GM.impute(m, { method: 'tps', canFill: all, groups: [null, 'A', 'A', 'A', 'A', 'A', 'A', 'A'] });
  assert.equal(r.matrix[0][1], null);
  assert.match(r.notes[0].reason, /group/i);
});

test('regression needs more complete specimens than missing coordinates', () => {
  const m = sample(9, 5);
  m[0][0] = null; m[0][1] = null; m[0][2] = null;
  const r = GM.impute(m, { method: 'reg', canFill: all });
  assert.equal(r.matrix[0][0], null);
  assert.match(r.notes[0].reason, /regression/i);
});

test('impute leaves the given matrix alone', () => {
  const m = sample(10, 8);
  m[2][1] = null;
  GM.impute(m, { method: 'tps', canFill: all });
  assert.equal(m[2][1], null);
});
