'use strict';
// Allometry by groups, compared with geomorph/RRPP using the same permutations:
// procD.lm(coords ~ log(Csize) + grp) and (coords ~ log(Csize) * grp), anova() of the two (test of slopes),
// pairwise(fit.u, groups, covariate) for slope angles and lengths, pairwise(fit.c, groups) for size-adjusted means.
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../../src/gm.js');
const REF = require('../fixtures/geomorph-reference.json');
const { near, rng } = require('./helpers.js');

const R = REF.allometry_groups, G = REF.groups;
const levels = ['a', 'b', 'c'];
const index = G.labels.map(l => levels.indexOf(l));
const fit = { tangent: G.coords, csize: G.csize };
const run = opts => GM.allometryByGroups(fit, index, levels, opts);
const ref = run({ perms: G.perms });

function table(mine, theirs, terms) {
  terms.forEach((t, j) => {
    near(mine.terms[j].ss, theirs.ss[j], 1e-12, `${t} SS`);
    assert.equal(mine.terms[j].df, theirs.df[j], `${t} df`);
    near(mine.terms[j].rsq, theirs.rsq[j], 1e-10, `${t} R²`);
    near(mine.terms[j].f, theirs.f[j], 1e-9, `${t} F`);
    near(mine.terms[j].p, theirs.p[j], 1e-12, `${t} p`);
  });
  const k = terms.length;
  near(mine.residual.ss, theirs.ss[k], 1e-12, 'residual SS');
  assert.equal(mine.residual.df, theirs.df[k]);
  near(mine.total.ss, theirs.ss[k + 1], 1e-12, 'total SS');
}

test('common slope: the table matches procD.lm(coords ~ log(Csize) + grp)', () => {
  table(ref.common, R.common, ['size', 'group']);
});

test('separate slopes: the table matches procD.lm(coords ~ log(Csize) * grp)', () => {
  table(ref.unique, R.unique, ['size', 'group', 'size × group']);
});

test('the test of slopes matches anova(common, separate)', () => {
  const t = ref.slopesTest;
  near(t.ss, R.slopes_test.ss, 1e-12);
  near(t.f, R.slopes_test.f, 1e-9);
  near(t.rsq, R.slopes_test.rsq, 1e-8);
  near(t.p, R.slopes_test.p, 1e-12);
  assert.equal(t.df, R.slopes_test.df);
});

test('group slopes match pairwise()', () => {
  ref.groups.forEach((g, k) => g.slope.forEach((p, i) => p.forEach((v, d) => near(v, R.slopes[k][i * 2 + d], 1e-10, `${g.name} ${i},${d}`))));
});

test('angles between slopes and differences in their length, with p-values, match pairwise()', () => {
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    near(ref.angle[a][b], R.angle[a][b], 1e-8, `angle ${a}-${b}`);
    near(ref.lengthDiff[a][b], R.length_diff[a][b], 1e-10, `length ${a}-${b}`);
    if (a === b) continue;
    near(ref.pAngle[a][b], R.p_angle[a][b], 1e-12, `p angle ${a}-${b}`);
    near(ref.pLength[a][b], R.p_length[a][b], 1e-12, `p length ${a}-${b}`);
  }
});

test('size-adjusted group means and their distances match pairwise() on the common-slope model', () => {
  ref.lsmeans.forEach((m, k) => m.forEach((p, i) => p.forEach((v, d) => near(v, R.lsmeans[k][i * 2 + d], 1e-10, `mean ${k}`))));
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    near(ref.lsmeanDist[a][b], R.lsmean_dist[a][b], 1e-10);
    if (a !== b) near(ref.pLsmean[a][b], R.p_lsmean[a][b], 1e-12);
  }
});

