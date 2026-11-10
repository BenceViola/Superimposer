// The specimen table: editing group columns, and the rows shown in the Data tab.
// Pure and DOM-free (UMD: window.SupTable in the browser, require in Node).
// A group table is the same { columns, rows } that IO.parseTable gives, so CSV files and edits are one thing.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./io.js'));
  else root.SupTable = factory(root.SupIO);
}(typeof self !== 'undefined' ? self : this, function (IO) {
  'use strict';

  const emptyTable = () => ({ columns: ['specimen_id'], rows: [] });
  const idColumn = table => IO.idColumnOf(table);
  const copyTable = table => ({ columns: table.columns.slice(), rows: table.rows.map(r => Object.assign({}, r)) });

  /** Returns the new table, or null if the name is blank or taken. */
  function addColumn(table, name) {
    const clean = String(name || '').trim();
    if (!clean || table.columns.includes(clean)) return null;
    const out = copyTable(table);
    out.columns.push(clean);
    out.rows.forEach(r => { r[clean] = ''; });
    return out;
  }

  /** Returns the new table, or null if the new name is blank or taken, or the column is the id column or absent. */
  function renameColumn(table, from, to) {
    const clean = String(to || '').trim();
    if (!clean || from === idColumn(table) || !table.columns.includes(from)) return null;
    if (clean === from) return copyTable(table);
    if (table.columns.includes(clean)) return null;
    const out = copyTable(table);
    out.columns = out.columns.map(c => (c === from ? clean : c));
    out.rows = out.rows.map(r => Object.fromEntries(out.columns.map(c => [c, c === clean ? r[from] : r[c]])));
    return out;
  }

  function removeColumn(table, name) {
    const out = copyTable(table);
    out.columns = out.columns.filter(c => c !== name);
    out.rows.forEach(r => { delete r[name]; });
    return out;
  }

  /**
   * Set one column for these specimen records. Values belong to the specimen ID, so
   * replicates move together; a row written for a single record is updated too, as it
   * would otherwise win over the edit. Rows left with no values are removed.
   */
  function setCells(table, specimens, col, value) {
    const out = copyTable(table);
    const idCol = idColumn(out), clean = String(value == null ? '' : value).trim();
    const names = out.columns.filter(c => c !== idCol);
    const blankRow = id => Object.assign({ [idCol]: id }, Object.fromEntries(names.map(c => [c, ''])));
    for (const s of specimens) {
      let row = out.rows.find(r => r[idCol] === s.id);
      if (!row && clean) { row = blankRow(s.id); out.rows.push(row); }
      if (row) row[col] = clean;
      if (s.key !== s.id) {
        const own = out.rows.find(r => r[idCol] === s.key);
        if (own) own[col] = clean;
      }
    }
    out.rows = out.rows.filter(r => names.some(c => r[c]));
    return out;
  }

  const cell = v => { const x = String(v == null ? '' : v); return /[",\n;\t]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const csv = (head, rows) => [head, ...rows].map(r => r.map(cell).join(',')).join('\n') + '\n';
  const groupsCSV = table => csv(table.columns, table.rows.map(r => table.columns.map(c => r[c])));

  /** Cells copied from a spreadsheet. */
  function parsePaste(text) {
    return String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t').map(v => v.trim()));
  }

  /** One row per record. opts: { fitted, semilandmarks }. */
  function buildRows(dataset, res, table, excluded, opts) {
    opts = opts || {};
    const ok = !!(res && res.ok);
    const at = new Map(ok ? res.prep.specimens.map((s, i) => [s.key, i]) : []);
    const groups = table ? IO.joinGroups(dataset.specimens, table).values : dataset.specimens.map(() => ({}));
    const counted = dataset.rows.map((r, i) => (r.type !== 'curve' || opts.semilandmarks ? i : -1)).filter(i => i >= 0);
    return dataset.specimens.map((s, n) => {
      const count = st => counted.filter(i => s.status[i] === st).length;
      const i = at.get(s.key);
      return {
        key: s.key, id: s.id, replicate: s.replicate, operator: s.operator, source: s.sourceName, units: s.units,
        use: !excluded.has(s.key),
        csize: i != null ? res.gpa.csize[i] : null,
        dist: i != null && opts.fitted ? res.gpa.procD[i] : null,
        missing: count('missing'), notDone: count('not_done'), estimated: count('estimated'),
        groups: groups[n], coords: s.coords, status: s.status,
      };
    });
  }

  const valueOf = (row, col) => (col.startsWith('group:') ? row.groups[col.slice(6)] : row[col]);
  const blank = v => v == null || v === '';
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  /** Sorted copy; dir is 1 or -1. Blanks stay at the end either way. */
  function sortRows(rows, col, dir) {
    return [...rows].sort((a, b) => {
      const x = valueOf(a, col), y = valueOf(b, col);
      if (blank(x) || blank(y)) return blank(x) ? (blank(y) ? 0 : 1) : -1;
      return dir * (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y)));
    });
  }

  function filterRows(rows, text) {
    const q = String(text || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.key, r.id, r.operator, r.source, r.units, ...Object.values(r.groups)].some(v => String(v == null ? '' : v).toLowerCase().includes(q)));
  }

  const num = v => (Number.isFinite(v) ? String(Number(v.toPrecision(10))) : '');

  /** The table as shown. opts: { coords }. */
  function tableCSV(rows, groupColumns, pointRows, opts) {
    opts = opts || {};
    const dim = rows.length && rows[0].coords.find(Boolean) ? rows[0].coords.find(Boolean).length : 0;
    const axes = ['x', 'y', 'z'].slice(0, dim);
    const coordHead = opts.coords ? pointRows.flatMap(p => axes.map(a => `${p.id}_${a}`)) : [];
    const head = ['key', 'specimen_id', 'replicate', 'operator', 'source_file', 'units', 'in_analysis', 'centroid_size', 'procrustes_distance', 'missing', 'not_done', 'estimated', ...groupColumns, ...coordHead];
    return csv(head, rows.map(r => [
      r.key, r.id, r.replicate, r.operator, r.source, r.units, r.use ? 'yes' : 'no', num(r.csize), num(r.dist), r.missing, r.notDone, r.estimated,
      ...groupColumns.map(c => r.groups[c] || ''),
      ...(opts.coords ? pointRows.flatMap((p, i) => axes.map((_, d) => {
        const c = r.coords[p.at == null ? i : p.at];
        return c ? num(c[d]) : 'NA';
      })) : []),
    ]));
  }

  return { emptyTable, idColumn, addColumn, renameColumn, removeColumn, setCells, groupsCSV, parsePaste, buildRows, sortRows, filterRows, tableCSV };
}));
