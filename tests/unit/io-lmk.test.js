'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');
const { doc2d, doc3d, tpl2d } = require('./helpers.js');

test('2D: y is flipped to point up, as in TPS', () => {
  const s = IO.parseLmk(doc2d('A', [[10, 20], [30, 40], [50, 60]]), 'a.lmk.json').specimens[0];
  assert.deepEqual(s.coords, [[10, 180], [30, 160], [50, 140]]);
  assert.equal(s.dim, 2);
  assert.equal(s.units, 'px');
  assert.equal(s.source, 'lmk');
});

test('2D: the scale is applied after the flip, and the unit kept', () => {
  const d = doc2d('A', [[10, 20], [30, 40], [50, 60]]);
  d.specimen.image.scale = { value: 0.5, units: 'mm', method: 'manual' };
  const s = IO.parseLmk(d, 'a.lmk.json').specimens[0];
  assert.deepEqual(s.coords[0], [5, 90]);
  assert.equal(s.units, 'mm');
});

test('a TPS export of a file and the file itself give the same coordinates', () => {
  // Landmarker2D writes y_tps = height − y, in pixels, plus SCALE=
  const d = doc2d('A', [[10, 20], [30, 40], [50, 60]]);
  d.specimen.image.scale = { value: 0.5, units: 'mm', method: 'manual' };
  const fromLmk = IO.parseLmk(d, 'a.lmk.json').specimens[0];
  const fromTps = IO.parseTPS('LM=3\n10 180\n30 160\n50 140\nSCALE=0.5\nID=A\n', 'a.tps').specimens[0];
  assert.deepEqual(fromLmk.coords, fromTps.coords);
});

test('3D: coordinates are unchanged, in millimetres', () => {
  const s = IO.parseLmk(doc3d('A', [[1, 2, 3], [4, 5, 6]]), 'a.lmk.json').specimens[0];
  assert.deepEqual(s.coords, [[1, 2, 3], [4, 5, 6]]);
  assert.equal(s.dim, 3);
  assert.equal(s.units, 'mm');
});

test('3D: cm, m and um are converted to mm', () => {
  const cases = { cm: 10, m: 1000, um: 0.001 };
  for (const [units, k] of Object.entries(cases)) {
    const s = IO.parseLmk(doc3d('A', [[1, 2, 3]], { units }), 'a').specimens[0];
    assert.deepEqual(s.coords, [[k, 2 * k, 3 * k]], units);
    assert.equal(s.units, 'mm');
  }
});

test('3D: unknown units stay unknown', () => {
  const s = IO.parseLmk(doc3d('A', [[1, 2, 3]], { units: 'unknown' }), 'a').specimens[0];
  assert.deepEqual(s.coords, [[1, 2, 3]]);
  assert.equal(s.units, 'unknown');
});

test('order comes from the template, not from the file', () => {
  const d = doc2d('A', [[1, 1], [2, 2], [3, 3]]);
  d.landmarks.reverse();
  const s = IO.parseLmk(d, 'a').specimens[0];
  assert.deepEqual(s.rows.map(r => r.id), ['LM01', 'LM02', 'LM03']);
  assert.deepEqual(s.coords[0], [1, 199]);
});

test('template.export_order decides the row order', () => {
  const d = doc2d('A', [[1, 1], [2, 2], [3, 3]], { template: tpl2d({ export_order: ['LM03', 'LM01', 'LM02'] }) });
  const s = IO.parseLmk(d, 'a').specimens[0];
  assert.deepEqual(s.rows.map(r => r.id), ['LM03', 'LM01', 'LM02']);
  assert.deepEqual(s.coords[0], [3, 197]);
});

test('template names become labels', () => {
  const s = IO.parseLmk(doc2d('A', [[1, 1], [2, 2], [3, 3]]), 'a').specimens[0];
  assert.deepEqual(s.rows.map(r => r.label), ['Snout', 'Eye', 'Tail']);
});

test('status: missing, not yet done and estimated are told apart', () => {
  const d = doc2d('A', [[1, 1], null, [3, 3]]);
  d.landmarks[2].status = 'estimated';
  const s = IO.parseLmk(d, 'a').specimens[0];
  assert.deepEqual(s.status, ['placed', 'missing', 'estimated']);
  assert.equal(s.coords[1], null);
  assert.deepEqual(s.coords[2], [3, 197]);

  d.landmarks.splice(0, 1);
  const t = IO.parseLmk(d, 'a').specimens[0];
  assert.deepEqual(t.status, ['not_done', 'missing', 'estimated']);
  assert.equal(t.coords[0], null);
});

const curveDoc = () => {
  const t = tpl2d({ curves: [{ id: 'C01', name: 'Back', start: 'LM01', end: 'LM03', n_points: 2 }] });
  const d = doc2d('A', [[1, 1], [2, 2], [3, 3]], { template: t });
  d.curves = [{ id: 'C01', template_id: 'C01', status: 'placed', points: [{ position: [10, 10] }, { position: [20, 20] }] }];
  return d;
};

test('curve points follow the landmarks, as C01_01, C01_02', () => {
  const s = IO.parseLmk(curveDoc(), 'a').specimens[0];
  assert.deepEqual(s.rows.map(r => r.id), ['LM01', 'LM02', 'LM03', 'C01_01', 'C01_02']);
  assert.equal(s.rows[3].type, 'curve');
  assert.equal(s.rows[3].curve, 'C01');
  assert.equal(s.rows[4].index, 2);
  assert.deepEqual(s.coords[4], [20, 180]);
});

