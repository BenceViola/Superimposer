'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../../src/plots.js');
const IO = require('../../src/io.js');
const GM = require('../../src/gm.js');
const { doc2d, tpl2d, rng, near } = require('./helpers.js');

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

/* ---------- specimen styles ---------- */
const KEYS = ['a', 'b', 'c', 'd'];
const G = { levels: ['N', 'S'], index: [0, 0, 1, -1], name: 's' };

test('resolveStyles: without groups everything is the first colour and a circle', () => {
  assert.deepEqual(PL.resolveStyles(KEYS, undefined, {}).map(s => [s.colour, s.marker]), KEYS.map(() => [0, 0]));
});

test('resolveStyles: style follows the group, ungrouped specimens are grey circles', () => {
  const s = PL.resolveStyles(KEYS, G, {});
  assert.deepEqual(s.map(x => [x.colour, x.marker]), [[0, 0], [0, 0], [1, 1], ['muted', 0]]);
  assert.ok(s.every(x => !x.overridden));
});

test('resolveStyles: an override changes only what it names, and is marked', () => {
  const s = PL.resolveStyles(KEYS, G, { b: { marker: 3 }, c: { colour: '#123456' } });
  assert.deepEqual([s[1].colour, s[1].marker, s[1].overridden], [0, 3, true]);
  assert.deepEqual([s[2].colour, s[2].marker, s[2].overridden], ['#123456', 1, true]);
});

test('colourValue: palette positions follow the theme, custom colours do not', () => {
  assert.equal(PL.colourValue(1, PL.THEMES.dark), PL.THEMES.dark.series[1]);
  assert.equal(PL.colourValue('#123456', PL.THEMES.dark), '#123456');
  assert.equal(PL.colourValue('muted', PL.THEMES.light), PL.THEMES.light.muted);
});

test('there are eight named markers', () => {
  assert.equal(PL.MARKER_NAMES.length, 8);
  assert.equal(new Set(PL.MARKER_NAMES).size, 8);
});

test('markerIcon draws a small stand-alone mark', () => {
  const s = PL.markerIcon({ colour: 1, marker: 2 }, PL.THEMES.light);
  wellFormed(s);
  assert.ok(s.includes(PL.THEMES.light.series[1]));
  assert.match(s, /<polygon/);
});

test('scatter: styles decide colour and marker', () => {
  const s = PL.scatter(Object.assign(base(), { styles: [{ colour: '#123456', marker: 3 }, { colour: 0, marker: 0 }, { colour: 0, marker: 0 }, { colour: 0, marker: 0 }] }));
  wellFormed(s);
  assert.ok(s.includes('#123456'));
  assert.equal(count(s, /<polygon/g), 1);
});

const styled = marker => res.prep.specimens.map((_, i) => ({ colour: i === 0 ? '#123456' : 0, marker: i === 0 ? marker : 0 }));

test('superimposition: a specimen’s marker is drawn at each of its points', () => {
  const s = PL.superimposition(sup({ styles: styled(1) }));
  wellFormed(s);
  assert.ok(s.includes('#123456'));
  const shaped = pathOf(s, 'cloud').find(d => d.includes('z'));
  assert.equal((shaped.match(/z/g) || []).length, 5);
  assert.equal(count(s, /M[-\d.]+ [-\d.]+h0/g), 5 * 5);
});

test('superimposition: group markers now appear in the cloud itself', () => {
  const s = PL.superimposition(sup({ groups: { levels: ['N', 'S'], index: [0, 0, 0, 1, 1, 1], name: 's' } }));
  assert.ok(pathOf(s, 'cloud').some(d => d.includes('z')));
  assert.equal(count(s, /M[-\d.]+ [-\d.]+h0/g), 3 * 5);
});

test('raw data: styles apply to the points and the outlines', () => {
  const s = PL.rawData(raw({ styles: styled(2) }));
  wellFormed(s);
  assert.ok(pathOf(s, 'cloud').some(d => d.includes('z')));
  assert.ok(s.includes('stroke="#123456"'));
});

test('raw data: links take each specimen’s colour', () => {
  const s = PL.rawData(raw({ styles: styled(0), links: LINKS }));
  assert.equal(pathOf(s, 'wire').length, 2);
  assert.ok(s.includes('stroke="#123456"'));
});

test('several specimens can be selected at once', () => {
  assert.equal(count(PL.superimposition(sup({ selected: ['A', 'C'] })), /class="selected"/g), 10);
  assert.equal(count(PL.scatter(Object.assign(base(), { selected: ['a', 'c'] })), /class="pt-label"/g), 2);
});

/* ---------- picking in the plot ---------- */
test('pixelToData inverts the scatter’s scale', () => {
  const o = Object.assign(base(), { width: 600, height: 400 });
  const s = PL.scatter(o);
  const map = s.match(/data-map="([^"]+)"/)[1];
  const hit = s.match(/class="hit" cx="([\d.]+)" cy="([\d.]+)"/);
  const [x, y] = PL.pixelToData(map, Number(hit[1]), Number(hit[2]));
  near(x, 1, 0.01);
  near(y, 2, 0.01);
});

test('pixelToData returns null outside the plot area', () => {
  const map = PL.scatter(base()).match(/data-map="([^"]+)"/)[1];
  assert.equal(PL.pixelToData(map, 2, 2), null);
});

test('scatter: theoretical positions are marked and named', () => {
  const s = PL.scatter(Object.assign(base(), { virtual: [{ x: 2, y: 2, label: 'Theoretical' }] }));
  wellFormed(s);
  assert.equal(count(s, /class="virtual"/g), 1);
  assert.match(s, /Theoretical/);
});