/* ---------- invented data ---------- */
function sample(seed, groups) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const coords = [], idx = [];
  groups.forEach(({ n, slope, shift = 0, sizeShift = 0 }, k) => {
    for (let i = 0; i < n; i++) {
      const lsz = 0.4 * g() + sizeShift, s = Math.exp(lsz);
      const base = [[0, 0], [1, 0], [1, 1 + slope[0] * lsz + shift], [0, 1], [0.5, 1.5 + slope[1] * lsz]];
      coords.push(base.map(p => [s * (p[0] + 0.03 * g()), s * (p[1] + 0.03 * g())]));
      idx.push(k);
    }
  });
  const fitted = GM.gpa(coords);
  return { fit: { tangent: fitted.tangent, csize: fitted.csize }, idx };
}

test('different slopes are detected; parallel slopes are not, and the groups still differ at the same size', () => {
  const diff = sample(1, [{ n: 20, slope: [0.4, 0] }, { n: 20, slope: [-0.3, 0.3] }]);
  const a = GM.allometryByGroups(diff.fit, diff.idx, ['x', 'y'], { permutations: 199, seed: 1 });
  assert.ok(a.slopesTest.p <= 0.01, `slopes p ${a.slopesTest.p}`);
  assert.ok(a.angle[0][1] > 45);
  const par = sample(2, [{ n: 20, slope: [0.4, 0], shift: 0 }, { n: 20, slope: [0.4, 0], shift: 0.1 }]);
  const b = GM.allometryByGroups(par.fit, par.idx, ['x', 'y'], { permutations: 199, seed: 1 });
  assert.ok(b.slopesTest.p > 0.05, `slopes p ${b.slopesTest.p}`);
  assert.ok(b.common.terms[1].p <= 0.01, `group p ${b.common.terms[1].p}`);
  assert.ok(b.pLsmean[0][1] <= 0.01);
});

test('groups too small or without size variation for a slope are left out, with a note', () => {
  const s = sample(3, [{ n: 10, slope: [0.3, 0] }, { n: 10, slope: [0.3, 0] }, { n: 2, slope: [0, 0] }]);
  const a = GM.allometryByGroups(s.fit, s.idx, ['x', 'y', 'z'], { permutations: 19 });
  assert.deepEqual(a.groups.map(g => g.name), ['x', 'y']);
  assert.match(a.notes.join(' '), /z.*left out/);
  const one = sample(4, [{ n: 10, slope: [0.3, 0] }, { n: 2, slope: [0, 0] }]);
  assert.equal(GM.allometryByGroups(one.fit, one.idx, ['x', 'y'], { permutations: 19 }), null, 'needs two groups');
});

test('specimens without a group are left out', () => {
  const s = sample(5, [{ n: 8, slope: [0.3, 0] }, { n: 8, slope: [0.3, 0] }]);
  const idx = s.idx.slice();
  idx[0] = -1; idx[9] = -1;
  const a = GM.allometryByGroups(s.fit, idx, ['x', 'y'], { permutations: 19 });
  assert.equal(a.unassigned, 2);
  assert.deepEqual(a.groups.map(g => g.n), [7, 7]);
  assert.equal(a.total.df, 13);
});

test('size ranges that hardly overlap are pointed out', () => {
  const s = sample(6, [{ n: 12, slope: [0.3, 0], sizeShift: 0 }, { n: 12, slope: [0.3, 0], sizeShift: 3 }]);
  const a = GM.allometryByGroups(s.fit, s.idx, ['x', 'y'], { permutations: 19 });
  assert.match(a.notes.join(' '), /overlap/);
});

test('predicted shapes: each group along its own slope, and along the common slope', () => {
  const s = sample(7, [{ n: 12, slope: [0.4, 0] }, { n: 12, slope: [-0.3, 0.3] }]);
  const a = GM.allometryByGroups(s.fit, s.idx, ['x', 'y'], { permutations: 0 });
  const g = a.groups[1];
  g.predict(g.meanLogSize).forEach((p, i) => p.forEach((v, d) => near(v, g.mean[i][d], 1e-12)));
  const lo = g.predict(g.range[0]), hi = g.predict(g.range[1]), mid = g.predict((g.range[0] + g.range[1]) / 2);
  mid.forEach((p, i) => p.forEach((v, d) => near(v, (lo[i][d] + hi[i][d]) / 2, 1e-12)));
  const c = g.predictCommon(a.adjustAt);
  c.forEach((p, i) => p.forEach((v, d) => near(v, a.lsmeans[1][i][d], 1e-12)));
  assert.equal(a.permutations, 0);
  assert.equal(a.slopesTest.p, null);
});