test('an unfinished curve gives n_points empty rows, so every specimen has the same rows', () => {
  const d = curveDoc();
  d.curves[0].points.pop();
  const s = IO.parseLmk(d, 'a').specimens[0];
  assert.equal(s.coords.length, 5);
  assert.equal(s.coords[3], null);
  assert.equal(s.status[3], 'not_done');
});

test('a curve marked missing gives missing rows', () => {
  const d = curveDoc();
  d.curves[0] = { id: 'C01', template_id: 'C01', status: 'missing' };
  const s = IO.parseLmk(d, 'a').specimens[0];
  assert.equal(s.status[3], 'missing');
});

test('ad hoc points are left out, with a warning', () => {
  const d = doc2d('A', [[1, 1], [2, 2], [3, 3]]);
  d.landmarks.push({ id: 'X1', template_id: null, status: 'placed', position: [9, 9] });
  const r = IO.parseLmk(d, 'a');
  assert.equal(r.specimens[0].coords.length, 3);
  assert.match(r.warnings[0], /ad hoc/i);
});

test('replicate, operator, file name and checksum are read', () => {
  const d = doc2d('A', [[1, 1], [2, 2], [3, 3]], { specimen: { replicate: 2 }, provenance: { operator: ' student01 ' } });
  const s = IO.parseLmk(d, 'a.lmk.json').specimens[0];
  assert.equal(s.replicate, 2);
  assert.equal(s.operator, 'student01');
  assert.equal(s.file, 'A.png');
  assert.equal(s.sha, 'sha-A');
  assert.equal(s.sourceName, 'a.lmk.json');
});

test('replicate defaults to 1, operator to empty', () => {
  const s = IO.parseLmk(doc2d('A', [[1, 1], [2, 2], [3, 3]]), 'a').specimens[0];
  assert.equal(s.replicate, 1);
  assert.equal(s.operator, '');
});

test('the template signature is shared by files with the same landmarks', () => {
  const a = IO.parseLmk(doc2d('A', [[1, 1], [2, 2], [3, 3]]), 'a').specimens[0];
  const b = IO.parseLmk(doc2d('B', [[4, 1], [5, 2], [6, 3]]), 'b').specimens[0];
  const c = IO.parseLmk(doc2d('C', [[1, 1], [2, 2], [3, 3]], { template: tpl2d({ id: 'other' }) }), 'c').specimens[0];
  assert.equal(a.signature, b.signature);
  assert.notEqual(a.signature, c.signature);
});

test('renaming a landmark does not change the signature', () => {
  const t = tpl2d();
  t.landmarks[0] = { id: 'LM01', name: 'Renamed' };
  const a = IO.parseLmk(doc2d('A', [[1, 1], [2, 2], [3, 3]], { template: t }), 'a').specimens[0];
  const b = IO.parseLmk(doc2d('B', [[4, 1], [5, 2], [6, 3]]), 'b').specimens[0];
  assert.equal(a.signature, b.signature);
});

test('files that are not landmark-json are refused', () => {
  assert.throws(() => IO.parseLmk({ hello: 1 }, 'a.json'), /landmark-json/);
});

test('a newer major format version is refused; a newer minor is read', () => {
  const d = doc2d('A', [[1, 1], [2, 2], [3, 3]]);
  d.version = '1.0.0';
  assert.throws(() => IO.parseLmk(d, 'a'), /newer/);
  d.version = '0.9.0';
  assert.equal(IO.parseLmk(d, 'a').specimens.length, 1);
});

test('a file whose template is only a reference still loads, with a warning', () => {
  const d = doc2d('A', [[1, 1], [2, 2], [3, 3]]);
  d.template = { ref: 'fish.template.json', id: 'fish', version: '1.0' };
  const r = IO.parseLmk(d, 'a');
  assert.deepEqual(r.specimens[0].rows.map(x => x.id), ['LM01', 'LM02', 'LM03']);
  assert.match(r.warnings[0], /template/i);
});

test('bilateral pairs from the template are kept on the rows', () => {
  const t = tpl2d({ landmarks: [{ id: 'LM01', name: 'a' }, { id: 'LM02', name: 'L', bilateral_pair: 'LM03' }, { id: 'LM03', name: 'R', bilateral_pair: 'LM02' }] });
  const s = IO.parseLmk(doc2d('A', [[1, 1], [2, 2], [3, 3]], { template: t }), 'a').specimens[0];
  assert.deepEqual(s.rows.map(r => r.pair), ['', 'LM03', 'LM02']);
});

test('a pair naming a landmark not in the template is ignored', () => {
  const t = tpl2d({ landmarks: [{ id: 'LM01', name: 'a', bilateral_pair: 'LM99' }, { id: 'LM02', name: 'b' }, { id: 'LM03', name: 'c' }] });
  const s = IO.parseLmk(doc2d('A', [[1, 1], [2, 2], [3, 3]], { template: t }), 'a').specimens[0];
  assert.equal(s.rows[0].pair, '');
});

test('templatePairs lists each pair once', () => {
  const rows = [{ id: 'A', pair: '' }, { id: 'L', pair: 'R' }, { id: 'R', pair: 'L' }, { id: 'L2', pair: 'R2' }, { id: 'R2', pair: 'L2' }];
  assert.deepEqual(IO.templatePairs(rows), [['L', 'R'], ['L2', 'R2']]);
});
