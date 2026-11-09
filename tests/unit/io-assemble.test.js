'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');
const { doc2d, doc3d, tpl2d } = require('./helpers.js');

const lmk = (id, pts, over) => IO.parseLmk(doc2d(id, pts || [[1, 1], [2, 2], [3, 9]], over), `${id}.lmk.json`).specimens[0];
const tps = text => IO.parseTPS(text, 'set.tps').specimens;

test('specimens sharing a template are combined', () => {
  const d = IO.assemble([lmk('A'), lmk('B')]);
  assert.equal(d.specimens.length, 2);
  assert.equal(d.dim, 2);
  assert.deepEqual(d.rows.map(r => r.id), ['LM01', 'LM02', 'LM03']);
  assert.equal(d.excluded.length, 0);
});

test('every specimen gets a unique key', () => {
  const d = IO.assemble([lmk('A'), lmk('A', null, { specimen: { replicate: 2 } }), lmk('A', null, { provenance: { operator: 'ann' } })]);
  assert.deepEqual(d.specimens.map(s => s.key), ['A', 'A_r2', 'A_ann']);
});

test('the most common template wins; others are excluded with a reason', () => {
  const other = { template: tpl2d({ id: 'other' }) };
  const d = IO.assemble([lmk('A', null, other), lmk('B'), lmk('C')]);
  assert.deepEqual(d.specimens.map(s => s.id), ['B', 'C']);
  assert.equal(d.excluded.length, 1);
  assert.equal(d.excluded[0].id, 'A');
  assert.match(d.excluded[0].reason, /template/i);
});

test('2D and 3D are never combined', () => {
  const m = IO.parseLmk(doc3d('M', [[1, 2, 3], [4, 5, 6], [7, 8, 8]]), 'm').specimens[0];
  const d = IO.assemble([lmk('A'), lmk('B'), m]);
  assert.equal(d.dim, 2);
  assert.equal(d.excluded[0].id, 'M');
});

test('the same file loaded twice counts once', () => {
  const d = IO.assemble([lmk('A'), lmk('A'), lmk('B')]);
  assert.equal(d.specimens.length, 2);
  assert.match(d.excluded[0].reason, /same/i);
});

test('same specimen and replicate, different points: both kept, with a warning', () => {
  const d = IO.assemble([lmk('A'), lmk('A', [[5, 5], [2, 2], [3, 9]]), lmk('B')]);
  assert.equal(d.specimens.length, 3);
  assert.equal(new Set(d.specimens.map(s => s.key)).size, 3);
  assert.match(d.warnings.join(' '), /operator/i);
});

test('TPS on its own needs no confirmation', () => {
  const d = IO.assemble(tps('LM=2\n1 1\n2 3\nID=A\nLM=2\n2 2\n3 5\nID=B\n'));
  assert.equal(d.specimens.length, 2);
  assert.equal(d.needsTpsConfirm, false);
  assert.deepEqual(d.rows.map(r => r.id), ['P01', 'P02']);
});

test('TPS blocks with a different point count are excluded', () => {
  const d = IO.assemble(tps('LM=2\n1 1\n2 3\nID=A\nLM=2\n2 2\n3 5\nID=B\nLM=1\n2 2\nID=C\n'));
  assert.deepEqual(d.specimens.map(s => s.id), ['A', 'B']);
  assert.match(d.excluded[0].reason, /1 point/);
});

const three = 'LM=3\n1 1\n2 2\n3 9\nID=T1\n';

test('TPS mixed with landmark-json waits for confirmation of the row order', () => {
  const d = IO.assemble([lmk('A'), lmk('B'), ...tps(three)]);
  assert.equal(d.specimens.length, 2);
  assert.equal(d.needsTpsConfirm, true);
  assert.equal(d.excluded[0].id, 'T1');
});

test('once confirmed, TPS rows take the template names', () => {
  const d = IO.assemble([lmk('A'), lmk('B'), ...tps(three)], { confirmTps: true });
  assert.equal(d.specimens.length, 3);
  assert.equal(d.needsTpsConfirm, false);
  assert.deepEqual(d.specimens[2].rows.map(r => r.id), ['LM01', 'LM02', 'LM03']);
});

test('TPS with the wrong number of points is excluded even when confirmed', () => {
  const d = IO.assemble([lmk('A'), lmk('B'), ...tps('LM=2\n1 1\n2 2\nID=T\n')], { confirmTps: true });
  assert.equal(d.specimens.length, 2);
  assert.match(d.excluded[0].reason, /2 point/);
});

test('mixed units give a warning about centroid size', () => {
  const a = doc2d('A', [[1, 1], [2, 2], [3, 9]]);
  a.specimen.image.scale = { value: 0.1, units: 'mm', method: 'manual' };
  const d = IO.assemble([IO.parseLmk(a, 'a').specimens[0], lmk('B')]);
  assert.match(d.warnings.join(' '), /centroid size/i);
  assert.equal(d.units, 'mixed');
});

test('a single unit is reported', () => {
  assert.equal(IO.assemble([lmk('A'), lmk('B')]).units, 'px');
});

test('no specimens gives an empty dataset, not an error', () => {
  const d = IO.assemble([]);
  assert.equal(d.specimens.length, 0);
  assert.deepEqual(d.rows, []);
});
