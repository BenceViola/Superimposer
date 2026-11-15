'use strict';
// Which semilandmark slides between which neighbours: from the template's curves, or from a sliders file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const IO = require('../../src/io.js');
const { tpl2d, doc2d } = require('./helpers.js');

const fixture = name => fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8');
const P = [[10, 10], [60, 15], [70, 60], [20, 80], [40, 90]];
const LM = P.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` }));
const CURVES = [
  { id: 'C01', name: 'Arc', start: 'LM01', end: 'LM02', n_points: 6 },
  { id: 'C02', name: 'Eye', closed: true, n_points: 8 },
  { id: 'C03', name: 'Belly', n_points: 5 },
];
function curveDoc(id, coords) {
  const t = tpl2d({ landmarks: LM, curves: CURVES });
  const d = doc2d(id, coords.slice(0, 5), { template: t });
  let at = 5;
  d.curves = CURVES.map(c => {
    const points = coords.slice(at, at + c.n_points).map(position => ({ position }));
    at += c.n_points;
    return { id: c.id, template_id: c.id, status: 'placed', points };
  });
  return d;
}
const flat = Array.from({ length: 24 }, (_, i) => [10 + i, 20 + (i % 5)]);
const rowIds = rows => rows.map(r => r.id);

test('curve definitions are kept with the dataset', () => {
  const ds = IO.assemble([IO.parseLmk(curveDoc('a', flat), 'a').specimens[0]]);
  assert.deepEqual(ds.curves.map(c => [c.id, c.start, c.end, c.closed]), [['C01', 'LM01', 'LM02', false], ['C02', '', '', true], ['C03', '', '', false]]);
});

test('sliders from the template match the geomorph curves matrix of the same layout', () => {
  const ds = IO.assemble([IO.parseLmk(curveDoc('a', flat), 'a').specimens[0]]);
  const sl = IO.templateSliders(ds.rows, ds.curves);
  const ids = rowIds(ds.rows);
  const asNumbers = sl.map(t => t.map(id => ids.indexOf(id) + 1).join(','));
  assert.deepEqual(asNumbers, fixture('sliders-2d.csv').trim().split('\n').slice(1));
});

test('anchored ends slide towards their landmarks; free ends stay put', () => {
  const ds = IO.assemble([IO.parseLmk(curveDoc('a', flat), 'a').specimens[0]]);
  const sl = IO.templateSliders(ds.rows, ds.curves);
  assert.deepEqual(sl[0], ['LM01', 'C01_01', 'C01_02']);
  assert.deepEqual(sl[5], ['C01_05', 'C01_06', 'LM02']);
  const slid = new Set(sl.map(t => t[1]));
  assert.ok(!slid.has('C03_01') && !slid.has('C03_05'));
  assert.ok(slid.has('C03_02'));
});

test('a closed curve wraps round', () => {
  const ds = IO.assemble([IO.parseLmk(curveDoc('a', flat), 'a').specimens[0]]);
  const sl = IO.templateSliders(ds.rows, ds.curves);
  assert.deepEqual(sl.find(t => t[1] === 'C02_01'), ['C02_08', 'C02_01', 'C02_02']);
  assert.deepEqual(sl.find(t => t[1] === 'C02_08'), ['C02_07', 'C02_08', 'C02_01']);
});

test('an anchor that is not a landmark of the template leaves that end free', () => {
  const t = tpl2d({ landmarks: LM, curves: [{ id: 'C01', start: 'LM09', end: 'LM02', n_points: 2 }] });
  const d = doc2d('a', P, { template: t });
  d.curves = [{ id: 'C01', template_id: 'C01', status: 'placed', points: [{ position: [1, 1] }, { position: [2, 2] }] }];
  const ds = IO.assemble([IO.parseLmk(d, 'a').specimens[0]]);
  assert.deepEqual(IO.templateSliders(ds.rows, ds.curves), [['C01_01', 'C01_02', 'LM02']]);
});

test('TPS data have no curves until a sliders file is loaded', () => {
  const ds = IO.assemble(IO.parseTPS(fixture('curves-2d.tps'), 'c.tps').specimens);
  assert.deepEqual(ds.curves, []);
  assert.deepEqual(IO.templateSliders(ds.rows, ds.curves), []);
});

test('a sliders file in geomorph’s format (numbers, with a header) is read against the rows', () => {
  const ds = IO.assemble(IO.parseTPS(fixture('curves-2d.tps'), 'c.tps').specimens);
  const r = IO.parseSliders(fixture('sliders-2d.csv'), ds.rows);
  assert.deepEqual(r.errors, []);
  assert.equal(r.sliders.length, 17);
  assert.deepEqual(r.sliders[0], ['P01', 'P06', 'P07']);
});

test('sliders files may use point ids, and R’s write.csv row names are ignored', () => {
  const ds = IO.assemble([IO.parseLmk(curveDoc('a', flat), 'a').specimens[0]]);
  const ids = IO.parseSliders('before;slide;after\nLM01;C01_01;C01_02\nC01_01;C01_02;C01_03\n', ds.rows);
  assert.deepEqual(ids.errors, []);
  assert.deepEqual(ids.sliders, [['LM01', 'C01_01', 'C01_02'], ['C01_01', 'C01_02', 'C01_03']]);
  const named = IO.parseSliders('"","before","slide","after"\n"1",1,6,7\n"2",6,7,8\n', ds.rows);
  assert.deepEqual(named.errors, []);
  assert.deepEqual(named.sliders[1], ['C01_01', 'C01_02', 'C01_03']);
  const bare = IO.parseSliders('1 6 7\n6 7 8\n', ds.rows);
  assert.equal(bare.sliders.length, 2);
});

test('bad lines in a sliders file are reported, the rest kept', () => {
  const ds = IO.assemble([IO.parseLmk(curveDoc('a', flat), 'a').specimens[0]]);
  const r = IO.parseSliders('before,slide,after\n1,6,7\n1,99,7\nLM01,XX,LM02\n6,6,7\n1,6,8\n4,5\n', ds.rows);
  assert.equal(r.sliders.length, 1);
  assert.equal(r.errors.length, 5);
  assert.match(r.errors.join(' '), /line 3.*99/);
  assert.match(r.errors.join(' '), /XX/);
  assert.match(r.errors.join(' '), /line 6.*already/);
});

test('sliders written out as numbers for R', () => {
  const ds = IO.assemble([IO.parseLmk(curveDoc('a', flat), 'a').specimens[0]]);
  const sl = IO.templateSliders(ds.rows, ds.curves);
  assert.equal(IO.slidersCSV(sl, ds.rows), fixture('sliders-2d.csv'));
});
