'use strict';
// Sliding semilandmarks, compared with geomorph's gpagen(curves = ...) with its default iterations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const GM = require('../../src/gm.js');
const IO = require('../../src/io.js');
const { near, rng, tpl2d, doc2d } = require('./helpers.js');
const REF = require('../fixtures/geomorph-sliders.json');

const fixture = name => fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8');
const TOL = 1e-7;

function load(dim) {
  const tag = dim === 2 ? '2d' : '3d';
  const ds = IO.assemble(IO.parseTPS(fixture(`curves-${tag}.tps`), 'c.tps').specimens);
  const sl = IO.parseSliders(fixture(`sliders-${tag}.csv`), ds.rows).sliders;
  const ids = ds.rows.map(r => r.id);
  return { matrix: ds.specimens.map(s => s.coords), sliders: sl.map(t => t.map(id => ids.indexOf(id))) };
}
/** Axis signs may differ from geomorph's principal axes, as in gm-geomorph.test.js. */
function flipsOf(mine, theirs) {
  return mine[0].map((_, d) => Math.sign(mine.reduce((s, p, i) => s + p[d] * theirs[i][d], 0)) || 1);
}

for (const [label, dim, R] of [['2D', 2, REF.two], ['3D', 3, REF.three]]) {
  const { matrix, sliders } = load(dim);
  for (const [method, ref] of [['be', R.be], ['procd', R.procd]]) {
    const name = method === 'be' ? 'bending energy' : 'Procrustes distance';
    test(`${label}, ${name}: slid coordinates match gpagen`, () => {
      const g = GM.gpa(matrix, { sliders, slide: method });
      // geomorph's consensus is the mean of the projected coordinates, which sliding leaves slightly off centre;
      // ours is that mean centred and scaled (the shape is the same).
      const theirs = GM.meanShape([ref.consensus]).map(p => p.slice());
      const c = theirs[0].map((_, d) => theirs.reduce((q, p) => q + p[d], 0) / theirs.length);
      theirs.forEach(p => p.forEach((v, d) => { p[d] = v - c[d]; }));
      const flips = flipsOf(g.consensus, theirs);
      g.consensus.forEach((p, i) => p.forEach((v, d) => near(v * flips[d], theirs[i][d], TOL, `consensus ${i}`)));
      g.tangent.forEach((c, n) => c.forEach((p, i) => p.forEach((v, d) => near(v * flips[d], ref.coords[n][i][d], TOL, `specimen ${n}, point ${i}`))));
      ref.csize.forEach((v, n) => near(g.csize[n], v, 1e-9 * v));
      assert.equal(g.slideIterations, ref.iter);
    });
  }
}

test('sliding by Procrustes distance brings specimens closer to the mean than leaving the points fixed', () => {
  const { matrix, sliders } = load(2);
  const ss = g => g.procD.reduce((s, d) => s + d * d, 0);
  assert.ok(ss(GM.gpa(matrix, { sliders, slide: 'procd' })) < 0.8 * ss(GM.gpa(matrix)));
});

test('without sliders the fit is the ordinary one', () => {
  const { matrix } = load(2);
  const a = GM.gpa(matrix), b = GM.gpa(matrix, { sliders: [], slide: 'be' });
  assert.deepEqual(a.consensus, b.consensus);
  assert.equal(b.slideIterations, undefined);
});

test('a bending-energy matrix that can’t be built (two points in one place) is reported, not a crash', () => {
  const { matrix, sliders } = load(2);
  const dup = matrix.map(c => c.map((p, i) => (i === 7 ? c[6].slice() : p)));
  assert.throws(() => GM.gpa(dup, { sliders, slide: 'be' }), /same place/);
});

