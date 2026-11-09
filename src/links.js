// Lines joining landmarks, to outline or triangulate the object. A link is a pair of row ids.
// Pure and DOM-free (UMD: window.SupLinks in the browser, require in Node).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupLinks = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pair = (a, b) => (a < b ? [a, b] : [b, a]);
  const same = (x, y) => x[0] === y[0] && x[1] === y[1];

  /** Add the link, or remove it if it is there. Returns a new list. */
  function toggle(links, a, b) {
    if (a === b) return links.slice();
    const p = pair(a, b);
    return links.some(l => same(l, p)) ? links.filter(l => !same(l, p)) : [...links, p];
  }

  /** Text with one pair per line → { links, unknown: lines that name landmarks not in the data }. */
  function parse(text, ids) {
    const known = new Set(ids), links = [], unknown = [];
    const lines = String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean);
    lines.forEach((line, n) => {
      let parts = line.split(/[\s,;]+/).filter(Boolean);
      if (parts.length === 1) parts = line.split('-').filter(Boolean);
      if (n === 0 && /^(from|start|a|landmark|id)\b/i.test(line) && !known.has(parts[0])) return;
      if (parts.length !== 2 || !known.has(parts[0]) || !known.has(parts[1]) || parts[0] === parts[1]) { unknown.push(line); return; }
      const p = pair(parts[0], parts[1]);
      if (!links.some(l => same(l, p))) links.push(p);
    });
    return { links, unknown };
  }

  const toCSV = links => ['from,to', ...links.map(l => l.join(','))].join('\n') + '\n';

  /** Links as row positions, leaving out any whose landmarks are not in use. */
  function indexPairs(links, rows) {
    const at = new Map(rows.map((r, i) => [r.id, i]));
    return links.filter(l => at.has(l[0]) && at.has(l[1])).map(l => [at.get(l[0]), at.get(l[1])]);
  }

  /** The outermost points as a ring of links (convex hull). */
  function outline(points, ids) {
    const order = points.map((_, i) => i).sort((a, b) => points[a][0] - points[b][0] || points[a][1] - points[b][1]);
    const cross = (o, a, b) => (points[a][0] - points[o][0]) * (points[b][1] - points[o][1]) - (points[a][1] - points[o][1]) * (points[b][0] - points[o][0]);
    const half = list => {
      const out = [];
      for (const i of list) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], i) <= 0) out.pop();
        out.push(i);
      }
      out.pop();
      return out;
    };
    const ring = [...half(order), ...half([...order].reverse())];
    if (ring.length < 3) return [];
    return ring.map((v, i) => pair(ids[v], ids[ring[(i + 1) % ring.length]]));
  }

  /** Delaunay triangles as index triples (Bowyer-Watson). */
  function delaunay(points) {
    const n = points.length;
    if (n < 3) return [];
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
    const R = span * 1e5;
    const all = [...points, [cx - 2 * R, cy - R], [cx + 2 * R, cy - R], [cx, cy + 2 * R]];
    const circle = (a, b, c) => {
      const [ax, ay] = all[a], [bx, by] = all[b], [qx, qy] = all[c];
      const d = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
      if (Math.abs(d) < 1e-14 * span * span) return { x: 0, y: 0, r2: Infinity };
      const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = qx * qx + qy * qy;
      const x = (a2 * (by - qy) + b2 * (qy - ay) + c2 * (ay - by)) / d;
      const y = (a2 * (qx - bx) + b2 * (ax - qx) + c2 * (bx - ax)) / d;
      return { x, y, r2: (ax - x) ** 2 + (ay - y) ** 2 };
    };
    const make = (a, b, c) => ({ v: [a, b, c], c: circle(a, b, c) });
    let tris = [make(n, n + 1, n + 2)];
    for (let i = 0; i < n; i++) {
      const [px, py] = all[i];
      const bad = [], keep = [];
      for (const t of tris) {
        const inside = t.c.r2 === Infinity || (px - t.c.x) ** 2 + (py - t.c.y) ** 2 < t.c.r2;
        (inside ? bad : keep).push(t);
      }
      const edges = new Map();
      for (const t of bad) {
        for (const [a, b] of [[t.v[0], t.v[1]], [t.v[1], t.v[2]], [t.v[2], t.v[0]]]) {
          const k = a < b ? `${a},${b}` : `${b},${a}`;
          edges.set(k, edges.has(k) ? null : [a, b]);
        }
      }
      tris = keep;
      for (const e of edges.values()) if (e) tris.push(make(e[0], e[1], i));
    }
    return tris.filter(t => t.v.every(v => v < n) && t.c.r2 !== Infinity).map(t => t.v);
  }

  function triangulate(points, ids) {
    const seen = new Map();
    for (const [a, b, c] of delaunay(points)) {
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const p = pair(ids[u], ids[v]);
        seen.set(p.join('\u0000'), p);
      }
    }
    return [...seen.values()];
  }

  return { toggle, parse, toCSV, indexPairs, outline, delaunay, triangulate };
}));