test('size correction within groups removes the common slope but keeps the group difference', () => {
  const s = sample(8, [{ n: 15, slope: [0.4, 0], shift: 0 }, { n: 15, slope: [0.4, 0], shift: 0.2, sizeShift: 0.5 }]);
  const a = GM.allometryByGroups(s.fit, s.idx, ['x', 'y'], { permutations: 0 });
  const corrected = a.corrected();
  const again = GM.allometryByGroups({ tangent: corrected, csize: s.fit.csize }, s.idx, ['x', 'y'], { permutations: 0 });
  let len = 0;
  for (const p of again.commonSlope) for (const v of p) len += v * v;
  assert.ok(Math.sqrt(len) < 1e-10, 'no common slope left');
  // The plain means of the corrected shapes differ by the size-adjusted difference between the groups…
  const meanDist = shapes => {
    const m = [0, 1].map(g => GM.meanShape(shapes.filter((_, i) => s.idx[i] === g)));
    let t = 0;
    m[0].forEach((p, i) => p.forEach((v, d) => { t += (v - m[1][i][d]) ** 2; }));
    return Math.sqrt(t);
  };
  near(meanDist(corrected), a.lsmeanDist[0][1], 1e-10);
  // …while the pooled correction takes part of the group difference with it, since the second group is larger.
  const pooled = GM.allometry(s.fit, { permutations: 0 }).corrected();
  assert.ok(Math.abs(meanDist(pooled) - a.lsmeanDist[0][1]) > 1e-3);
});

test('analyse corrects for size within groups when groups are given', () => {
  const s = sample(9, [{ n: 12, slope: [0.4, 0], shift: 0 }, { n: 12, slope: [0.4, 0], shift: 0.2, sizeShift: 0.5 }]);
  const IO = require('../../src/io.js');
  const { tpl2d, doc2d } = require('./helpers.js');
  const t = tpl2d({ landmarks: [0, 1, 2, 3, 4].map(i => ({ id: `LM0${i + 1}`, name: `L${i + 1}` })) });
  const raw = sample(9, [{ n: 12, slope: [0.4, 0], shift: 0 }, { n: 12, slope: [0.4, 0], shift: 0.2, sizeShift: 0.5 }]);
  void raw;
  const recs = s.fit.tangent.map((c, i) => IO.parseLmk(doc2d(`S${i}`, c.map(q => [q[0] * 100 * s.fit.csize[i] + 300, q[1] * 100 * s.fit.csize[i] + 300]), { template: t }), `S${i}`).specimens[0]);
  const ds = IO.assemble(recs);
  const keys = ds.specimens.map(x => x.key);
  const groupOf = keys.map((_, i) => s.idx[i]);
  const res = GM.analyse(ds, { sizeCorrect: true, sizeGroups: { index: groupOf, levels: ['x', 'y'] } });
  assert.equal(res.pca.sizeCorrected, 'groups');
  const pooled = GM.analyse(ds, { sizeCorrect: true });
  assert.equal(pooled.pca.sizeCorrected, true);
  assert.notEqual(res.pca.values[0], pooled.pca.values[0]);
});

test('stays quick for a class-sized data set', () => {
  const r = rng(10), n = 120, p = 60;
  const tangent = Array.from({ length: n }, () => Array.from({ length: p }, () => [r(), r(), r()]));
  const idx = tangent.map((_, i) => i % 4);
  const t0 = Date.now();
  GM.allometryByGroups({ tangent, csize: tangent.map(() => 1 + r()) }, idx, ['a', 'b', 'c', 'd'], { permutations: 999, seed: 1 });
  assert.ok(Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
});
