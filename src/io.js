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

  /* ---------- combining specimens into one dataset ---------- */
  const safeName = v => String(v).trim().replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
  const baseKey = s => s.id + (s.operator ? `_${safeName(s.operator)}` : '') + (s.replicate > 1 ? `_r${s.replicate}` : '');
  const mostCommon = list => {
    const counts = new Map();
    for (const v of list) counts.set(v, (counts.get(v) || 0) + 1);
    let best, n = -1;
    for (const [v, c] of counts) if (c > n) { best = v; n = c; }
    return best;
  };

  /**
   * Combine specimens: the most common template (or, for TPS alone, point
   * count) wins and the others are excluded with a reason. TPS has no point
   * names, so mixing it with landmark-json needs { confirmTps: true }.
   */
  function assemble(all, opts) {
    opts = opts || {};
    const out = { specimens: [], excluded: [], warnings: [], rows: [], dim: 0, units: '', needsTpsConfirm: false, templateName: '' };
    if (!all.length) return out;
    const lmk = all.filter(s => s.source === 'lmk');
    const ref = mostCommon((lmk.length ? lmk : all).map(s => s.signature));
    const model = all.find(s => s.signature === ref);
    out.dim = model.dim;
    out.rows = model.rows;
    out.templateName = model.templateName;
    const n = model.rows.length;
    const exclude = (s, reason) => out.excluded.push({ id: s.id, sourceName: s.sourceName, reason });
    const seen = new Map(), used = new Set();
    let collisions = 0;

    for (const s0 of all) {
      let s = s0;
      if (s.signature !== ref) {
        if (s.dim !== model.dim) { exclude(s, `It is ${s.dim}D; the rest of the data is ${model.dim}D.`); continue; }
        if (s.source === 'tps' && lmk.length) {
          if (s.coords.length !== n) { exclude(s, `It has ${s.coords.length} point${s.coords.length === 1 ? '' : 's'}; the template has ${n}.`); continue; }
          if (!opts.confirmTps) { out.needsTpsConfirm = true; exclude(s, 'TPS has no landmark names. Confirm that its rows follow the template order.'); continue; }
          s = Object.assign({}, s, { rows: model.rows, signature: ref });
        } else if (s.source === 'tps') {
          exclude(s, `It has ${s.coords.length} point${s.coords.length === 1 ? '' : 's'}; the rest of the data has ${n}.`);
          continue;
        } else { exclude(s, `It uses a different template (${s.templateName || 'unnamed'}).`); continue; }
      }
      const base = JSON.stringify([s.id, s.operator, s.replicate]);
      const previous = seen.get(base) || [];
      if (previous.some(p => JSON.stringify(p.coords) === JSON.stringify(s.coords))) {
        exclude(s, 'It has the same specimen, replicate and points as a file already loaded.');
        continue;
      }
      if (previous.length) collisions++;
      let key = baseKey(s), k = 2;
      while (used.has(key)) key = `${baseKey(s)}~${k++}`;
      used.add(key);
      const rec = Object.assign({}, s, { key });
      previous.push(rec);
      seen.set(base, previous);
      out.specimens.push(rec);
    }
    if (collisions) {
      out.warnings.push(`${collisions} file${collisions === 1 ? '' : 's'} share a specimen and replicate with another file but have different points, and no operator tells them apart. Both were kept. Students should fill in their operator name.`);
    }
    const units = new Set(out.specimens.map(s => s.units));
    out.units = units.size === 1 ? [...units][0] : units.size ? 'mixed' : '';
    if (units.size > 1) out.warnings.push(`Specimens are in different units (${[...units].join(', ')}), so centroid sizes can’t be compared. Shape results are not affected.`);
    return out;
  }

  /* ---------- zip (store-only writer; the reader also takes deflated files) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const utf8 = v => (typeof v === 'string' ? new TextEncoder().encode(v) : v);
  const putAll = (view, fields) => fields.forEach(([o, v, n]) => (n === 4 ? view.setUint32(o, v, true) : view.setUint16(o, v, true)));

  /** files: [{ name, data: string | Uint8Array }] → zip archive bytes (no compression). */
  function zipFiles(files, date) {
    date = date || new Date();
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      putAll(local, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, day, 2],
        [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]);
      const cen = new DataView(new ArrayBuffer(46));
      putAll(cen, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, day, 2],
        [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2],
        [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]);
      parts.push(new Uint8Array(local.buffer), name, data);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cenSize = central.reduce((n, b) => n + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    putAll(end, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cenSize, 4], [16, offset, 4], [20, 0, 2]]);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
    let p = 0;
    for (const b of all) { out.set(b, p); p += b.length; }
    return out;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser can’t unpack compressed zip files. Unzip the file and open its contents instead.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Zip bytes → [{ name, data: Uint8Array }]. Skips folders and macOS metadata. */
  async function unzipFiles(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let e = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('This is not a zip file, or it is damaged.');
    const count = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true);
    const out = [], dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('The zip file is damaged.');
      const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true);
      const csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true);
      const xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), loc = v.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/') || /(^|\/)(__MACOSX\/|\._)/.test(name)) continue;
      if (flags & 1) throw new Error(`“${name}” in the zip is password-protected.`);
      const start = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true);
      const raw = bytes.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw.slice();
      else if (method === 8) data = await inflateRaw(raw);
      else throw new Error(`“${name}” in the zip uses a compression this app can’t read.`);
      out.push({ name, data });
    }
    return out;
  }

  /* ---------- files ---------- */
  const textOf = data => (typeof data === 'string' ? data : new TextDecoder().decode(data));
  const looksLikeTps = text => /^\s*(?:﻿)?\s*LM3?\s*=/im.test(text);
  const isZip = (name, data) => /\.zip$/i.test(name) || (data instanceof Uint8Array && data[0] === 0x50 && data[1] === 0x4b && data[2] === 3);

  /** files: [{ name, data }] → { specimens, warnings, refused: [{ name, reason }] }. */
  async function loadFiles(files) {
    const out = { specimens: [], warnings: [], refused: [] };
    const take = r => { out.specimens.push(...r.specimens); out.warnings.push(...r.warnings); };
    const readOne = (name, data, inZip) => {
      const text = textOf(data);
      if (/\.json$/i.test(name)) {
        if (inZip && /\.template\.json$/i.test(name)) return;
        take(parseLmk(text, name));
      } else if (/\.tps$/i.test(name) || looksLikeTps(text)) take(parseTPS(text, name));
      else if (!inZip) throw new Error('Only .lmk.json, .tps and .zip files can be opened here.');
    };
    const visit = async (name, data, inZip) => {
      try {
        if (isZip(name, data)) {
          const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
          const entries = await unzipFiles(bytes);
          const hasLmk = entries.some(e => /\.lmk\.json$/i.test(e.name));
          for (const e of entries) {
            if (hasLmk && (/\.tps$/i.test(e.name) || /\.csv$/i.test(e.name))) continue;
            await visit(e.name, e.data, true);
          }
        } else readOne(name, data, inZip);
      } catch (err) { out.refused.push({ name, reason: err.message }); }
    };
    for (const f of files) await visit(f.name, f.data, false);
    return out;
  }

  /* ---------- group tables ---------- */
  function parseTable(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r\n|\r|\n/, 1)[0];
    const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const records = [];
    let row = [], cell = '', quoted = false;
    const endCell = () => { row.push(cell.trim()); cell = ''; };
    const endRow = () => { endCell(); if (row.some(Boolean)) records.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) endCell();
      else if (c === '\n') endRow();
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) endRow();
    const columns = records.shift() || [];
    return { columns, rows: records.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i] || '']))) };
  }

  /** Attach table columns to specimens, by exact key first, then by specimen id. */
  function joinGroups(specimens, table) {
    const known = ['specimen_id', 'specimen', 'id', 'key', 'tps_id'];
    const idColumn = table.columns.find(c => known.includes(c.toLowerCase())) || table.columns[0];
    const names = table.columns.filter(c => c !== idColumn);
    const byId = new Map(table.rows.map(r => [r[idColumn], r]));
    const usedRows = new Set(), unmatched = [];
    const values = specimens.map(s => {
      const r = byId.get(s.key) || byId.get(s.id);
      if (!r) { unmatched.push(s.key); return Object.fromEntries(names.map(n => [n, ''])); }
      usedRows.add(r);
      return Object.fromEntries(names.map(n => [n, r[n] || '']));
    });
    const factors = names.map(name => ({ name, levels: [...new Set(values.map(v => v[name]).filter(Boolean))].sort() }));
    const unused = table.rows.filter(r => !usedRows.has(r)).map(r => r[idColumn]);
    return { values, factors, unmatched, unused, idColumn };
  }

  return { parseTPS, parseLmk, stem, assemble, loadFiles, zipFiles, unzipFiles, parseTable, joinGroups, safeName };
}));
