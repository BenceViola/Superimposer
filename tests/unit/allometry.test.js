'use strict';
// Allometry: shape regressed on log centroid size, compared with geomorph's procD.lm(coords ~ log(Csize))
// using the same permutations, and regression scores as plotAllometry(method = "RegScore").
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../../src/gm.js');
const IO = require('../../src/io.js');
const EX = require('../../src/exports.js');
const REF = require('../fixtures/geomorph-reference.json');
const { near, rng } = require('./helpers.js');

const ref = REF.allometry, G = REF.groups;
const fit = { tangent: G.coords, csize: G.csize };

test('sums of squares, R² and F match procD.lm', () => {
  const a = GM.allometry(fit, { permutations: 0 });
  near(a.ss.model, ref.ss[0], 1e-12);
  near(a.ss.residual, ref.ss[1], 1e-12);
  near(a.ss.total, ref.ss[2], 1e-12);
  assert.deepEqual([a.df.model, a.df.residual, a.df.total], ref.df);
  near(a.rsq, ref.rsq, 1e-10);
  near(a.f, ref.f, 1e-9);
  assert.equal(a.p, null);
});

test('with the same permutations, p equals geomorph’s', () => {
  const a = GM.allometry(fit, { perms: G.perms });
  near(a.p, ref.p, 1e-12);
  assert.equal(a.permutations, G.perms.length);
});

test('the slope matches the regression coefficients', () => {
  const a = GM.allometry(fit, { permutations: 0 });
  a.slope.forEach((p, i) => p.forEach((v, d) => near(v, ref.slope[i * 2 + d], 1e-10, `${i},${d}`)));
});

test('regression scores match plotAllometry', () => {
  const a = GM.allometry(fit, { permutations: 0 });
  a.score.forEach((v, i) => near(v, ref.regscore[i], 1e-10, `specimen ${i}`));
});

test('predicted shapes: the mean at the mean size, and a straight line through log size', () => {
  const a = GM.allometry(fit, { permutations: 0 });
  const mid = a.logSize.reduce((s, v) => s + v, 0) / a.logSize.length;
  a.predict(mid).forEach((p, i) => p.forEach((v, d) => near(v, a.mean[i][d], 1e-12)));
  const lo = a.predict(a.range[0]), hi = a.predict(a.range[1]), half = a.predict((a.range[0] + a.range[1]) / 2);
  half.forEach((p, i) => p.forEach((v, d) => near(v, (lo[i][d] + hi[i][d]) / 2, 1e-12)));
  assert.deepEqual(a.range, [Math.min(...a.logSize), Math.max(...a.logSize)]);
});

/* ---------- invented data with real allometry ---------- */
function sample(seed, n) {
  const r = rng(seed), out = [];
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  for (let i = 0; i < n; i++) {
    const s = Math.exp(0.4 * g()), lsz = Math.log(s);
    const base = [[0, 0], [1, 0], [1, 1 + 0.3 * lsz], [0, 1], [0.5, 1.5 + 0.2 * lsz]];
    out.push(base.map(p => [s * (p[0] + 0.02 * g()) + 3, s * (p[1] + 0.02 * g()) - 1]));
  }
  return out;
}

test('real allometry is found and the test is significant', () => {
  const g = GM.gpa(sample(1, 30));
  const a = GM.allometry({ tangent: g.tangent, csize: g.csize }, { permutations: 199, seed: 1 });
  assert.ok(a.rsq > 0.5, `R² ${a.rsq}`);
  assert.ok(a.p <= 0.01);
});

test('permutations are repeatable with a seed', () => {
  const g = GM.gpa(sample(2, 20));
  const f = { tangent: g.tangent, csize: g.csize };
  assert.equal(GM.allometry(f, { permutations: 99, seed: 4 }).p, GM.allometry(f, { permutations: 99, seed: 4 }).p);
});

test('too few specimens, or all of one size: no regression', () => {
  const g = GM.gpa(sample(3, 2));
  assert.equal(GM.allometry({ tangent: g.tangent, csize: g.csize }), null);
  const h = GM.gpa(sample(3, 6));
  assert.equal(GM.allometry({ tangent: h.tangent, csize: h.csize.map(() => 2) }), null);
});

test('stays quick for a few hundred specimens with many landmarks', () => {
  const r = rng(5), n = 300, p = 400;
  const tangent = Array.from({ length: n }, () => Array.from({ length: p }, () => [r(), r(), r()]));
  const t0 = Date.now();
  GM.allometry({ tangent, csize: tangent.map(() => 1 + r()) }, { permutations: 999, seed: 1 });
  assert.ok(Date.now() - t0 < 6000, `${Date.now() - t0} ms`);
});

/* ---------- size-corrected morphospace ---------- */
const lmkDataset = () => {
  const IOd = require('./helpers.js');
  const P = [[10, 10], [60, 15], [70, 60], [20, 80], [40, 90]];
  const t = IOd.tpl2d({ landmarks: P.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` })) });
  return IO.assemble(sample(6, 16).map((c, i) => IO.parseLmk(IOd.doc2d(`S${i}`, c.map(q => [q[0] * 40 + 100, q[1] * 40 + 100]), { template: t }), `S${i}`).specimens[0]));
};

test('analyse gives the allometry; removing it leaves PC scores unrelated to size', () => {
  const ds = lmkDataset();
  const plain = GM.analyse(ds);
  assert.ok(plain.allometry && plain.allometry.rsq > 0.3);
  assert.equal(plain.pca.sizeCorrected, undefined);
  const corr = GM.analyse(ds, { sizeCorrect: true });
  assert.equal(corr.pca.sizeCorrected, true);
  const x = corr.allometry.logSize, mx = x.reduce((s, v) => s + v, 0) / x.length;
  for (let k = 0; k < 3; k++) {
    const y = corr.pca.scores.map(s => s[k]), my = y.reduce((s, v) => s + v, 0) / y.length;
    const cov = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0);
    assert.ok(Math.abs(cov) < 1e-10, `PC${k + 1}`);
  }
  assert.ok(corr.pca.values[0] < plain.pca.values[0]);
});

test('allometry tables and settings', () => {
  const ds = lmkDataset();
  const res = GM.analyse(ds);
  res.allometry = GM.allometry({ tangent: res.gpa.tangent, csize: res.gpa.csize }, { permutations: 99, seed: 1 });
  const csv = EX.allometryCSV(res);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'specimen,centroid_size,log_centroid_size,regression_score');
  assert.equal(lines.length, 1 + 16);
  const shapes = EX.allometryShapesCSV(res).trim().split('\n');
  assert.equal(shapes[0], 'point,label,x_smallest,y_smallest,x_largest,y_largest');
  assert.equal(shapes.length, 1 + 5);
  assert.match(EX.allometryLine(res.allometry), /^Allometry: shape on log centroid size \(as geomorph's procD\.lm\): R² = [\d.]+, F = [\d.]+, p = [\d.]+ \(99 permutations\)\.$/);
  const files = EX.bundle(res, ds, {}).map(f => f.name);
  assert.ok(files.includes('allometry.csv') && files.includes('allometry-shapes.csv'));
});
