'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');
const GM = require('../../src/gm.js');
const EXAMPLE = require('../../src/example.js');

async function load() {
  const ex = EXAMPLE.make();
  const r = await IO.loadFiles(ex.files);
  return { ex, r, data: IO.assemble(r.specimens) };
}

test('the example files load without problems', async () => {
  const { r, data } = await load();
  assert.equal(r.refused.length, 0);
  assert.equal(data.excluded.length, 0);
  assert.ok(data.specimens.length >= 20);
  assert.equal(data.dim, 2);
  assert.equal(data.units, 'mm');
});

test('the example is the same each time', () => {
  assert.deepEqual(EXAMPLE.make(), EXAMPLE.make());
});

test('the example contains one mirrored specimen for the check to find', async () => {
  const { data } = await load();
  const res = GM.analyse(data);
  assert.equal(res.ok, true);
  assert.equal(res.mirrored.length, 1);
});

test('once flipped, its two forms separate on PC1', async () => {
  const { ex, data } = await load();
  const first = GM.analyse(data);
  const res = GM.analyse(data, { flip: new Set(first.mirrored) });
  const g = IO.joinGroups(res.prep.specimens, IO.parseTable(ex.groups));
  const score = form => res.pca.scores.filter((_, i) => g.values[i].form === form).map(s => s[0]);
  const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
  const [a, b] = [score('deep'), score('slender')];
  assert.ok(a.length > 3 && b.length > 3);
  assert.ok(Math.abs(mean(a) - mean(b)) > 0.03);
  assert.ok(a.every(v => Math.sign(v) === Math.sign(a[0])) && b.every(v => Math.sign(v) === Math.sign(b[0])));
});

test('the example has replicates, and curve points', async () => {
  const { data } = await load();
  assert.ok(GM.repeatability(data).specimens.length >= 3);
  assert.ok(data.rows.some(r => r.type === 'curve'));
});

test('three example specimens have missing landmarks, for trying imputation', async () => {
  const { data } = await load();
  const gappy = data.specimens.filter(s => s.status.some(x => x === 'missing')).map(s => s.key);
  assert.deepEqual(gappy, ['EX_14', 'EX_17', 'EX_21']);
  const res = GM.analyse(data);
  assert.equal(res.prep.dropped.specimens.length, 3);
  const filled = GM.analyse(data, { impute: { method: 'tps', max: 3 } });
  assert.equal(filled.prep.imputedCount, 4);
  assert.equal(filled.prep.dropped.specimens.length, 0);
});