test('sliding stays quick for many semilandmarks', () => {
  const r = rng(3), n = 40, m = 150, k = 3;
  const base = Array.from({ length: m + 4 }, (_, i) => (i < 4 ? [r(), r(), r()] : [Math.cos(i / 20), Math.sin(i / 20), i / 100]));
  const matrix = Array.from({ length: n }, () => base.map(p => p.map(v => v + 0.01 * r())));
  const sliders = [];
  for (let i = 5; i < m + 3; i++) sliders.push([i - 1, i, i + 1]);
  const t0 = Date.now();
  GM.gpa(matrix, { sliders, slide: 'be' });
  assert.ok(Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
});

/* ---------- prepare and analyse ---------- */
const P = [[10, 10], [60, 15], [70, 60], [20, 80], [40, 90]];
const LM = P.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` }));
function rec(id, r) {
  const t = tpl2d({ landmarks: LM, curves: [{ id: 'C01', name: 'Arc', start: 'LM01', end: 'LM02', n_points: 3 }] });
  const d = doc2d(id, P.map(p => [p[0] + 4 * r(), p[1] + 4 * r()]), { template: t });
  const pts = [0.25, 0.5, 0.75].map(u => { const s = u + 0.15 * (r() - 0.5); return { position: [10 + 50 * s, 10 + 5 * s - 20 * Math.sin(Math.PI * s)] }; });
  d.curves = [{ id: 'C01', template_id: 'C01', status: 'placed', points: pts }];
  return IO.parseLmk(d, id).specimens[0];
}
const r0 = rng(8);
const DS = IO.assemble(['A', 'B', 'C', 'D', 'E', 'F'].map(id => rec(id, r0)));
const SL = IO.templateSliders(DS.rows, DS.curves);

test('by default, semilandmarks are treated as fixed landmarks', () => {
  const p = GM.prepare(DS);
  assert.equal(p.rows.length, 8);
  assert.equal(p.semilandmarks, 'fixed');
  assert.deepEqual(p.sliders, []);
});

test('semilandmarks can be left out', () => {
  const p = GM.prepare(DS, { semilandmarks: 'omit' });
  assert.equal(p.rows.length, 5);
});

test('sliding gives the sliders as positions in the analysed rows', () => {
  const p = GM.prepare(DS, { semilandmarks: 'slide', sliders: SL });
  assert.equal(p.rows.length, 8);
  const ids = p.rows.map(r => r.id);
  assert.deepEqual(p.sliders.map(t => t.map(i => ids[i])), SL);
});

test('a slider whose neighbour is left out is fixed instead, with a note', () => {
  const p = GM.prepare(DS, { semilandmarks: 'slide', sliders: SL, excludePoints: new Set(['LM02']) });
  assert.equal(p.sliders.length, 2);
  assert.match(p.sliderNotes.join(' '), /C01_03.*LM02/);
});

test('rows that slide in a TPS sliders file count as semilandmarks', () => {
  const ds = IO.assemble(IO.parseTPS(fixture('curves-2d.tps'), 'c.tps').specimens);
  const sl = IO.parseSliders(fixture('sliders-2d.csv'), ds.rows).sliders;
  assert.equal(GM.prepare(ds, { semilandmarks: 'omit', sliders: sl }).rows.length, 24 - 17);
  assert.equal(GM.prepare(ds, { semilandmarks: 'slide', sliders: sl }).semilandmarksUsed, 17);
});

test('analyse slides, and keeps the fit without sliding to show the difference', () => {
  const res = GM.analyse(DS, { semilandmarks: 'slide', sliders: SL, slide: 'procd' });
  assert.ok(res.ok);
  assert.equal(res.gpa.slide, 'procd');
  assert.ok(res.gpa.slideIterations > 1);
  assert.equal(res.unslid.length, 6);
  const moved = res.unslid[0][5].some((v, d) => Math.abs(v - res.gpa.aligned[0][5][d]) > 1e-6);
  assert.ok(moved, 'semilandmarks moved');
  const fixedRes = GM.analyse(DS, { semilandmarks: 'fixed', sliders: SL });
  assert.equal(fixedRes.unslid, undefined);
});

/* ---------- exports ---------- */
const EX = require('../../src/exports.js');

test('settings say how semilandmarks were treated', () => {
  const slid = GM.analyse(DS, { semilandmarks: 'slide', sliders: SL, slide: 'be' });
  assert.match(EX.settingsText(slid, { semilandmarks: 'slide', slide: 'be' }, DS), /Semilandmarks: 3 slid by bending energy \(as geomorph's gpagen with ProcD = FALSE\), \d+ rounds/);
  const fixed = GM.analyse(DS, {});
  assert.match(EX.settingsText(fixed, {}, DS), /Semilandmarks: 3 treated as fixed landmarks/);
  const omit = GM.analyse(DS, { semilandmarks: 'omit' });
  assert.match(EX.settingsText(omit, { semilandmarks: 'omit' }, DS), /Semilandmarks: left out/);
});

test('the results include the sliders, numbered as the aligned coordinates, when sliding', () => {
  const slid = GM.analyse(DS, { semilandmarks: 'slide', sliders: SL, slide: 'procd' });
  const files = EX.bundle(slid, DS, { semilandmarks: 'slide', slide: 'procd' });
  const csv = files.find(f => f.name === 'sliders.csv');
  assert.ok(csv);
  assert.equal(csv.data, 'before,slide,after\n1,6,7\n6,7,8\n7,8,2\n');
  assert.ok(!EX.bundle(GM.analyse(DS, {}), DS, {}).some(f => f.name === 'sliders.csv'));
});
