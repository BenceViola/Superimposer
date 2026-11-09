'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LK = require('../../src/links.js');
const { rng } = require('./helpers.js');

const ids = ['LM01', 'LM02', 'LM03', 'LM04'];

test('toggle adds a link, and removes it whichever way round it is given', () => {
  let l = LK.toggle([], 'LM02', 'LM01');
  assert.deepEqual(l, [['LM01', 'LM02']]);
  l = LK.toggle(l, 'LM01', 'LM03');
  assert.equal(l.length, 2);
  l = LK.toggle(l, 'LM02', 'LM01');
  assert.deepEqual(l, [['LM01', 'LM03']]);
});

test('toggle ignores a landmark joined to itself', () => {
  assert.deepEqual(LK.toggle([], 'LM01', 'LM01'), []);
});

test('toggle does not change the list it was given', () => {
  const l = [['LM01', 'LM02']];
  LK.toggle(l, 'LM01', 'LM03');
  assert.equal(l.length, 1);
});

test('parse reads pairs separated by comma, semicolon, tab, space or dash', () => {
  const r = LK.parse('LM01,LM02\nLM02;LM03\nLM03\tLM04\nLM01 LM03\nLM02-LM04\n', ids);
  assert.equal(r.links.length, 5);
  assert.deepEqual(r.unknown, []);
});

test('parse skips a header, blank lines, a BOM and Windows line ends', () => {
  const r = LK.parse('﻿from,to\r\n\r\nLM01,LM02\r\n', ids);
  assert.deepEqual(r.links, [['LM01', 'LM02']]);
  assert.deepEqual(r.unknown, []);
});

test('parse drops duplicates, in either direction', () => {
  assert.equal(LK.parse('LM01,LM02\nLM02,LM01\n', ids).links.length, 1);
});

test('parse reports lines naming landmarks that are not in the data', () => {
  const r = LK.parse('LM01,LM02\nLM01,LM99\n', ids);
  assert.equal(r.links.length, 1);
  assert.deepEqual(r.unknown, ['LM01,LM99']);
});

test('toCSV can be read back', () => {
  const l = [['LM01', 'LM02'], ['LM03', 'LM04']];
  const csv = LK.toCSV(l);
  assert.equal(csv.split('\n')[0], 'from,to');
  assert.deepEqual(LK.parse(csv, ids).links, l);
});

test('indexPairs turns ids into row positions, and drops links to points not in use', () => {
  const rows = [{ id: 'LM01' }, { id: 'LM03' }, { id: 'LM04' }];
  assert.deepEqual(LK.indexPairs([['LM01', 'LM03'], ['LM01', 'LM02'], ['LM03', 'LM04']], rows), [[0, 1], [1, 2]]);
});

test('outline joins the outermost points in a ring', () => {
  const pts = [[0, 0], [4, 0], [4, 4], [0, 4], [2, 2]];
  const names = ['A', 'B', 'C', 'D', 'E'];
  const l = LK.outline(pts, names);
  assert.equal(l.length, 4);
  assert.ok(!l.flat().includes('E'));
  const degree = n => l.flat().filter(v => v === n).length;
  for (const n of ['A', 'B', 'C', 'D']) assert.equal(degree(n), 2);
});

test('triangulation of three points is the triangle', () => {
  assert.equal(LK.triangulate([[0, 0], [1, 0], [0, 1]], ['A', 'B', 'C']).length, 3);
});

test('fewer than three points, or points on a line, give no triangles and no error', () => {
  assert.deepEqual(LK.triangulate([[0, 0], [1, 0]], ['A', 'B']), []);
  assert.deepEqual(LK.triangulate([[0, 0], [1, 1], [2, 2], [3, 3]], ['A', 'B', 'C', 'D']), []);
});

const cloud = (seed, n) => { const r = rng(seed); return Array.from({ length: n }, () => [r(), r()]); };
const names = n => Array.from({ length: n }, (_, i) => `P${i}`);

test('triangulation has the edge count of a full triangulation', () => {
  for (const seed of [1, 2, 3]) {
    const pts = cloud(seed, 25);
    const h = LK.outline(pts, names(25)).length;
    assert.equal(LK.triangulate(pts, names(25)).length, 3 * 25 - 3 - h, `seed ${seed}`);
  }
});

test('triangulation includes the whole outline', () => {
  const pts = cloud(4, 20);
  const key = l => [...l].sort().join('|');
  const tri = new Set(LK.triangulate(pts, names(20)).map(key));
  for (const l of LK.outline(pts, names(20))) assert.ok(tri.has(key(l)), key(l));
});

test('triangles are Delaunay: no point lies inside any circumcircle', () => {
  const pts = cloud(5, 18);
  for (const [a, b, c] of LK.delaunay(pts)) {
    const [ax, ay] = pts[a], [bx, by] = pts[b], [cx, cy] = pts[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    const r2 = (ax - ux) ** 2 + (ay - uy) ** 2;
    pts.forEach((p, i) => {
      if (i === a || i === b || i === c) return;
      assert.ok((p[0] - ux) ** 2 + (p[1] - uy) ** 2 >= r2 - 1e-9, `point ${i}`);
    });
  }
});
