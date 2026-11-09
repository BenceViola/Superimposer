'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');
const GM = require('../../src/gm.js');
const EX = require('../../src/exports.js');
const { doc2d, tpl2d, rng } = require('./helpers.js');

const r = rng(31);
const P = [[10, 10], [60, 15], [70, 60], [20, 80]];
const t = tpl2d({ landmarks: P.map((_, i) => ({ id: `LM0${i + 1}`, name: i === 0 ? 'Snout, tip' : `L${i + 1}` })) });
const rec = id => {
  const d = doc2d(id, P.map(p => [p[0] + 4 * r(), p[1] + 4 * r()]), { template: t });
  d.specimen.image.scale = { value: 0.5, units: 'mm', method: 'manual' };
  return IO.parseLmk(d, id).specimens[0];
};
const data = IO.assemble(['A', 'B', 'C', 'D', 'E'].map(rec));
const res = GM.analyse(data);
const groups = { columns: ['site'], values: ['N', 'N', 'S', 'S', ''] };
const lines = s => s.trim().split('\n');

test('scores: one row per specimen, with size, distance, groups and PCs', () => {
  const L = lines(EX.scoresCSV(res, groups));
  assert.equal(L.length, 6);
  const head = L[0].split(',');
  for (const c of ['key', 'specimen_id', 'replicate', 'operator', 'centroid_size', 'units', 'procrustes_distance', 'site', 'PC1']) assert.ok(head.includes(c), c);
  assert.equal(head.filter(c => /^PC\d+$/.test(c)).length, res.pca.values.length);
  const row = L[1].split(',');
  assert.equal(row[head.indexOf('specimen_id')], 'A');
  assert.equal(row[head.indexOf('site')], 'N');
  assert.equal(row[head.indexOf('units')], 'mm');
  assert.ok(Math.abs(Number(row[head.indexOf('centroid_size')]) - res.gpa.csize[0]) < 1e-6);
  assert.ok(Math.abs(Number(row[head.indexOf('PC1')]) - res.pca.scores[0][0]) < 1e-8);
});

test('aligned coordinates: one row per specimen, one column per coordinate', () => {
  const L = lines(EX.alignedCSV(res));
  assert.equal(L.length, 6);
  assert.deepEqual(L[0].split(',').slice(0, 3), ['key', 'LM01_x', 'LM01_y']);
  assert.equal(L[1].split(',').length, 1 + 4 * 2);
  assert.ok(Math.abs(Number(L[1].split(',')[1]) - res.gpa.tangent[0][0][0]) < 1e-8);
});

test('consensus has quoted labels where needed', () => {
  const L = lines(EX.consensusCSV(res));
  assert.deepEqual(L[0].split(','), ['point', 'label', 'x', 'y']);
  assert.match(L[1], /^LM01,"Snout, tip",/);
  assert.equal(L.length, 5);
});

test('eigenvalues give the proportion and cumulative proportion', () => {
  const L = lines(EX.eigenCSV(res));
  assert.deepEqual(L[0].split(','), ['pc', 'eigenvalue', 'proportion', 'cumulative']);
  assert.equal(L.length, res.pca.values.length + 1);
  assert.ok(Math.abs(Number(L[L.length - 1].split(',')[3]) - 1) < 1e-6);
});

test('small eigenvalues keep their significant digits', () => {
  const L = lines(EX.eigenCSV(res));
  assert.notEqual(Number(L[1].split(',')[1]), 0);
  assert.ok(Math.abs(Number(L[1].split(',')[1]) / res.pca.values[0] - 1) < 1e-6);
});

test('loadings have one row per coordinate', () => {
  const L = lines(EX.loadingsCSV(res));
  assert.equal(L.length, 4 * 2 + 1);
  assert.deepEqual(L[0].split(',').slice(0, 3), ['coordinate', 'PC1', 'PC2']);
  assert.match(L[1], /^LM01_x,/);
});

test('settings note what was done and left out', () => {
  const m = EX.settingsText(res, { missing: 'specimens', semilandmarks: false, replicates: 'all' }, data);
  assert.match(m, /5 specimens/);
  assert.match(m, /4 points/);
  assert.match(m, /Superimposer/);
});

test('bundle collects every file', () => {
  const files = EX.bundle(res, data, { missing: 'specimens' }, groups);
  const names = files.map(f => f.name);
  for (const n of ['scores.csv', 'aligned-coordinates.csv', 'consensus.csv', 'eigenvalues.csv', 'loadings.csv', 'settings.txt']) assert.ok(names.includes(n), n);
});

test('repeatability table lists each landmark', () => {
  const a = doc2d('A', [[1, 1], [50, 2], [20, 30]]), b = doc2d('A', [[1, 2], [50, 3], [20, 31]]);
  a.specimen.replicate = 1; b.specimen.replicate = 2;
  const d = IO.assemble([IO.parseLmk(a, 'a').specimens[0], IO.parseLmk(b, 'b').specimens[0]]);
  const L = lines(EX.repeatabilityCSV(GM.repeatability(d)));
  assert.equal(L.length, 4);
  assert.match(L[0], /^id,name,specimens,pairs,mean,max,units,flagged/);
});