/* ---------- shape options ---------- */
const moved = () => res.gpa.consensus.map(p => p.map(v => v * 1.2));
const identity = q => q.slice();

test('shape change: the target can take a specimen’s colour', () => {
  const s = PL.shapeChange({ mean: res.gpa.consensus, target: moved(), rows: res.prep.rows, theme: PL.THEMES.light, targetColour: '#123456' });
  assert.ok(s.includes('fill="#123456"'));
});

test('shape change with a warp draws a grid instead of arrows and the mean', () => {
  const s = PL.shapeChange({ mean: res.gpa.consensus, target: moved(), rows: res.prep.rows, theme: PL.THEMES.light, warp: identity });
  wellFormed(s);
  assert.equal(pathOf(s, 'tps-grid').length, 1);
  assert.equal(count(s, /class="arrow"/g), 0);
  assert.equal(count(s, /class="mean"/g), 0);
  assert.equal(count(s, /class="target"/g), 5);
});

test('the grid follows the warp', () => {
  const a = PL.shapeChange({ mean: res.gpa.consensus, target: moved(), rows: res.prep.rows, theme: PL.THEMES.light, warp: identity });
  const b = PL.shapeChange({ mean: res.gpa.consensus, target: moved(), rows: res.prep.rows, theme: PL.THEMES.light, warp: q => [q[0] + 0.3 * Math.sin(6 * q[1]), q[1]] });
  assert.notEqual(pathOf(a, 'tps-grid')[0], pathOf(b, 'tps-grid')[0]);
});

test('the grid has straight lines for an identity warp and covers the shape', () => {
  const s = PL.shapeChange({ mean: res.gpa.consensus, target: res.gpa.consensus, rows: res.prep.rows, theme: PL.THEMES.light, warp: identity });
  const d = pathOf(s, 'tps-grid')[0];
  assert.ok((d.match(/M/g) || []).length >= 10, 'several lines');
  assert.doesNotMatch(d, /NaN/);
});

const tile = (label, over) => Object.assign({ target: moved(), label }, over);
const grid = (n, over) => PL.shapeGrid(Object.assign({ items: Array.from({ length: n }, (_, i) => tile(`S${i}`)), mean: res.gpa.consensus, rows: res.prep.rows, theme: PL.THEMES.light, width: 480 }, over));

test('shapeGrid draws each selected specimen in one figure', () => {
  const s = grid(4);
  wellFormed(s);
  assert.equal(count(s, /class="target"/g), 4 * 5);
  for (const n of ['S0', 'S1', 'S2', 'S3']) assert.ok(s.includes(`>${n}<`), n);
});

test('shapeGrid arranges one specimen large and more in two columns', () => {
  const size = s => Number(s.match(/height="(\d+)"/)[1]);
  assert.ok(size(grid(3)) > size(grid(2)), 'three need two rows');
  assert.equal(size(grid(3)), size(grid(4)));
  assert.ok(size(grid(1)) > size(grid(2)), 'one fills the width');
});

test('shapeGrid uses one column on a narrow screen', () => {
  const size = s => Number(s.match(/height="(\d+)"/)[1]);
  assert.ok(size(grid(2, { width: 300 })) > size(grid(2, { width: 480 })) * 0.9);
});

test('shapeGrid passes on links, colours and warps', () => {
  const s = PL.shapeGrid({ items: [tile('A', { colour: '#123456', warp: identity })], mean: res.gpa.consensus, rows: res.prep.rows, theme: PL.THEMES.light, width: 480, links: LINKS });
  wellFormed(s);
  assert.equal(pathOf(s, 'tps-grid').length, 1);
  assert.equal(pathOf(s, 'wire-target').length, 1);
  assert.ok(s.includes('#123456'));
});

test('shapeGrid with nothing selected is empty', () => {
  assert.equal(PL.shapeGrid({ items: [], mean: res.gpa.consensus, rows: res.prep.rows, theme: PL.THEMES.light }), '');
});

test('scatter: labels of neighbouring specimens do not sit on top of each other', () => {
  const s = PL.scatter(Object.assign(base(), { x: [1, 1.01, 3, 4], y: [2, 2.01, 4, 3], selected: ['a', 'b'] }));
  const ys = [...s.matchAll(/class="pt-label" x="[-\d.]+" y="([-\d.]+)"/g)].map(m => Number(m[1]));
  assert.equal(ys.length, 2);
  assert.ok(Math.abs(ys[0] - ys[1]) >= 12, String(ys));
});

/* ---------- imputed landmarks ---------- */
test('imputed landmarks are ringed in the raw view and the superimposition, with a legend entry', () => {
  for (const s of [PL.rawData(raw({ imputed: [[0, 1], [2, 3]] })), PL.superimposition(sup({ imputed: [[0, 1], [2, 3]] }))]) {
    wellFormed(s);
    assert.equal(count(s, /class="imputed"/g), 2);
    assert.match(s, /Imputed landmark/);
  }
  assert.equal(count(PL.superimposition(sup()), /class="imputed"/g), 0);
  assert.doesNotMatch(PL.superimposition(sup()), /Imputed landmark/);
});

test('scatter: specimens with imputed landmarks get a dashed ring and a legend entry', () => {
  const s = PL.scatter(Object.assign(base(), { rings: [false, true, false, true] }));
  wellFormed(s);
  assert.equal(count(s, /class="imputed-ring"/g), 2);
  assert.match(s, /Has imputed landmarks/);
});
