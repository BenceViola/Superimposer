'use strict';
// Figures and tables for group comparisons.
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../../src/plots.js');
const EX = require('../../src/exports.js');
const IO = require('../../src/io.js');
const GM = require('../../src/gm.js');
const { doc2d, tpl2d, rng } = require('./helpers.js');

const count = (s, re) => (s.match(re) || []).length;
const wellFormed = s => {
  assert.match(s, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(s, /<\/svg>$/);
  assert.doesNotMatch(s, /NaN|undefined|Infinity/);
};

const r = rng(77);
const P = [[10, 10], [60, 15], [70, 60], [20, 80], [40, 90]];
const t = tpl2d({ landmarks: P.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` })) });
const names = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1'];
const rec = id => IO.parseLmk(doc2d(id, P.map((p, i) => [p[0] + 6 * r() + (id[0] === 'B' && i === 4 ? 12 : 0), p[1] + 6 * r()]), { template: t }), id).specimens[0];
const res = GM.analyse(IO.assemble(names.map(rec)));
const levels = ['alpha', 'beta', 'gamma'];
const index = res.prep.specimens.map(s => levels.indexOf({ A: 'alpha', B: 'beta', C: 'gamma' }[s.id[0]]));
const stats = GM.groupStats({ coords: res.gpa.tangent, csize: res.gpa.csize }, index, levels, { permutations: 49, seed: 3 });

test('group means: one configuration per group in its colour, with a legend', () => {
  const s = PL.groupMeans({ means: stats.groups.map(g => g.mean), levels: stats.groups.map(g => g.level), names: stats.groups.map(g => g.name), rows: res.prep.rows, theme: PL.THEMES.light });
  wellFormed(s);
  assert.equal(count(s, /class="group-mean"/g), 3);
  assert.equal(count(s, /class="gm-pt"/g), 3 * 5);
  for (const g of levels) assert.match(s, new RegExp(`>${g}<`));
  const c0 = PL.THEMES.light.series[0], c2 = PL.THEMES.light.series[2];
  assert.ok(s.includes(c0) && s.includes(c2));
});

test('group means: links are drawn on every mean', () => {
  const s = PL.groupMeans({ means: stats.groups.map(g => g.mean), levels: [0, 1, 2], names: levels, rows: res.prep.rows, links: [[0, 1], [1, 2]], theme: PL.THEMES.light });
  assert.equal(count(s, /class="wire-group"/g), 3);
});

test('group means: the overall mean can be added in grey', () => {
  const s = PL.groupMeans({ means: stats.groups.map(g => g.mean), levels: [0, 1, 2], names: levels, rows: res.prep.rows, overall: res.gpa.consensus, theme: PL.THEMES.light });
  assert.match(s, />All specimens</);
  assert.equal(count(s, /class="overall-pt"/g), 5);
});

test('shape change between two groups names both ends', () => {
  const s = PL.shapeChange({ mean: stats.groups[0].mean, target: stats.groups[1].mean, rows: res.prep.rows, theme: PL.THEMES.light, fromLabel: 'alpha', targetLabel: 'beta' });
  wellFormed(s);
  assert.match(s, /aria-label="Shape change from alpha to beta"/);
  assert.match(s, />alpha</);
});

test('scatter: group means as large marks and 95% ellipses', () => {
  const x = res.pca.scores.map(q => q[0]), y = res.pca.scores.map(q => q[1]);
  const groups = { name: 'g', levels, index };
  const ell = [0, 1].map(g => ({ g, points: GM.ellipse(x.filter((_, i) => index[i] === g), y.filter((_, i) => index[i] === g)) }));
  const s = PL.scatter({ x, y, keys: res.prep.specimens.map(q => q.key), groups, xLabel: 'PC1', yLabel: 'PC2', theme: PL.THEMES.light,
    groupMeans: [{ g: 0, x: 0.01, y: 0 }, { g: 1, x: -0.01, y: 0.002 }], ellipses: ell });
  wellFormed(s);
  assert.equal(count(s, /class="group-centre"/g), 2);
  assert.equal(count(s, /class="ellipse"/g), 2);
});

test('scatter: an ellipse far outside the points widens the axes to show it', () => {
  const s = PL.scatter({ x: [0, 1, 2], y: [0, 1, 0], keys: ['a', 'b', 'c'], xLabel: 'x', yLabel: 'y', theme: PL.THEMES.light, ellipses: [{ g: 0, points: [[10, 10], [11, 10], [10, 11]] }] });
  const map = s.match(/data-map="([^"]+)"/)[1].split(',').map(Number);
  const [, , pw, , x0, , sx] = map;
  assert.ok(x0 + pw / sx >= 11, 'x axis reaches the ellipse');
});

test('group summary table', () => {
  const csv = EX.groupSummaryCSV(stats, 'mm');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'group,n,mean_centroid_size,units,procrustes_variance');
  assert.equal(lines.length, 4);
  assert.match(lines[3], /^gamma,1,[\d.]+,mm,$/, 'a group of one has no variance');
});

test('pairwise table with p-values and the number of permutations', () => {
  const csv = EX.groupPairsCSV(stats);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'group_a,group_b,procrustes_distance,p_distance,variance_difference,p_variance,permutations');
  assert.equal(lines.length, 1 + 3);
  assert.match(lines[1], /^alpha,beta,[\d.e-]+,[\d.]+,[\d.e-]+,[\d.]+,49$/);
  assert.match(lines[2], /^alpha,gamma,[\d.e-]+,[\d.]+,,,49$/);
});

test('group means table: one row per group and point', () => {
  const csv = EX.groupMeansCSV(stats, res);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'group,point,label,x,y');
  assert.equal(lines.length, 1 + 3 * 5);
  assert.match(lines[1], /^alpha,LM01,L1,/);
});

test('the results bundle includes group tables when groups are given', () => {
  const files = EX.bundle(res, IO.assemble(names.map(rec)), {}, null, { stats, name: 'site', units: 'mm' });
  const got = files.map(x => x.name);
  for (const n of ['groups.csv', 'group-pairs.csv', 'group-means.csv']) assert.ok(got.includes(n), n);
  const settings = files.find(x => x.name === 'settings.txt').data;
  assert.match(settings, /Groups: site \(3 groups\); 49 permutations/);
  const none = EX.bundle(res, IO.assemble(names.map(rec)), {}, null).map(x => x.name);
  assert.ok(!none.includes('groups.csv'));
});
