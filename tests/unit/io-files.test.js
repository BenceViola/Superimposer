'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');
const { doc2d } = require('./helpers.js');

const json = id => JSON.stringify(doc2d(id, [[1, 1], [2, 2], [3, 9]]));
const TPS = 'LM=3\n1 1\n2 2\n3 9\nID=T\n';

test('loads .lmk.json and .tps files together', async () => {
  const r = await IO.loadFiles([{ name: 'a.lmk.json', data: json('A') }, { name: 'set.tps', data: TPS }]);
  assert.deepEqual(r.specimens.map(s => s.id), ['A', 'T']);
  assert.equal(r.refused.length, 0);
});

test('bytes are decoded', async () => {
  const r = await IO.loadFiles([{ name: 'a.lmk.json', data: new TextEncoder().encode(json('A')) }]);
  assert.equal(r.specimens[0].id, 'A');
});

test('TPS files are recognised by content when the extension is .txt', async () => {
  const r = await IO.loadFiles([{ name: 'data.txt', data: TPS }]);
  assert.equal(r.specimens[0].id, 'T');
});

test('a bad file is refused with a reason; the others still load', async () => {
  const r = await IO.loadFiles([{ name: 'bad.lmk.json', data: '{oops' }, { name: 'a.lmk.json', data: json('A') }]);
  assert.equal(r.specimens.length, 1);
  assert.equal(r.refused[0].name, 'bad.lmk.json');
  assert.match(r.refused[0].reason, /JSON/);
});

test('a hand-in zip gives its .lmk.json files and ignores its TPS and CSV copies', async () => {
  const zip = IO.zipFiles([
    { name: 'A.lmk.json', data: json('A') }, { name: 'B.lmk.json', data: json('B') },
    { name: 'all.tps', data: TPS }, { name: 'all.csv', data: 'x' }, { name: 'README.txt', data: 'hello' },
  ]);
  const r = await IO.loadFiles([{ name: 'handin.zip', data: zip }]);
  assert.deepEqual(r.specimens.map(s => s.id), ['A', 'B']);
  assert.equal(r.refused.length, 0);
});

test('a zip holding only TPS uses it', async () => {
  const r = await IO.loadFiles([{ name: 'x.zip', data: IO.zipFiles([{ name: 'all.tps', data: TPS }]) }]);
  assert.equal(r.specimens[0].id, 'T');
});

test('a zip of hand-in zips is unpacked', async () => {
  const inner = IO.zipFiles([{ name: 'A.lmk.json', data: json('A') }]);
  const outer = IO.zipFiles([{ name: 'student1.zip', data: inner }]);
  const r = await IO.loadFiles([{ name: 'class.zip', data: outer }]);
  assert.equal(r.specimens[0].id, 'A');
});

test('a damaged zip is refused', async () => {
  const r = await IO.loadFiles([{ name: 'x.zip', data: new Uint8Array([1, 2, 3]) }]);
  assert.match(r.refused[0].reason, /zip/i);
});

test('compressed zips can be read', async () => {
  const { deflateRawSync } = require('node:zlib');
  const raw = new TextEncoder().encode(json('Z'));
  const comp = new Uint8Array(deflateRawSync(raw));
  const stored = IO.zipFiles([{ name: 'Z.lmk.json', data: comp }]);
  const v = new DataView(stored.buffer);
  v.setUint16(8, 8, true);                 // local header: method = deflate
  let p = 0;
  while (v.getUint32(p, true) !== 0x02014b50) p++;
  v.setUint16(p + 10, 8, true);            // central header: method = deflate
  const r = await IO.loadFiles([{ name: 'z.zip', data: stored }]);
  assert.equal(r.specimens[0].id, 'Z');
});

/* ---------- group tables ---------- */
const spec = (key, id) => ({ key, id });

test('reads a comma-separated table with quotes', () => {
  const t = IO.parseTable('specimen_id,site,"sex, adult"\nA,"North, Upper",F\n');
  assert.deepEqual(t.columns, ['specimen_id', 'site', 'sex, adult']);
  assert.equal(t.rows[0].site, 'North, Upper');
});

test('detects semicolons and tabs, and copes with a BOM and CRLF', () => {
  assert.deepEqual(IO.parseTable('﻿id;sp\r\nA;x\r\n').columns, ['id', 'sp']);
  assert.equal(IO.parseTable('id\tsp\nA\tx\n').rows[0].sp, 'x');
});

test('groups are joined by specimen id', () => {
  const r = IO.joinGroups([spec('A', 'A'), spec('A_r2', 'A'), spec('B', 'B')], IO.parseTable('specimen_id,site\nA,N\nB,S\n'));
  assert.deepEqual(r.values.map(v => v.site), ['N', 'N', 'S']);
  assert.deepEqual(r.factors, [{ name: 'site', levels: ['N', 'S'] }]);
});

test('an exact key match beats the specimen id', () => {
  const r = IO.joinGroups([spec('A_r2', 'A')], IO.parseTable('id,site\nA,N\nA_r2,S\n'));
  assert.equal(r.values[0].site, 'S');
});

test('without a known id column the first column is used', () => {
  const r = IO.joinGroups([spec('A', 'A')], IO.parseTable('Name,site\nA,N\n'));
  assert.equal(r.values[0].site, 'N');
  assert.equal(r.idColumn, 'Name');
});

test('unmatched specimens and unused table rows are reported', () => {
  const r = IO.joinGroups([spec('A', 'A'), spec('C', 'C')], IO.parseTable('id,site\nA,N\nB,S\n'));
  assert.deepEqual(r.unmatched, ['C']);
  assert.deepEqual(r.unused, ['B']);
  assert.equal(r.values[1].site, '');
});
