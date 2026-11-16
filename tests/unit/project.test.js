'use strict';
// Project files: one zip with the original data files and project.json (settings, groups, links, flips…).
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');
const PJ = require('../../src/project.js');

const enc = s => new TextEncoder().encode(s);
const dec = b => new TextDecoder().decode(b);
const STATE = {
  missing: 'points', replicates: 'average', semilandmarks: 'slide', slide: 'procd', sizeCorrect: true, confirmTps: false,
  impute: { method: 'tps', mirrorFirst: true, max: 2, notDone: false, ref: 'form' },
  fitted: true, tab: 'morpho', colour: 'csv:form', labels: false, hulls: true, equal: true, groupMeans: true, ellipses: false,
  groupOverall: false, perms: 99, groupA: 'deep', groupB: 'all', groupStyle: 'grid', groupMag: 2, groupT: 0.5,
  pcX: 1, pcY: 2, shapePc: 0, shapeT: -0.5, mag: 1.5, sizePc: 'reg', shapeStyle: 'grid', alloStyle: 'arrows', alloMag: 1, alloT: 1, showBefore: true,
  view: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  table: { columns: ['specimen_id', 'form'], rows: [{ specimen_id: 'A', form: 'deep' }] },
  links: [['LM01', 'LM02']], styles: { A: { colour: 2 } }, pairs: [['LM01', 'LM05']], pairsFile: 'pairs.csv',
  sliders: [['LM01', 'C01_01', 'C01_02']], slidersFile: 'sl.csv',
  flip: new Set(['EX_07']), excludeSpecimens: new Set(['EX_03']), excludePoints: new Set(['LM09']),
};
const SOURCES = [{ name: 'a.lmk.json', data: enc('{"a":1}') }, { name: 'b.tps', data: enc('LM=1\n1 2\nID=b\n') }];
const DATE = new Date(2026, 10, 15, 12, 0, 0);

test('a project zip holds project.json, the data files unchanged, and a short read-me', async () => {
  const zip = PJ.build(PJ.snapshot(STATE), SOURCES, DATE);
  const entries = await IO.unzipFiles(zip);
  const names = entries.map(e => e.name);
  assert.deepEqual(names, ['project.json', 'README.txt', 'data/a.lmk.json', 'data/b.tps']);
  assert.equal(dec(entries[2].data), '{"a":1}');
  const p = JSON.parse(dec(entries[0].data));
  assert.equal(p.format, 'superimposer-project');
  assert.equal(p.version, 1);
  assert.equal(p.saved, DATE.toISOString());
  assert.deepEqual(p.data, ['data/a.lmk.json', 'data/b.tps']);
});

test('reading a project gives back the same settings, collections and files', async () => {
  const entries = await IO.unzipFiles(PJ.build(PJ.snapshot(STATE), SOURCES, DATE));
  assert.equal(PJ.isProject(entries), true);
  const r = PJ.read(entries);
  assert.deepEqual(r.warnings, []);
  for (const k of ['missing', 'replicates', 'semilandmarks', 'slide', 'sizeCorrect', 'tab', 'colour', 'perms', 'groupA', 'shapeT', 'sizePc', 'view', 'groupT']) {
    assert.deepEqual(r.state[k], STATE[k], k);
  }
  assert.deepEqual(r.state.impute, STATE.impute);
  assert.deepEqual(r.state.table, STATE.table);
  assert.deepEqual(r.state.links, STATE.links);
  assert.deepEqual(r.state.sliders, STATE.sliders);
  assert.deepEqual([...r.state.flip], ['EX_07']);
  assert.ok(r.state.excludeSpecimens instanceof Set && r.state.excludeSpecimens.has('EX_03'));
  assert.deepEqual(r.files.map(f => f.name), ['a.lmk.json', 'b.tps']);
  assert.equal(dec(r.files[1].data), 'LM=1\n1 2\nID=b\n');
});

test('damaged or unknown settings are left out with a warning; the rest is kept', () => {
  const p = PJ.snapshot(STATE);
  Object.assign(p.settings, { missing: 'everything', perms: 7, shapeT: 9, labels: 'yes', tab: 'nowhere', bogus: 1 });
  p.links = 'not a list';
  p.flip = [1, 2];
  const entries = [{ name: 'project.json', data: enc(JSON.stringify(p)) }, { name: 'data/a.lmk.json', data: enc('{}') }];
  const r = PJ.read(entries);
  for (const k of ['missing', 'perms', 'shapeT', 'labels', 'tab', 'bogus']) assert.equal(r.state[k], undefined, k);
  assert.equal(r.state.links, undefined);
  assert.equal(r.state.flip, undefined);
  assert.equal(r.state.replicates, 'average');
  assert.match(r.warnings.join(' '), /missing/);
  assert.match(r.warnings.join(' '), /links/);
  assert.equal(r.files.length, 1);
});

test('only zips with a Superimposer project.json are projects', () => {
  assert.equal(PJ.isProject([{ name: 'a.lmk.json', data: enc('{}') }]), false);
  assert.equal(PJ.isProject([{ name: 'project.json', data: enc('{"format":"something-else"}') }]), false);
  assert.equal(PJ.isProject([{ name: 'project.json', data: enc('not json') }]), false);
});

test('a project from a newer version is read with a warning', () => {
  const p = PJ.snapshot(STATE);
  p.version = 3;
  const r = PJ.read([{ name: 'project.json', data: enc(JSON.stringify(p)) }]);
  assert.match(r.warnings.join(' '), /newer version/);
  assert.equal(r.state.missing, 'points');
});

test('data files with the same name are kept apart', async () => {
  const zip = PJ.build(PJ.snapshot(STATE), [{ name: 'x.tps', data: enc('1') }, { name: 'x.tps', data: enc('2') }, { name: 'dir/x.tps', data: enc('3') }], DATE);
  const r = PJ.read(await IO.unzipFiles(zip));
  assert.deepEqual(r.files.map(f => f.name), ['x.tps', 'x (2).tps', 'x (3).tps']);
  assert.deepEqual(r.files.map(f => dec(f.data)), ['1', '2', '3']);
});

test('the file name says what the project is and when it was saved', () => {
  assert.equal(PJ.fileName('Example fish (invented data)', DATE), 'Example-fish-invented-data-2026-11-15.superimposer.zip');
  assert.equal(PJ.fileName('', DATE), 'project-2026-11-15.superimposer.zip');
});
