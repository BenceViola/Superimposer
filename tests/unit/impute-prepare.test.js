'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');
const GM = require('../../src/gm.js');
const EX = require('../../src/exports.js');
const { doc2d, tpl2d, near, nearAll, rng } = require('./helpers.js');

const BASE = [[10, 10], [60, 15], [70, 60], [20, 80], [40, 95], [45, 40]];
const t = tpl2d({ landmarks: BASE.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` })) });
const r = rng(71);
const pts = () => BASE.map(p => [p[0] + 5 * r(), p[1] + 5 * r()]);
const rec = (id, points, over) => IO.parseLmk(doc2d(id, points, Object.assign({ template: t }, over)), `${id}.lmk.json`).specimens[0];
const gappy = (id, gaps, notDone) => {
  const d = doc2d(id, pts(), { template: t });
  for (const j of gaps) d.landmarks[j] = { id: `LM0${j + 1}`, template_id: `LM0${j + 1}`, status: 'missing', position: null };
  for (const j of notDone || []) d.landmarks[j] = null;
  d.landmarks = d.landmarks.filter(Boolean);
  return IO.parseLmk(d, `${id}.lmk.json`).specimens[0];
};
const data = (...s) => IO.assemble(s);
const set = (...extra) => data(...['A', 'B', 'C', 'D', 'E', 'F'].map(id => rec(id, pts())), ...extra);
const TPS = { method: 'tps' };

test('without imputation a specimen with a gap is left out, as before', () => {
  const p = GM.prepare(set(gappy('G', [2])));
  assert.ok(!p.specimens.some(s => s.key === 'G'));
  assert.equal(p.imputedCount, 0);
});

test('with imputation the specimen stays, and its estimated landmark is recorded', () => {
  const p = GM.prepare(set(gappy('G', [2])), { impute: TPS });
  const i = p.specimens.findIndex(s => s.key === 'G');
  assert.ok(i >= 0);
  assert.ok(p.matrix[i][2]);
  assert.deepEqual(p.imputed[i], [{ j: 2, method: 'tps' }]);
  assert.equal(p.imputedCount, 1);
  assert.deepEqual(p.imputed.filter(x => x.length).length, 1);
});

test('landmarks not yet placed are only estimated on request', () => {
  const a = GM.prepare(set(gappy('G', [], [3])), { impute: TPS });
  assert.ok(!a.specimens.some(s => s.key === 'G'));
  const b = GM.prepare(set(gappy('G', [], [3])), { impute: Object.assign({ notDone: true }, TPS) });
  assert.ok(b.specimens.some(s => s.key === 'G'));
});

test('the limit per specimen is passed on, and its note names the specimen', () => {
  const p = GM.prepare(set(gappy('G', [1, 2])), { impute: Object.assign({ max: 1 }, TPS) });
  assert.ok(!p.specimens.some(s => s.key === 'G'));
  assert.equal(p.imputeNotes[0].key, 'G');
  assert.match(p.imputeNotes[0].reason, /limit of 1/);
});

test('gaps that could not be estimated still follow the missing-data choice', () => {
  const p = GM.prepare(set(gappy('G', [1, 2])), { impute: Object.assign({ max: 1 }, TPS), missing: 'points' });
  assert.ok(p.specimens.some(s => s.key === 'G'));
  assert.deepEqual(p.dropped.points.map(x => x.id), ['LM02', 'LM03']);
});

test('a flipped specimen is estimated in its flipped form', () => {
  const g = gappy('G', [2]);
  const p = GM.prepare(set(g), { impute: TPS, flip: new Set(['G']) });
  const i = p.specimens.findIndex(s => s.key === 'G');
  near(p.matrix[i][0][0], -g.coords[0][0], 1e-12);
  assert.ok(p.matrix[i][2]);
});

test('points left out by hand are not estimated, and do not count', () => {
  const p = GM.prepare(set(gappy('G', [2])), { impute: TPS, excludePoints: new Set(['LM03']) });
  assert.equal(p.imputedCount, 0);
  assert.ok(p.specimens.some(s => s.key === 'G'));
});

test('mirroring uses the pairs given as landmark ids', () => {
  const SYM = [[0, 0], [0, 40], [20, 10], [-20, 10], [30, 35], [-30, 35]];
  const sym = (id, gap) => {
    const d = doc2d(id, SYM.map(([x, y]) => [x + 100, 100 - y]), { template: t });
    if (gap != null) d.landmarks[gap] = { id: `LM0${gap + 1}`, template_id: `LM0${gap + 1}`, status: 'missing', position: null };
    return IO.parseLmk(d, id).specimens[0];
  };
  const p = GM.prepare(data(sym('A'), sym('B'), sym('C'), sym('G', 5)), { impute: { method: 'mirror', pairs: [['LM03', 'LM04'], ['LM05', 'LM06']] } });
  const i = p.specimens.findIndex(s => s.key === 'G');
  nearAll(p.matrix[i][5], p.matrix[0][5], 1e-9);
  assert.equal(p.imputed[i][0].method, 'mirror');
});

test('pairs naming landmarks not in use are ignored', () => {
  const p = GM.prepare(set(gappy('G', [2])), { impute: { method: 'mirror', pairs: [['LM03', 'LM99']] } });
  assert.match(p.imputeNotes[0].reason, /pair/);
});

test('the reference can be the specimen’s own group', () => {
  const groupOf = new Map([['A', 'x'], ['B', 'x'], ['C', 'x'], ['D', 'y'], ['E', 'y'], ['F', 'y'], ['G', 'y']]);
  const p = GM.prepare(set(gappy('G', [2])), { impute: Object.assign({ groupOf }, TPS) });
  assert.ok(p.specimens.some(s => s.key === 'G'));
  const q = GM.prepare(set(gappy('G', [2])), { impute: Object.assign({ groupOf: new Map([['G', 'z']]) }, TPS) });
  assert.match(q.imputeNotes[0].reason, /three complete/);
});

test('averaged replicates are estimated after averaging', () => {
  const a = gappy('G', [2]);
  const b = rec('G', pts(), { specimen: { replicate: 2 } });
  const p = GM.prepare(set(a, b), { replicates: 'average', impute: TPS });
  assert.equal(p.imputedCount, 0, 'the second replicate has the landmark');
});

test('analyse carries the imputation through to GPA and PCA', () => {
  const res = GM.analyse(set(gappy('G', [2]), gappy('H', [4])), { impute: TPS });
  assert.equal(res.ok, true);
  assert.equal(res.gpa.aligned.length, 8);
  assert.equal(res.prep.imputedCount, 2);
});

/* ---------- exports ---------- */
test('scores count the imputed landmarks of each specimen', () => {
  const res = GM.analyse(set(gappy('G', [2])), { impute: TPS });
  const parsed = IO.parseTable(EX.scoresCSV(res, null));
  assert.equal(parsed.rows.find(x => x.key === 'G').n_imputed, '1');
  assert.equal(parsed.rows.find(x => x.key === 'A').n_imputed, '0');
});

test('imputed.csv lists each estimate in the specimen’s own coordinates', () => {
  const g = gappy('G', [2]);
  const res = GM.analyse(set(g), { impute: TPS, flip: new Set(['G']) });
  const parsed = IO.parseTable(EX.imputedCSV(res));
  assert.deepEqual(parsed.columns, ['key', 'point', 'method', 'x', 'y']);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual([parsed.rows[0].key, parsed.rows[0].point, parsed.rows[0].method], ['G', 'LM03', 'thin-plate spline']);
  const i = res.prep.specimens.findIndex(s => s.key === 'G');
  near(Number(parsed.rows[0].x), -res.prep.matrix[i][2][0], 1e-6);
});

test('the bundle includes imputed.csv only when something was imputed', () => {
  const opts = { impute: TPS };
  const a = GM.analyse(set(gappy('G', [2])), opts);
  assert.ok(EX.bundle(a, set(), opts, null).some(f => f.name === 'imputed.csv'));
  const b = GM.analyse(set(), opts);
  assert.ok(!EX.bundle(b, set(), opts, null).some(f => f.name === 'imputed.csv'));
});

test('settings describe the imputation', () => {
  const d = set(gappy('G', [2]), gappy('H', [1, 3]));
  const opts = { impute: { method: 'tps', mirrorFirst: true, max: 1 } };
  const text = EX.settingsText(GM.analyse(d, opts), opts, d);
  assert.match(text, /Imputation: thin-plate spline, after mirroring paired landmarks/);
  assert.match(text, /at most 1 per specimen/);
  assert.match(text, /1 landmark imputed in 1 specimen/);
  assert.match(text, /H: .*limit of 1/);
});

test('settings say when nothing is imputed', () => {
  const d = set();
  assert.match(EX.settingsText(GM.analyse(d, {}), {}, d), /Imputation: none/);
});
