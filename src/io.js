// Reading data into a common form: landmark-json and TPS files, zips, group tables.
// Pure and DOM-free (UMD: window.SupIO in the browser, require in Node).
//
// A specimen record:
//   { key, id, replicate, operator, file, sha, sourceName, source: 'lmk'|'tps',
//     dim, units, rows: [{ id, label, type, curve, index }],
//     coords: [[x, y(, z)] | null, …], status: ['placed'|'estimated'|'missing'|'not_done', …],
//     signature, templateId, templateName }
// Coordinates are y-up, as in TPS, and already multiplied by any scale.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupIO = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const stem = name => String(name || '').split(/[\\/]/).pop()
    .replace(/\.lmk\.json$/i, '').replace(/\.[^.]+$/, '');
  const pad2 = n => String(n).padStart(2, '0');
  const TO_MM = { um: 0.001, mm: 1, cm: 10, m: 1000 };
  const DEFAULT_CURVE_POINTS = 10;
  const MISSING_TPS = -999;

  /* ---------- TPS ---------- */
  function splitReplicate(rawId) {
    const m = String(rawId).match(/^(.*)_r(\d+)$/);
    return m && m[1] ? { id: m[1], replicate: Number(m[2]) } : { id: String(rawId), replicate: 1 };
  }

  function parseTPS(text, sourceName) {
    const lines = String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/);
    const specimens = [], warnings = [], warned = new Set();
    const where = i => `${sourceName}, line ${i + 1}`;
    const tagOf = line => {
      const m = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      return m ? { tag: m[1].toUpperCase(), value: m[2] } : null;
    };
    const nextLine = i => { while (i < lines.length && !lines[i].trim()) i++; return i; };

    let current = null;
    const finish = () => {
      if (!current) return;
      const n = specimens.length + 1;
      const fallback = current.file ? stem(current.file) : `${stem(sourceName)}_${n}`;
      const { id, replicate } = splitReplicate(current.rawId || fallback);
      const k = current.scale;
      const coords = current.coords.map(c => (c && k ? c.map(v => v * k) : c));
      specimens.push({
        key: '', id, replicate, operator: '', file: current.file || '', sha: '',
        sourceName, source: 'tps', dim: current.dim,
        units: k ? 'scaled' : current.dim === 2 ? 'px' : 'unknown',
        rows: coords.map((_, j) => ({ id: `P${pad2(j + 1)}`, label: '', type: 'landmark', curve: '', index: '' })),
        coords, status: coords.map(c => (c ? 'placed' : 'missing')),
        signature: `tps:${current.dim}:${coords.length}`, templateId: '', templateName: '',
      });
      current = null;
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const t = tagOf(line);
      if (!t) { i++; continue; }
      if (t.tag === 'LM' || t.tag === 'LM3') {
        finish();
        const count = parseInt(t.value, 10);
        if (!Number.isInteger(count) || count < 0) throw new Error(`${where(i)}: “${line.trim()}” is not a landmark count.`);
        if (count === 0) throw new Error(`${where(i)}: this block has no fixed landmarks. Curve-only TPS files can’t be analysed yet.`);
        const coords = [];
        let dim = t.tag === 'LM3' ? 3 : 0;
        i++;
        for (let k = 0; k < count; k++) {
          i = nextLine(i);
          const row = i < lines.length ? lines[i].trim() : null;
          if (row === null || tagOf(row)) throw new Error(`${where(Math.min(i, lines.length - 1))}: expected ${count} coordinate rows, found ${k}.`);
          const parts = row.split(/[\s,;]+/).filter(Boolean);
          const nums = parts.map(Number);
          if (nums.some(v => !Number.isFinite(v))) throw new Error(`${where(i)}: “${row}” is not a row of numbers.`);
          if (!dim) dim = nums.length;
          if (nums.length !== dim || (dim !== 2 && dim !== 3)) throw new Error(`${where(i)}: expected ${dim === 3 ? 3 : 2} numbers, found ${nums.length}.`);
          coords.push(nums.includes(MISSING_TPS) ? null : nums);
          i++;
        }
        current = { coords, dim, rawId: '', file: '', scale: 0 };
        continue;
      }
      if (t.tag === 'CURVES' || t.tag === 'OUTLINES') {
        if (!warned.has(t.tag)) {
          warned.add(t.tag);
          warnings.push(`${sourceName}: ${t.tag}= blocks were skipped. Use .lmk.json files to analyse curves.`);
        }
        i++;
        continue;
      }
      if (t.tag === 'POINTS') {
        const n = parseInt(t.value, 10) || 0;
        i++;
        for (let k = 0; k < n; k++) { i = nextLine(i); i++; }
        continue;
      }
      if (current) {
        if (t.tag === 'ID') current.rawId = t.value;
        else if (t.tag === 'IMAGE') current.file = t.value;
        else if (t.tag === 'SCALE') {
          const v = Number(t.value);
          if (Number.isFinite(v) && v > 0) current.scale = v;
        }
      }
      i++;
    }
    finish();
    if (!specimens.length) throw new Error(`${sourceName}: no landmark blocks found (no LM= or LM3= lines).`);
    return { specimens, warnings };
  }

  /* ---------- landmark-json ---------- */
  function exportRows(doc, warnings, sourceName) {
    const T = doc.template || {};
    const entries = Array.isArray(doc.landmarks) ? doc.landmarks : [];
    const curves = Array.isArray(doc.curves) ? doc.curves : [];
    let lmDefs = Array.isArray(T.landmarks) ? T.landmarks : null;
    const curveDefs = Array.isArray(T.curves) ? T.curves : [];
    if (!lmDefs) {
      warnings.push(`${sourceName}: its template is only a reference, so the landmark order was taken from the file. Embedded templates are safer.`);
      lmDefs = entries.filter(e => e && e.template_id)
        .map(e => ({ id: e.template_id, name: e.label || '' }))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    }
    const lmIds = lmDefs.map(l => l.id), cIds = curveDefs.map(c => c.id);
    const order = Array.isArray(T.export_order) && T.export_order.length ? T.export_order.slice() : [...lmIds, ...cIds];
    for (const id of [...lmIds, ...cIds]) if (!order.includes(id)) order.push(id);

    const rows = [];
    for (const id of order) {
      const lm = lmDefs.find(l => l.id === id);
      if (lm) {
        const e = entries.find(x => x && x.template_id === id);
        const pos = e && e.status !== 'missing' && Array.isArray(e.position) ? e.position : null;
        const status = !e ? 'not_done' : e.status === 'missing' ? 'missing' : pos ? (e.status === 'estimated' ? 'estimated' : 'placed') : 'not_done';
        rows.push({ id, label: lm.name || '', type: 'landmark', curve: '', index: '', pos, status });
        continue;
      }
      const c = curveDefs.find(x => x.id === id);
      if (!c) continue;
      const n = Number.isInteger(c.n_points) && c.n_points > 0 ? c.n_points : DEFAULT_CURVE_POINTS;
      const e = curves.find(x => x && x.template_id === id);
      const done = e && e.status !== 'missing' && Array.isArray(e.points) && e.points.length === n;
      for (let k = 0; k < n; k++) {
        rows.push({
          id: `${id}_${pad2(k + 1)}`, label: c.name || '', type: 'curve', curve: id, index: k + 1,
          pos: done ? e.points[k].position : null,
          status: done ? (e.status === 'estimated' ? 'estimated' : 'placed') : e && e.status === 'missing' ? 'missing' : 'not_done',
        });
      }
    }
    if (entries.some(e => e && !e.template_id && e.position)) {
      warnings.push(`${sourceName}: ad hoc points (not in the template) were left out.`);
    }
    return rows;
  }

  function parseLmk(input, sourceName) {
    let doc = input;
    if (typeof input === 'string') {
      try { doc = JSON.parse(input.replace(/^﻿/, '')); } catch { throw new Error(`${sourceName}: not valid JSON.`); }
    }
    if (!doc || doc.format !== 'landmark-json') throw new Error(`${sourceName}: not a landmark-json file.`);
    const major = parseInt(String(doc.version || '0').split('.')[0], 10);
    if (major > 0) throw new Error(`${sourceName}: format ${doc.version} is newer than this app understands.`);
    const sp = doc.specimen || {};
    if (!sp.id) throw new Error(`${sourceName}: the specimen has no id.`);
    const image = sp.image, mesh = sp.mesh;
    if (!image && !mesh) throw new Error(`${sourceName}: the specimen has no image or mesh.`);
    const warnings = [];
    const rows = exportRows(doc, warnings, sourceName);

    const dim = image ? 2 : 3;
    let k = 1, units;
    if (image) {
      const sc = image.scale;
      if (sc && Number(sc.value) > 0) {
        const toMm = TO_MM[sc.units];
        k = Number(sc.value) * (toMm || 1);
        units = toMm ? 'mm' : String(sc.units || 'unknown');
      } else units = 'px';
    } else if (TO_MM[mesh.units]) { k = TO_MM[mesh.units]; units = 'mm'; } else units = 'unknown';

    const height = image ? Number(image.height) : 0;
    const coords = rows.map(r => {
      if (!r.pos) return null;
      const p = r.pos.slice(0, dim);
      if (image) p[1] = height - p[1];
      return p.map(v => v * k);
    });
    const rep = Number.isInteger(sp.replicate) && sp.replicate > 0 ? sp.replicate : 1;
    const T = doc.template || {};
    const specimen = {
      key: '', id: String(sp.id), replicate: rep,
      operator: String((doc.provenance && doc.provenance.operator) || '').trim(),
      file: (image || mesh).file || '', sha: (image || mesh).sha256 || '',
      sourceName, source: 'lmk', dim, units,
      rows: rows.map(({ id, label, type, curve, index }) => ({ id, label, type, curve, index })),
      coords, status: rows.map(r => r.status),
      signature: JSON.stringify([T.id || '', dim, rows.map(r => r.id)]),
      templateId: T.id || '', templateName: T.name || T.id || '',
    };
    return { specimens: [specimen], warnings };
  }

  return { parseTPS, parseLmk, stem };
}));
