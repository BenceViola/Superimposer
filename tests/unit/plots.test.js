'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../../src/plots.js');
const IO = require('../../src/io.js');
const GM = require('../../src/gm.js');
const { doc2d, tpl2d, rng } = require('./helpers.js');

const count = (s, re) => (s.match(re) || []).length;
const wellFormed = s => {
  assert.match(s, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(s, /<\/svg>$/);
  assert.doesNotMatch(s, /NaN|undefined|Infinity/);
};

const r = rng(41);
const P = [[10, 10], [60, 15], [70, 60], [20, 80], [40, 90]];
const t = tpl2d({ landmarks: P.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` })) });
const rec = id => IO.parseLmk(doc2d(id, P.map(p => [p[0] + 6 * r(), p[1] + 6 * r()]), { template: t }), id).specimens[0];
const res = GM.analyse(IO.assemble(['A', 'B', 'C', 'D', 'E', 'F'].map(rec)));

const base = () => ({
  x: [1, 2, 3, 4], y: [2, 1, 4, 3], keys: ['a', 'b', 'c', 'd'], xLabel: 'PC1 (50%)', yLabel: 'PC2 (20%)',
  theme: PL.THEMES.light,
});

test('niceTicks gives round values inside the range', () => {
  const t = PL.niceTicks(0.013, 0.87, 5);
  assert.ok(t[0] >= 0.013 && t[0] <= 0.2 && t[t.length - 1] >= 0.8 && t[t.length - 1] <= 0.87, String(t));
  assert.ok(t.length >= 3 && t.length <= 11);
  assert.ok(t.every(v => Number(v.toPrecision(4)) === v));
});

test('niceTicks copes with a range of zero', () => {
  assert.ok(PL.niceTicks(5, 5, 5).length >= 1);
});

test('scatter: one mark per specimen, with axis titles', () => {
  const s = PL.scatter(base());
  wellFormed(s);
  assert.equal(count(s, /data-i="/g), 4);
  assert.match(s, /PC1 \(50%\)/);
  assert.match(s, /PC2 \(20%\)/);
});

test('scatter: a tooltip title on every point names the specimen', () => {
  assert.equal(count(PL.scatter(base()), /<title>[abcd]/g), 4);
});

test('scatter: no legend for one series', () => {
  assert.doesNotMatch(PL.scatter(base()), /class="legend"/);
});

test('scatter: groups get a legend, colours and shapes', () => {
  const s = PL.scatter(Object.assign(base(), { groups: { levels: ['N', 'S'], index: [0, 0, 1, 1], name: 'site' } }));
  wellFormed(s);
  assert.match(s, /class="legend"/);
  assert.match(s, />N</);
  assert.match(s, />S</);
  assert.ok(s.includes(PL.THEMES.light.series[0]) && s.includes(PL.THEMES.light.series[1]));
  assert.ok(count(s, /<polygon/g) >= 2, 'the second group uses a different marker shape');
});

test('scatter: specimens without a group are drawn in grey and named in the legend', () => {
  const s = PL.scatter(Object.assign(base(), { groups: { levels: ['N'], index: [0, 0, -1, -1], name: 'site' } }));
  assert.match(s, /No group/);
  assert.ok(s.includes(PL.THEMES.light.muted));
});

test('scatter: text is escaped', () => {
  const b = base();
  b.keys[0] = '<b>&x';
  const s = PL.scatter(b);
  assert.ok(s.includes('&lt;b&gt;&amp;x'));
  assert.ok(!s.includes('<b>&x'));
});

test('scatter: equal axes use the same scale in both directions', () => {
  const s = PL.scatter(Object.assign(base(), { x: [-1, 1, 0, 0.5], y: [-0.1, 0.1, 0, 0.05], equal: true, ticksDebug: true }));
  const m = s.match(/data-scale="([\d.]+),([\d.]+)"/);
  assert.equal(m[1], m[2]);
});

test('scatter: selected and outlying points are labelled, others not', () => {
  const s = PL.scatter(Object.assign(base(), { selected: 'b', outliers: [false, false, false, true] }));
  assert.equal(count(s, /class="pt-label"/g), 2);
});

test('scatter: hulls are drawn when asked, one per group with three points or more', () => {
  const b = Object.assign(base(), { x: [0, 1, 0, 5, 6], y: [0, 0, 1, 5, 5], keys: ['a', 'b', 'c', 'd', 'e'], groups: { levels: ['N', 'S'], index: [0, 0, 0, 1, 1], name: 's' }, hulls: true });
  assert.equal(count(PL.scatter(b), /class="hull"/g), 1);
});

test('hit areas can be left out of exported figures', () => {
  assert.ok(PL.scatter(base()).includes('class="hit"'));
  assert.ok(!PL.scatter(Object.assign(base(), { forExport: true })).includes('class="hit"'));
});

test('scree: one bar per component, and at most twelve', () => {
  const s = PL.scree({ proportion: [0.5, 0.3, 0.2], theme: PL.THEMES.light });
  wellFormed(s);
  assert.equal(count(s, /class="bar"/g), 3);
  assert.match(s, />PC1</);
  assert.match(s, /50\.0%/);
  const many = PL.scree({ proportion: Array(20).fill(0.05), theme: PL.THEMES.light });
  assert.equal(count(many, /class="bar"/g), 12);
});

const sup = over => Object.assign({ aligned: res.gpa.aligned, consensus: res.gpa.consensus, rows: res.prep.rows, keys: res.prep.specimens.map(s => s.key), theme: PL.THEMES.light }, over);

test('superimposition: every specimen’s points and the consensus are drawn', () => {
  const s = PL.superimposition(sup());
  wellFormed(s);
  assert.equal(count(s, /class="consensus"/g), 5);
  assert.equal(count(s, /class="cloud"/g), 1);
  assert.equal(count(s, /M[-\d.]+ [-\d.]+h0/g), 6 * 5);
});

test('superimposition: labels can be turned off', () => {
  assert.match(PL.superimposition(sup({ labels: true })), />LM01</);
  assert.doesNotMatch(PL.superimposition(sup({ labels: false })), />LM01</);
});

test('superimposition: a selected specimen is outlined', () => {
  const s = PL.superimposition(sup({ selected: 'C' }));
  assert.equal(count(s, /class="selected"/g), 5);
});

test('superimposition: one cloud per group', () => {
  const s = PL.superimposition(sup({ groups: { levels: ['N', 'S'], index: [0, 0, 0, 1, 1, 1], name: 's' } }));
  assert.equal(count(s, /class="cloud"/g), 2);
  assert.match(s, /class="legend"/);
});

test('2D shapes are drawn with y pointing up', () => {
  const pts = [[0, 0], [10, 0], [0, 10]];
  const s = PL.superimposition({ aligned: [pts], consensus: pts, rows: pts.map((_, i) => ({ id: `L${i}`, type: 'landmark', label: '' })), keys: ['a'], theme: PL.THEMES.light });
  const ys = [...s.matchAll(/class="consensus" cx="[-\d.]+" cy="([-\d.]+)"/g)].map(m => Number(m[1]));
  assert.ok(ys[2] < ys[0], 'the higher y value is nearer the top of the figure');
});

test('3D points are projected through the view', () => {
  const pts = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const front = PL.project(pts, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.deepEqual(front[3], [0, 0]);
  const side = PL.project(pts, [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]);
  assert.deepEqual(side[3], [1, 0]);
});

test('2D points pass through project unchanged', () => {
  assert.deepEqual(PL.project([[1, 2]], null), [[1, 2]]);
});

test('turning the view keeps it a rotation', () => {
  let v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let i = 0; i < 50; i++) v = PL.turnView(v, 0.13, -0.07);
  v.forEach((a, i) => v.forEach((b, j) => {
    const dot = a.reduce((s, x, k) => s + x * b[k], 0);
    assert.ok(Math.abs(dot - (i === j ? 1 : 0)) < 1e-9);
  }));
});

test('shape change: points and arrows for each landmark', () => {
  const target = res.gpa.consensus.map(p => p.map(v => v * 1.2));
  const s = PL.shapeChange({ mean: res.gpa.consensus, target, rows: res.prep.rows, theme: PL.THEMES.light, targetLabel: 'PC1 +0.05' });
  wellFormed(s);
  assert.equal(count(s, /class="arrow"/g), 5);
  assert.equal(count(s, /class="target"/g), 5);
  assert.equal(count(s, /class="mean"/g), 5);
  assert.match(s, /PC1 \+0\.05/);
});

test('shape change: curve points are joined with lines', () => {
  const pts = [[0, 0], [1, 1], [2, 0]];
  const rows = [{ id: 'L1', type: 'landmark', label: '' }, { id: 'C_01', type: 'curve', curve: 'C', index: 1 }, { id: 'C_02', type: 'curve', curve: 'C', index: 2 }];
  const s = PL.shapeChange({ mean: pts, target: pts, rows, theme: PL.THEMES.light });
  assert.equal(count(s, /class="curve-line"/g), 2);
});

test('repeatability: a bar for each landmark, flagged ones marked in words', () => {
  const s = PL.repeatabilityBars({
    rows: [{ id: 'LM01', name: 'a', mean: 1, pairs: 1, flag: false }, { id: 'LM02', name: 'b', mean: 5, pairs: 1, flag: true }, { id: 'LM03', name: 'c', mean: null, pairs: 0, flag: false }],
    units: 'mm', median: 1, theme: PL.THEMES.light,
  });
  wellFormed(s);
  assert.equal(count(s, /class="bar"/g), 2);
  assert.match(s, /check/);
  assert.match(s, /median/i);
});

test('all figures are readable by themselves: they carry a background and fonts', () => {
  const s = PL.scatter(base());
  assert.ok(s.includes(`fill="${PL.THEMES.light.surface}"`));
  assert.match(s, /font-family=/);
});

test('scree: on a narrow figure only every other component is named', () => {
  const s = PL.scree({ proportion: Array(12).fill(1 / 12), theme: PL.THEMES.light, width: 320 });
  assert.match(s, />PC1</);
  assert.doesNotMatch(s, />PC2</);
  assert.match(s, />PC3</);
});

const raw = over => Object.assign({ matrix: res.prep.matrix, keys: res.prep.specimens.map(s => s.key), theme: PL.THEMES.light }, over);

test('raw data: every point and one outline per specimen, and no consensus', () => {
  const s = PL.rawData(raw());
  wellFormed(s);
  assert.equal(count(s, /class="raw-outline"/g), 6);
  assert.equal(count(s, /M[-\d.]+ [-\d.]+h0/g), 6 * 5);
  assert.equal(count(s, /class="consensus"/g), 0);
});

test('raw data: specimens are drawn at their true relative size and place', () => {
  const small = [[0, 0], [1, 0], [0, 1]], big = small.map(p => [p[0] * 4 + 10, p[1] * 4]);
  const s = PL.rawData({ matrix: [small, big], keys: ['a', 'b'], theme: PL.THEMES.light, forExport: true });
  const xs = [...s.matchAll(/M([-\d.]+) [-\d.]+h0/g)].map(m => Number(m[1]));
  const spread = v => Math.max(...v) - Math.min(...v);
  const ratio = spread(xs.slice(3)) / spread(xs.slice(0, 3));
  assert.ok(Math.abs(ratio - 4) < 0.05, String(ratio));
});

test('raw data: y points up', () => {
  const s = PL.rawData({ matrix: [[[0, 0], [10, 0], [0, 10]]], keys: ['a'], theme: PL.THEMES.light });
  const ys = [...s.matchAll(/M[-\d.]+ ([-\d.]+)h0/g)].map(m => Number(m[1]));
  assert.ok(ys[2] < ys[0]);
});

test('raw data: groups get a legend and their own clouds', () => {
  const s = PL.rawData(raw({ groups: { levels: ['N', 'S'], index: [0, 0, 0, 1, 1, 1], name: 's' } }));
  assert.match(s, /class="legend"/);
  assert.equal(count(s, /class="cloud"/g), 2);
});

test('raw data: a selected specimen is picked out', () => {
  assert.equal(count(PL.rawData(raw({ selected: 'C' })), /class="selected"/g), 5);
});

test('raw data: 3D is projected through the view', () => {
  const m = [[[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 5]]];
  const a = PL.rawData({ matrix: m, keys: ['a'], theme: PL.THEMES.light, view: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
  const b = PL.rawData({ matrix: m, keys: ['a'], theme: PL.THEMES.light, view: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]] });
  wellFormed(a);
  assert.notEqual(a, b);
});

const pathOf = (s, cls) => [...s.matchAll(new RegExp(`class="${cls}" d="([^"]*)"`, 'g'))].map(m => m[1]);
const segments = d => (d.match(/L[-\d.]+ [-\d.]+/g) || []).length;
const LINKS = [[0, 1], [1, 2], [2, 3]];

test('raw data: links replace the outlines, and every specimen gets them', () => {
  const s = PL.rawData(raw({ links: LINKS }));
  wellFormed(s);
  assert.equal(count(s, /class="raw-outline"/g), 0);
  const wires = pathOf(s, 'wire');
  assert.equal(wires.length, 1);
  assert.equal(segments(wires[0]), 6 * LINKS.length);
});

test('raw data: links take the colour of their group', () => {
  const s = PL.rawData(raw({ links: LINKS, groups: { levels: ['N', 'S'], index: [0, 0, 0, 1, 1, 1], name: 's' } }));
  const wires = pathOf(s, 'wire');
  assert.equal(wires.length, 2);
  wires.forEach(w => assert.equal(segments(w), 3 * LINKS.length));
});

test('superimposition: links are drawn once, on the consensus', () => {
  const s = PL.superimposition(sup({ links: LINKS }));
  wellFormed(s);
  const wires = pathOf(s, 'wire');
  assert.equal(wires.length, 1);
  assert.equal(segments(wires[0]), LINKS.length);
});

test('superimposition: no links, no wire', () => {
  assert.equal(pathOf(PL.superimposition(sup()), 'wire').length, 0);
});

test('shape change: links are drawn on both shapes', () => {
  const target = res.gpa.consensus.map(p => p.map(v => v * 1.2));
  const s = PL.shapeChange({ mean: res.gpa.consensus, target, rows: res.prep.rows, theme: PL.THEMES.light, links: LINKS });
  wellFormed(s);
  assert.equal(segments(pathOf(s, 'wire-mean')[0]), LINKS.length);
  assert.equal(segments(pathOf(s, 'wire-target')[0]), LINKS.length);
});

test('editing: every landmark gets a large click target, naming its row', () => {
  const s = PL.superimposition(sup({ editing: true }));
  assert.equal(count(s, /class="lm-hit"/g), 5);
  assert.match(s, /data-lm="4"/);
  assert.equal(count(PL.superimposition(sup()), /class="lm-hit"/g), 0);
});

test('editing: semilandmarks can’t be linked', () => {
  const rows = res.prep.rows.map((r, i) => (i === 4 ? { id: 'C01_01', type: 'curve', curve: 'C01', index: 1 } : r));
  assert.equal(count(PL.superimposition(sup({ editing: true, rows })), /class="lm-hit"/g), 4);
});

test('editing: the landmark waiting for its partner is ringed', () => {
  assert.equal(count(PL.superimposition(sup({ editing: true, linkStart: 2 })), /class="link-start"/g), 1);
});

test('exported figures carry links but nothing from editing', () => {
  const s = PL.superimposition(sup({ editing: true, linkStart: 2, links: LINKS, forExport: true }));
  assert.equal(pathOf(s, 'wire').length, 1);
  assert.equal(count(s, /class="lm-hit"|class="link-start"/g), 0);
});
