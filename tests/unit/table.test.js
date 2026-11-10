'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const IO = require('../../src/io.js');
const GM = require('../../src/gm.js');
const TB = require('../../src/table.js');
const { doc2d, tpl2d, rng } = require('./helpers.js');

const r = rng(61);
const P = [[10, 10], [60, 15], [70, 60], [20, 80]];
const t = tpl2d({ landmarks: P.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` })) });
const pts = () => P.map(p => [p[0] + 6 * r(), p[1] + 6 * r()]);
const rec = (id, over = {}, points = pts()) => IO.parseLmk(doc2d(id, points, Object.assign({ template: t }, over)), `${id}.lmk.json`).specimens[0];
const rep2 = id => rec(id, { specimen: { replicate: 2 } });

const spec = (id, key = id) => ({ id, key });
const table = (text = 'specimen_id,site\nA,N\nB,S\n') => IO.parseTable(text);
const valueOf = (tb, id, col) => (tb.rows.find(x => x[TB.idColumn(tb)] === id) || {})[col];

/* ---------- editing group columns ---------- */
test('an empty table has only the id column', () => {
  assert.deepEqual(TB.emptyTable(), { columns: ['specimen_id'], rows: [] });
});

test('idColumn finds the column the groups are joined on', () => {
  assert.equal(TB.idColumn(table()), 'specimen_id');
  assert.equal(TB.idColumn(table('Name,site\nA,N\n')), 'Name');
});

test('addColumn adds a column and leaves the table it was given alone', () => {
  const a = table(), b = TB.addColumn(a, 'sex');
  assert.deepEqual(b.columns, ['specimen_id', 'site', 'sex']);
  assert.equal(a.columns.length, 2);
});

test('addColumn trims the name and refuses blank or existing names', () => {
  assert.deepEqual(TB.addColumn(table(), '  sex ').columns.slice(-1), ['sex']);
  assert.equal(TB.addColumn(table(), '   '), null);
  assert.equal(TB.addColumn(table(), 'site'), null);
  assert.equal(TB.addColumn(table(), 'specimen_id'), null);
});

test('removeColumn drops the column and its values', () => {
  const b = TB.removeColumn(table(), 'site');
  assert.deepEqual(b.columns, ['specimen_id']);
  assert.ok(b.rows.every(x => !('site' in x)));
});

test('setCells changes an existing row', () => {
  assert.equal(valueOf(TB.setCells(table(), [spec('A')], 'site', 'Z'), 'A', 'site'), 'Z');
});

test('setCells adds a row for a specimen not yet in the table', () => {
  assert.equal(valueOf(TB.setCells(table(), [spec('C')], 'site', 'Q'), 'C', 'site'), 'Q');
});

test('setCells leaves the table it was given alone', () => {
  const a = table();
  TB.setCells(a, [spec('A')], 'site', 'Z');
  assert.equal(valueOf(a, 'A', 'site'), 'N');
});

test('setCells assigns to many specimens at once', () => {
  const b = TB.setCells(table(), [spec('A'), spec('B'), spec('C')], 'site', 'Z');
  for (const id of ['A', 'B', 'C']) assert.equal(valueOf(b, id, 'site'), 'Z');
});

test('groups belong to the specimen ID, so replicates move together', () => {
  const list = [spec('A', 'A'), spec('A', 'A_r2')];
  const b = TB.setCells(table(), [list[1]], 'site', 'Z');
  const j = IO.joinGroups(list, b);
  assert.deepEqual(j.values.map(v => v.site), ['Z', 'Z']);
});

test('a table row written for one record is updated as well, so it can’t win over the edit', () => {
  const list = [spec('A', 'A_r2')];
  const b = TB.setCells(table('id,site\nA,N\nA_r2,S\n'), list, 'site', 'Z');
  assert.equal(IO.joinGroups(list, b).values[0].site, 'Z');
});

test('clearing the last value of a row removes the row', () => {
  const b = TB.setCells(table(), [spec('A')], 'site', '');
  assert.equal(b.rows.length, 1);
  assert.equal(b.rows[0].specimen_id, 'B');
});

test('clearing a specimen that has no row does nothing', () => {
  assert.equal(TB.setCells(table(), [spec('C')], 'site', '').rows.length, 2);
});

test('values are trimmed', () => {
  assert.equal(valueOf(TB.setCells(table(), [spec('A')], 'site', '  Z '), 'A', 'site'), 'Z');
});

test('groupsCSV can be read back, with awkward values intact', () => {
  const b = TB.setCells(table(), [spec('A')], 'site', 'North, "upper"');
  assert.deepEqual(IO.parseTable(TB.groupsCSV(b)), b);
});

test('parsePaste reads tab-separated cells and ignores the trailing line break', () => {
  assert.deepEqual(TB.parsePaste('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(TB.parsePaste('x\ny\n'), [['x'], ['y']]);
});

test('parsePaste keeps empty cells', () => {
  assert.deepEqual(TB.parsePaste('a\t\n\tb'), [['a', ''], ['', 'b']]);
});

/* ---------- rows ---------- */
const data = (...s) => IO.assemble(s);

test('rows: one per record, with its details', () => {
  const op = rec('A', { provenance: { operator: 'ann' } });
  const d = data(op, rec('B'), rec('C'));
  const rows = TB.buildRows(d, GM.analyse(d), null, new Set());
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].key, rows[0].id, rows[0].replicate, rows[0].operator, rows[0].source, rows[0].units], ['A_ann', 'A', 1, 'ann', 'A.lmk.json', 'px']);
  assert.equal(rows[0].use, true);
});

test('rows: centroid size is there before any fit is shown; distance only when asked for', () => {
  const d = data(rec('A'), rec('B'), rec('C'));
  const res = GM.analyse(d);
  const before = TB.buildRows(d, res, null, new Set());
  assert.ok(Math.abs(before[0].csize - res.gpa.csize[0]) < 1e-12);
  assert.equal(before[0].dist, null);
  const after = TB.buildRows(d, res, null, new Set(), { fitted: true });
  assert.ok(Math.abs(after[0].dist - res.gpa.procD[0]) < 1e-12);
});

test('rows: missing, not-done and estimated landmarks are counted', () => {
  const doc = doc2d('A', pts(), { template: t });
  doc.landmarks[0] = { id: 'LM01', template_id: 'LM01', status: 'missing', position: null };
  doc.landmarks[1].status = 'estimated';
  doc.landmarks.splice(2, 1);
  const d = data(IO.parseLmk(doc, 'a').specimens[0], rec('B'), rec('C'));
  const row = TB.buildRows(d, GM.analyse(d), null, new Set())[0];
  assert.deepEqual([row.missing, row.notDone, row.estimated], [1, 1, 1]);
  assert.equal(row.csize, null);
});

test('rows: semilandmarks count only when they are in use', () => {
  const tc = tpl2d({ landmarks: t.landmarks, curves: [{ id: 'C01', name: 'c', n_points: 2 }] });
  const d = data(IO.parseLmk(doc2d('A', pts(), { template: tc }), 'a').specimens[0]);
  assert.equal(TB.buildRows(d, null, null, new Set())[0].notDone, 0);
  assert.equal(TB.buildRows(d, null, null, new Set(), { semilandmarks: true })[0].notDone, 2);
});

test('rows: groups come through the usual join', () => {
  const d = data(rec('A'), rep2('A'), rec('B'));
  const rows = TB.buildRows(d, null, table(), new Set());
  assert.deepEqual(rows.map(x => x.groups.site), ['N', 'N', 'S']);
});

test('rows: specimens left out by hand are marked', () => {
  const d = data(rec('A'), rec('B'), rec('C'));
  assert.equal(TB.buildRows(d, null, null, new Set(['B']))[1].use, false);
});

test('rows: work with no analysis at all', () => {
  const d = data(rec('A'), rec('B'));
  const row = TB.buildRows(d, { ok: false }, null, new Set())[0];
  assert.equal(row.csize, null);
});

/* ---------- sorting and filtering ---------- */
const rows = () => [
  { key: 'S10', id: 'S10', csize: 5, operator: 'bob', source: 'x', units: 'mm', groups: { site: 'N' } },
  { key: 'S2', id: 'S2', csize: null, operator: 'ann', source: 'y', units: 'mm', groups: { site: '' } },
  { key: 'S1', id: 'S1', csize: 9, operator: 'cid', source: 'z', units: 'px', groups: { site: 'Lake' } },
];

test('sorting text is natural: S2 comes before S10', () => {
  assert.deepEqual(TB.sortRows(rows(), 'key', 1).map(x => x.key), ['S1', 'S2', 'S10']);
});

test('sorting numbers, in both directions, always puts blanks last', () => {
  assert.deepEqual(TB.sortRows(rows(), 'csize', 1).map(x => x.key), ['S10', 'S1', 'S2']);
  assert.deepEqual(TB.sortRows(rows(), 'csize', -1).map(x => x.key), ['S1', 'S10', 'S2']);
});

test('sorting by a group column', () => {
  assert.deepEqual(TB.sortRows(rows(), 'group:site', 1).map(x => x.key), ['S1', 'S10', 'S2']);
});

test('sorting leaves the given list alone', () => {
  const a = rows();
  TB.sortRows(a, 'key', 1);
  assert.equal(a[0].key, 'S10');
});

test('filtering looks at names, operators, files, units and groups, ignoring case', () => {
  assert.deepEqual(TB.filterRows(rows(), 'ANN').map(x => x.key), ['S2']);
  assert.deepEqual(TB.filterRows(rows(), 'lake').map(x => x.key), ['S1']);
  assert.deepEqual(TB.filterRows(rows(), 'px').map(x => x.key), ['S1']);
  assert.equal(TB.filterRows(rows(), '  ').length, 3);
});

/* ---------- downloading the table ---------- */
test('the table downloads with details and groups', () => {
  const d = data(rec('A'), rec('B'), rec('C'));
  const csv = TB.tableCSV(TB.buildRows(d, GM.analyse(d), table(), new Set(['C'])), ['site'], d.rows, {});
  const parsed = IO.parseTable(csv);
  assert.deepEqual(parsed.columns.slice(0, 2), ['key', 'specimen_id']);
  assert.ok(parsed.columns.includes('site') && parsed.columns.includes('in_analysis') && parsed.columns.includes('centroid_size'));
  assert.equal(parsed.rows[0].site, 'N');
  assert.equal(parsed.rows[2].in_analysis, 'no');
});

test('coordinates are included on request, with NA where missing', () => {
  const doc = doc2d('A', pts(), { template: t });
  doc.landmarks[0] = { id: 'LM01', template_id: 'LM01', status: 'missing', position: null };
  const d = data(IO.parseLmk(doc, 'a').specimens[0], rec('B'));
  const parsed = IO.parseTable(TB.tableCSV(TB.buildRows(d, null, null, new Set()), [], d.rows, { coords: true }));
  assert.ok(parsed.columns.includes('LM01_x') && parsed.columns.includes('LM04_y'));
  assert.equal(parsed.rows[0].LM01_x, 'NA');
  assert.notEqual(parsed.rows[0].LM02_x, 'NA');
});

test('coordinate columns can skip points, keeping each point’s own values', () => {
  const pts2 = [[1, 1], [2, 2], [3, 9], [40, 50]];
  const d = data(rec('A', {}, pts2));
  const chosen = [{ id: 'LM04', at: 3 }];
  const parsed = IO.parseTable(TB.tableCSV(TB.buildRows(d, null, null, new Set()), [], chosen, { coords: true }));
  assert.equal(parsed.rows[0].LM04_x, '40');
});

/* ---------- renaming columns ---------- */
test('renameColumn keeps the position and the values', () => {
  const b = TB.renameColumn(IO.parseTable('specimen_id,site,sex\nA,N,F\nB,S,M\n'), 'site', 'locality');
  assert.deepEqual(b.columns, ['specimen_id', 'locality', 'sex']);
  assert.deepEqual(b.rows.map(r => r.locality), ['N', 'S']);
  assert.ok(b.rows.every(r => !('site' in r)));
});

test('renameColumn trims the new name and leaves the given table alone', () => {
  const a = table(), b = TB.renameColumn(a, 'site', '  place ');
  assert.deepEqual(b.columns, ['specimen_id', 'place']);
  assert.deepEqual(a.columns, ['specimen_id', 'site']);
});

test('renameColumn refuses blank and taken names, and the id column', () => {
  const two = IO.parseTable('specimen_id,site,sex\nA,N,F\n');
  assert.equal(TB.renameColumn(two, 'site', ' '), null);
  assert.equal(TB.renameColumn(two, 'site', 'sex'), null);
  assert.equal(TB.renameColumn(two, 'site', 'specimen_id'), null);
  assert.equal(TB.renameColumn(two, 'specimen_id', 'name'), null);
  assert.equal(TB.renameColumn(two, 'nope', 'name'), null);
});

test('renaming to the same name changes nothing', () => {
  assert.deepEqual(TB.renameColumn(table(), 'site', 'site'), table());
});
