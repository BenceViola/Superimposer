'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../../src/gm.js');
const ref = require('../fixtures/geomorph-reference.json');
const { near, nearAll } = require('./helpers.js');

const src = [[0, 0], [4, 0.5], [5, 3], [1, 4], [-1, 2]];

test('the warp passes exactly through every landmark', () => {
  const tgt = src.map(([x, y], i) => [x + 0.2 * Math.sin(i * 2), y + 0.15 * Math.cos(i * 3)]);
  const w = GM.tpsWarp(src, tgt);
  src.forEach((p, i) => nearAll(w(p), tgt[i], 1e-9, `landmark ${i}`));
});

test('no change gives the identity everywhere', () => {
  const w = GM.tpsWarp(src, src);
  nearAll(w([2.5, 1.7]), [2.5, 1.7], 1e-9);
  nearAll(w([-7, 9]), [-7, 9], 1e-9);
});

test('an affine change is recovered exactly, away from the landmarks too', () => {
  const f = ([x, y]) => [1 + 2 * x - 0.5 * y, -3 + 0.4 * x + 1.5 * y];
  const w = GM.tpsWarp(src, src.map(f));
  for (const q of [[2, 2], [10, -4], [-3.3, 0.7]]) nearAll(w(q), f(q), 1e-8);
});

test('matches geomorph’s tps2d', () => {
  const { source, target, query, warped } = ref.tps;
  const w = GM.tpsWarp(source, target);
  query.forEach((q, i) => nearAll(w(q), warped[i], 1e-7, `query ${i}`));
});

test('landmarks on one line cannot define a warp', () => {
  assert.equal(GM.tpsWarp([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 1], [2, 2.5], [3, 3]]), null);
});

test('two landmarks in the same place cannot define a warp', () => {
  assert.equal(GM.tpsWarp([[0, 0], [0, 0], [2, 0], [1, 3]], [[0, 0], [1, 0], [2, 0], [1, 3]]), null);
});

test('a bend moves a point between landmarks by a sensible amount', () => {
  const tgt = src.map(p => p.slice());
  tgt[2] = [5.5, 3];
  const q = GM.tpsWarp(src, tgt)([2, 2]);
  assert.ok(q[0] > 2 && q[0] < 2.5, String(q));
  near(q[1], 2, 0.4);
});
