'use strict';
// Compares the maths with values computed in R by geomorph (see tests/fixtures/geomorph-reference.R).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const GM = require('../../src/gm.js');
const IO = require('../../src/io.js');
const ref = require('../fixtures/geomorph-reference.json');
const { near } = require('./helpers.js');

const load = name => IO.parseTPS(fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8'), name).specimens.map(s => s.coords);

// geomorph stops after a few iterations (tol 1e-4), so its aligned coordinates are only that good.
const COORD_TOL = 5e-4;

for (const [label, file, key] of [['2D', 'synthetic-2d.tps', 'two'], ['3D', 'synthetic-3d.tps', 'three']]) {
  const raw = load(file), R = ref[key];
  const g = GM.gpa(raw), p = GM.pca(g.tangent);

  /** Each axis may differ in sign: pick the flips that match the consensus. */
  const flips = g.consensus[0].map((_, d) => {
    const dot = g.consensus.reduce((s, c, i) => s + c[d] * R.consensus[i][d], 0);
    return dot < 0 ? -1 : 1;
  });

  test(`${label}: TPS reading matches readland.tps`, () => {
    raw[0].forEach((c, i) => c.forEach((v, d) => near(v, R.first_raw[i][d], 1e-8)));
  });
  test(`${label}: centroid sizes match gpagen`, () => {
    g.csize.forEach((v, i) => near(v, R.csize[i], 1e-7, `specimen ${i}`));
  });
  test(`${label}: consensus matches gpagen`, () => {
    g.consensus.forEach((c, i) => c.forEach((v, d) => near(v * flips[d], R.consensus[i][d], COORD_TOL, `landmark ${i}`)));
  });
  test(`${label}: tangent coordinates match gpagen`, () => {
    g.tangent[0].forEach((c, i) => c.forEach((v, d) => near(v * flips[d], R.aligned_first[i][d], COORD_TOL, `first, landmark ${i}`)));
    g.tangent[R.n - 1].forEach((c, i) => c.forEach((v, d) => near(v * flips[d], R.aligned_last[i][d], COORD_TOL, `last, landmark ${i}`)));
  });
  test(`${label}: PC standard deviations match gm.prcomp`, () => {
    assert.equal(p.values.length, R.sdev.length);
    p.values.forEach((v, i) => near(Math.sqrt(v), R.sdev[i], 1e-4, `PC${i + 1}`));
  });
  test(`${label}: PC scores match gm.prcomp up to sign`, () => {
    for (const [c, col] of [[0, R.scores_pc1], [1, R.scores_pc2]]) {
      const s = Math.sign(p.scores.reduce((a, r, i) => a + r[c] * col[i], 0));
      p.scores.forEach((r, i) => near(r[c] * s, col[i], 1e-3, `PC${c + 1} specimen ${i}`));
    }
  });
}
