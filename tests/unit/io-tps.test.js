'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');

test('reads a 2D block: coordinates, image, id', () => {
  const r = IO.parseTPS('LM=3\n1 2\n3 4\n5.5 6.25\nIMAGE=a.jpg\nID=A\n', 'x.tps');
  assert.equal(r.specimens.length, 1);
  const s = r.specimens[0];
  assert.equal(s.id, 'A');
  assert.equal(s.file, 'a.jpg');
  assert.equal(s.dim, 2);
  assert.equal(s.source, 'tps');
  assert.deepEqual(s.coords, [[1, 2], [3, 4], [5.5, 6.25]]);
  assert.deepEqual(s.status, ['placed', 'placed', 'placed']);
  assert.equal(s.units, 'px');
});

test('reads 3D blocks written as LM3=', () => {
  const s = IO.parseTPS('LM3=2\n1 2 3\n4 5 6\nID=B\n', 'x.tps').specimens[0];
  assert.equal(s.dim, 3);
  assert.deepEqual(s.coords, [[1, 2, 3], [4, 5, 6]]);
  assert.equal(s.units, 'unknown');
});

test('reads several specimens, each starting at its LM= line', () => {
  const r = IO.parseTPS('LM=1\n1 1\nID=A\nLM=1\n2 2\nID=B\nLM=1\n3 3\nID=C\n', 'x.tps');
  assert.deepEqual(r.specimens.map(s => s.id), ['A', 'B', 'C']);
  assert.deepEqual(r.specimens[2].coords, [[3, 3]]);
});

test('SCALE= multiplies the coordinates; units are "scaled"', () => {
  const s = IO.parseTPS('LM=2\n10 20\n30 40\nSCALE=0.5\nID=A\n', 'x.tps').specimens[0];
  assert.deepEqual(s.coords, [[5, 10], [15, 20]]);
  assert.equal(s.units, 'scaled');
});

test('SCALE= may come before the ID or after it', () => {
  const s = IO.parseTPS('LM=1\n10 20\nID=A\nSCALE=2\n', 'x.tps').specimens[0];
  assert.deepEqual(s.coords, [[20, 40]]);
});

test('-999 becomes a missing landmark', () => {
  const s = IO.parseTPS('LM=2\n-999 -999\n3 4\nID=A\n', 'x.tps').specimens[0];
  assert.deepEqual(s.coords, [null, [3, 4]]);
  assert.deepEqual(s.status, ['missing', 'placed']);
});

test('a missing landmark stays missing when SCALE is applied', () => {
  const s = IO.parseTPS('LM=2\n-999 -999\n3 4\nSCALE=2\nID=A\n', 'x.tps').specimens[0];
  assert.equal(s.coords[0], null);
  assert.deepEqual(s.coords[1], [6, 8]);
});

test('copes with Windows line ends, a BOM, lower-case tags, tabs and blank lines', () => {
  const s = IO.parseTPS('﻿lm=2\r\n1\t2\r\n\r\n3\t4\r\nid=A\r\nimage=a.tif\r\n', 'x.tps').specimens[0];
  assert.equal(s.id, 'A');
  assert.equal(s.file, 'a.tif');
  assert.deepEqual(s.coords, [[1, 2], [3, 4]]);
});

test('reads scientific notation', () => {
  const s = IO.parseTPS('LM=1\n1.5e2 -2E-1\nID=A\n', 'x.tps').specimens[0];
  assert.deepEqual(s.coords, [[150, -0.2]]);
});

test('without ID= the image name is used, without that a running number', () => {
  const r = IO.parseTPS('LM=1\n1 1\nIMAGE=dir/fish_01.jpg\nLM=1\n2 2\n', 'set.tps');
  assert.equal(r.specimens[0].id, 'fish_01');
  assert.equal(r.specimens[1].id, 'set_2');
});

test('reads the _r<n> replicate suffix from our own exports', () => {
  const r = IO.parseTPS('LM=1\n1 1\nID=SKULL_014_r2\nLM=1\n1 1\nID=SKULL_015\n', 'x.tps');
  assert.equal(r.specimens[0].id, 'SKULL_014');
  assert.equal(r.specimens[0].replicate, 2);
  assert.equal(r.specimens[1].id, 'SKULL_015');
  assert.equal(r.specimens[1].replicate, 1);
});

test('rows are numbered P01, P02, because TPS has no landmark names', () => {
  const s = IO.parseTPS('LM=2\n1 1\n2 2\nID=A\n', 'x.tps').specimens[0];
  assert.deepEqual(s.rows.map(r => r.id), ['P01', 'P02']);
  assert.deepEqual(s.rows.map(r => r.type), ['landmark', 'landmark']);
});

test('CURVES blocks are skipped and warned about, and their points are not landmarks', () => {
  const r = IO.parseTPS('LM=1\n1 1\nCURVES=2\nPOINTS=2\n5 5\n6 6\nPOINTS=1\n7 7\nID=A\nLM=1\n2 2\nID=B\n', 'x.tps');
  assert.equal(r.specimens.length, 2);
  assert.deepEqual(r.specimens[0].coords, [[1, 1]]);
  assert.equal(r.specimens[0].id, 'A');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /CURVES/);
});

test('OUTLINES blocks are skipped too', () => {
  const r = IO.parseTPS('LM=1\n1 1\nOUTLINES=1\nPOINTS=2\n5 5\n6 6\nID=A\n', 'x.tps');
  assert.deepEqual(r.specimens[0].coords, [[1, 1]]);
  assert.match(r.warnings[0], /OUTLINES/);
});

test('other tags (COMMENT, VARIABLES, RADII) are ignored', () => {
  const s = IO.parseTPS('LM=1\n1 1\nCOMMENT=hello 5 5\nVARIABLES=1\nRADII=1\nID=A\n', 'x.tps').specimens[0];
  assert.deepEqual(s.coords, [[1, 1]]);
});

test('a file with too few coordinate rows is refused, naming the specimen and line', () => {
  assert.throws(() => IO.parseTPS('LM=3\n1 1\n2 2\nID=A\n', 'x.tps'), /x\.tps.*line 4/);
});

test('a row with a bad number is refused', () => {
  assert.throws(() => IO.parseTPS('LM=1\n1 abc\nID=A\n', 'x.tps'), /line 2/);
});

test('a file with no LM= line is refused', () => {
  assert.throws(() => IO.parseTPS('hello\nworld\n', 'x.tps'), /no landmark blocks|LM=/i);
});

test('a block of curves only (LM=0) is refused as having no landmarks', () => {
  assert.throws(() => IO.parseTPS('LM=0\nCURVES=1\nPOINTS=1\n1 1\nID=A\n', 'x.tps'), /no fixed landmarks/i);
});
