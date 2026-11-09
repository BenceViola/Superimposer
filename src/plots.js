// Figures as self-contained SVG strings, so the same code draws the page and the exported files.
// Pure and DOM-free (UMD: window.SupPlots in the browser, require in Node).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupPlots = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FONT = 'Archivo, Helvetica Neue, Arial, sans-serif';
  const THEMES = {
    light: {
      name: 'light', surface: '#F7F9FB', ink: '#16202B', muted: '#5A6777', line: '#D2D9E1', grid: '#E4E9EE',
      accent: '#2346C4', warn: '#A5680F',
      series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    },
    dark: {
      name: 'dark', surface: '#161B22', ink: '#E3E8EE', muted: '#8D99A8', line: '#29313B', grid: '#222933',
      accent: '#8EA8FF', warn: '#E3AB3E',
      series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    },
  };
  const MAX_LEVELS = THEMES.light.series.length;

  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f = v => { const r = Math.round(v * 100) / 100; return String(Object.is(r, -0) ? 0 : r); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function frame(W, H, theme, label, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" font-family="${FONT}" font-size="12">`
      + `<rect width="${W}" height="${H}" fill="${theme.surface}"/>${body}</svg>`;
  }

  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) return [lo];
    const raw = (hi - lo) / Math.max(1, n);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++) out.push(Number((i * step).toPrecision(4)));
    return out;
  }

  /** The eight marker shapes, in the same order as the colours: colour is never the only cue. */
  function marker(index, x, y, r, attrs) {
    const shape = ((index % MAX_LEVELS) + MAX_LEVELS) % MAX_LEVELS;
    const poly = pts => `<polygon points="${pts.map(([a, b]) => `${f(x + a)},${f(y + b)}`).join(' ')}" ${attrs}/>`;
    const q = r * 0.9, k = r * 1.2;
    switch (shape) {
      case 0: return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${attrs}/>`;
      case 1: return poly([[-q, -q], [q, -q], [q, q], [-q, q]]);
      case 2: return poly([[0, -k], [k, q], [-k, q]]);
      case 3: return poly([[0, -k], [k, 0], [0, k], [-k, 0]]);
      case 4: return poly([[0, k], [k, -q], [-k, -q]]);
      case 5: return poly([[-k, 0], [-q / 2, -q], [q / 2, -q], [k, 0], [q / 2, q], [-q / 2, q]]);
      case 6: return poly([[k, 0], [-q, -q], [-q, q]]);
      default: return poly([[-k, 0], [q, -q], [q, q]]);
    }
  }

  /** Legend entries in one row above the plot; they wrap when needed. Returns svg and the height it takes. */
  function legend(items, W, theme) {
    if (items.length < 2) return { svg: '', height: 0 };
    let x = 12, y = 18, body = '';
    for (const it of items) {
      const w = 22 + it.label.length * 6.6 + 14;
      if (x + w > W - 8 && x > 12) { x = 12; y += 18; }
      body += `<g>${it.mark(x + 6, y - 4)}<text x="${f(x + 18)}" y="${f(y)}" fill="${theme.ink}">${esc(it.label)}</text></g>`;
      x += w;
    }
    return { svg: `<g class="legend">${body}</g>`, height: y + 10 };
  }

  const colourOf = (theme, g) => (g >= 0 ? theme.series[g % MAX_LEVELS] : theme.muted);
  function groupLegend(groups, W, theme) {
    if (!groups) return { svg: '', height: 0 };
    const items = groups.levels.map((label, i) => ({
      label, mark: (x, y) => marker(i, x, y, 5, `fill="${colourOf(theme, i)}"`),
    }));
    if (groups.index.some(v => v < 0)) {
      items.push({ label: 'No group', mark: (x, y) => `<circle cx="${x}" cy="${y}" r="4" fill="${theme.muted}"/>` });
    }
    return legend(items, W, theme);
  }

  function convexHull(points) {
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = list => {
      const out = [];
      for (const p of list) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
        out.push(p);
      }
      out.pop();
      return out;
    };
    return [...half(pts), ...half([...pts].reverse())];
  }

  /* ---------- scatter ---------- */
  function scatter(o) {
    const W = o.width || 640, H = o.height || 460, t = o.theme;
    const lg = groupLegend(o.groups, W, t);
    const m = { l: 62, r: 18, t: 14 + lg.height, b: 50 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const span = v => { const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo || Math.abs(hi) || 1) * 0.08; return [lo - pad, hi + pad]; };
    let [x0, x1] = span(o.x), [y0, y1] = span(o.y);
    let sx = pw / (x1 - x0), sy = ph / (y1 - y0);
    if (o.equal) {
      const s = Math.min(sx, sy);
      sx = sy = s;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      x0 = cx - pw / s / 2; x1 = cx + pw / s / 2; y0 = cy - ph / s / 2; y1 = cy + ph / s / 2;
    }
    const X = v => m.l + (v - x0) * sx, Y = v => m.t + ph - (v - y0) * sy;
    let b = lg.svg;
    const xt = niceTicks(x0, x1, 6), yt = niceTicks(y0, y1, 5);
    for (const v of xt) {
      b += `<line x1="${f(X(v))}" x2="${f(X(v))}" y1="${m.t}" y2="${m.t + ph}" stroke="${v === 0 && o.zeroLines ? t.line : t.grid}"/>`;
      b += `<text x="${f(X(v))}" y="${m.t + ph + 16}" fill="${t.muted}" text-anchor="middle">${v}</text>`;
    }
    for (const v of yt) {
      b += `<line x1="${m.l}" x2="${m.l + pw}" y1="${f(Y(v))}" y2="${f(Y(v))}" stroke="${v === 0 && o.zeroLines ? t.line : t.grid}"/>`;
      b += `<text x="${m.l - 8}" y="${f(Y(v) + 4)}" fill="${t.muted}" text-anchor="end">${v}</text>`;
    }
    b += `<text x="${m.l + pw / 2}" y="${H - 10}" fill="${t.ink}" text-anchor="middle">${esc(o.xLabel)}</text>`;
    b += `<text transform="translate(16 ${m.t + ph / 2}) rotate(-90)" fill="${t.ink}" text-anchor="middle">${esc(o.yLabel)}</text>`;
    b += `<g data-scale="${sx.toFixed(4)},${sy.toFixed(4)}">`;
    const groupIndex = i => (o.groups ? o.groups.index[i] : o.groups === undefined ? 0 : 0);
    if (o.hulls && o.groups) {
      o.groups.levels.forEach((_, g) => {
        const pts = o.x.map((v, i) => [X(v), Y(o.y[i]), i]).filter(p => o.groups.index[p[2]] === g).map(p => [p[0], p[1]]);
        if (pts.length < 3) return;
        const c = colourOf(t, g);
        b += `<polygon class="hull" points="${convexHull(pts).map(p => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-opacity="0.6" stroke-width="1.25"/>`;
      });
    }
    const labels = [];
    o.x.forEach((v, i) => {
      const g = groupIndex(i), px = X(v), py = Y(o.y[i]);
      const sel = o.selected != null && o.keys[i] === o.selected;
      const fill = o.groups ? colourOf(t, g) : t.series[0];
      const attrs = `fill="${fill}" stroke="${sel ? t.ink : t.surface}" stroke-width="${sel ? 2 : 1.5}"`;
      const tip = [o.keys[i], o.tips ? o.tips[i] : ''].filter(Boolean).join(' · ');
      b += `<g class="pt" data-i="${i}"><title>${esc(tip)}</title>`;
      if (!o.forExport) b += `<circle class="hit" cx="${f(px)}" cy="${f(py)}" r="12" fill="transparent"/>`;
      b += marker(o.groups ? g : 0, px, py, sel ? 6.5 : 5, attrs) + '</g>';
      if (sel || (o.outliers && o.outliers[i])) labels.push([px, py, o.keys[i]]);
    });
    b += '</g>';
    for (const [px, py, label] of labels) {
      const right = px < W - 90;
      b += `<text class="pt-label" x="${f(px + (right ? 9 : -9))}" y="${f(py - 7)}" fill="${t.ink}" text-anchor="${right ? 'start' : 'end'}">${esc(label)}</text>`;
    }
    return frame(W, H, t, o.title || `${o.xLabel} against ${o.yLabel}`, b);
  }

  /* ---------- scree ---------- */
  function scree(o) {
    const W = o.width || 640, H = o.height || 220, t = o.theme;
    const vals = o.proportion.slice(0, 12);
    const m = { l: 62, r: 18, t: 16, b: 34 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const top = Math.max(...vals) * 1.15;
    const Y = v => m.t + ph - (v / top) * ph;
    let b = '';
    for (const v of niceTicks(0, top, 4)) {
      b += `<line x1="${m.l}" x2="${m.l + pw}" y1="${f(Y(v))}" y2="${f(Y(v))}" stroke="${t.grid}"/>`;
      b += `<text x="${m.l - 8}" y="${f(Y(v) + 4)}" fill="${t.muted}" text-anchor="end">${Number((v * 100).toPrecision(3))}%</text>`;
    }
    const step = pw / vals.length, bw = Math.min(step - 2, 34), radius = Math.min(4, bw / 2);
    vals.forEach((v, i) => {
      const x = m.l + step * i + (step - bw) / 2, y = Y(v), base = m.t + ph;
      const r = Math.min(radius, base - y);
      b += `<path class="bar" d="M${f(x)} ${f(base)}V${f(y + r)}q0 ${f(-r)} ${f(r)} ${f(-r)}h${f(bw - 2 * r)}q${f(r)} 0 ${f(r)} ${f(r)}V${f(base)}z" fill="${t.series[0]}"><title>PC${i + 1}: ${(v * 100).toFixed(1)}%</title></path>`;
      b += `<text x="${f(x + bw / 2)}" y="${base + 16}" fill="${t.muted}" text-anchor="middle">PC${i + 1}</text>`;
      if (i < 4) b += `<text x="${f(x + bw / 2)}" y="${f(y - 5)}" fill="${t.ink}" text-anchor="middle">${(v * 100).toFixed(1)}%</text>`;
    });
    b += `<line x1="${m.l}" x2="${m.l + pw}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="${t.muted}"/>`;
    return frame(W, H, t, 'Share of shape variance per principal component', b);
  }

  /* ---------- shapes ---------- */
  function project(points, view) {
    if (!view) return points.map(p => p.slice(0, 2));
    return points.map(p => [view[0][0] * p[0] + view[0][1] * p[1] + view[0][2] * p[2], view[1][0] * p[0] + view[1][1] * p[1] + view[1][2] * p[2]]);
  }

  function turnView(v, yaw, pitch) {
    const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const Ry = [[c, 0, s], [0, 1, 0], [-s, 0, c]], Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
    const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((t, x, i) => t + x * B[i][j], 0)));
    const m = mul(mul(Ry, Rx), v);
    // Gram-Schmidt, so rounding errors don't build up over a long drag.
    const unit = a => { const n = Math.hypot(...a); return a.map(x => x / n); };
    const dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
    const r0 = unit(m[0]);
    const r1 = unit(m[1].map((x, i) => x - dot(m[1], r0) * r0[i]));
    const r2 = [r0[1] * r1[2] - r0[2] * r1[1], r0[2] * r1[0] - r0[0] * r1[2], r0[0] * r1[1] - r0[1] * r1[0]];
    return [r0, r1, r2];
  }

  /** A scale shared by both directions, with y pointing up. */
  function fitter(points, W, H, m) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const s = Math.min(pw / (x1 - x0 || 1), ph / (y1 - y0 || 1)) * 0.94;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return p => [m.l + pw / 2 + (p[0] - cx) * s, m.t + ph / 2 - (p[1] - cy) * s];
  }

  function curveChains(rows) {
    const chains = new Map();
    rows.forEach((r, i) => {
      if (r.type !== 'curve') return;
      if (!chains.has(r.curve)) chains.set(r.curve, []);
      chains.get(r.curve).push(i);
    });
    return [...chains.values()];
  }
  const polyline = (pts, cls, attrs) => `<polyline class="${cls}" points="${pts.map(p => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="none" ${attrs}/>`;

  function superimposition(o) {
    const W = o.width || 640, H = o.height || 520, t = o.theme;
    const lg = groupLegend(o.groups, W, t);
    const aligned = o.aligned.map(c => project(c, o.view));
    const cons = project(o.consensus, o.view);
    const place = fitter([...aligned.flat(), ...cons], W, H, { l: 26, r: 26, t: 12 + lg.height, b: 16 });
    const n = aligned.length;
    let b = lg.svg;
    const levels = o.groups ? o.groups.levels.map((_, i) => i) : [0];
    const hasUngrouped = o.groups && o.groups.index.some(v => v < 0);
    for (const g of hasUngrouped ? [...levels, -1] : levels) {
      let d = '';
      aligned.forEach((c, i) => {
        if (o.groups && o.groups.index[i] !== g) return;
        for (const p of c) { const [x, y] = place(p); d += `M${f(x)} ${f(y)}h0`; }
      });
      const colour = o.groups ? colourOf(t, g) : t.series[0];
      b += `<path class="cloud" d="${d}" stroke="${colour}" stroke-width="${n > 150 ? 2.5 : 3.5}" stroke-linecap="round" stroke-opacity="${n > 60 ? 0.45 : 0.7}" fill="none"/>`;
    }
    for (const chain of curveChains(o.rows)) b += polyline(chain.map(i => place(cons[i])), 'curve-line', `stroke="${t.ink}" stroke-width="1.5" stroke-opacity="0.75"`);
    const selectedIndex = o.selected != null ? o.keys.indexOf(o.selected) : -1;
    if (selectedIndex >= 0) {
      for (const p of aligned[selectedIndex]) {
        const [x, y] = place(p);
        b += `<circle class="selected" cx="${f(x)}" cy="${f(y)}" r="4.5" fill="none" stroke="${t.ink}" stroke-width="1.75"/>`;
      }
    }
    const labelled = o.labels !== false && o.rows.filter(r => r.type !== 'curve').length <= 40;
    cons.forEach((p, i) => {
      const [x, y] = place(p), r = o.rows[i], curve = r.type === 'curve';
      b += `<circle class="consensus" cx="${f(x)}" cy="${f(y)}" r="${curve ? 2.5 : 4.5}" fill="${t.ink}" stroke="${t.surface}" stroke-width="1.5"><title>${esc(r.id)}${r.label ? ` · ${esc(r.label)}` : ''}</title></circle>`;
      if (labelled && !curve) b += `<text x="${f(x + 8)}" y="${f(y - 8)}" fill="${t.ink}" font-weight="600">${esc(r.id)}</text>`;
    });
    return frame(W, H, t, 'Procrustes superimposition of all specimens with the consensus', b);
  }

  function shapeChange(o) {
    const W = o.width || 520, H = o.height || 420, t = o.theme;
    const mean = project(o.mean, o.view), target = project(o.target, o.view);
    const items = [
      { label: 'Mean shape', mark: (x, y) => `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="${t.muted}" stroke-width="1.5"/>` },
      { label: o.targetLabel || 'Target', mark: (x, y) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${t.accent}"/>` },
    ];
    const lg = legend(items, W, t);
    const place = fitter([...mean, ...target], W, H, { l: 26, r: 26, t: 12 + lg.height, b: 16 });
    let b = lg.svg;
    for (const chain of curveChains(o.rows)) {
      b += polyline(chain.map(i => place(mean[i])), 'curve-line', `stroke="${t.muted}" stroke-width="1.25" stroke-dasharray="3 3"`);
      b += polyline(chain.map(i => place(target[i])), 'curve-line', `stroke="${t.accent}" stroke-width="2"`);
    }
    mean.forEach((p, i) => {
      const [x0, y0] = place(p), [x1, y1] = place(target[i]);
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      const curve = o.rows[i].type === 'curve';
      b += `<line class="arrow" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${t.accent}" stroke-width="1.5" stroke-opacity="0.8"/>`;
      if (len > 8) {
        const ux = dx / len, uy = dy / len, s = 5;
        b += `<polygon points="${f(x1)},${f(y1)} ${f(x1 - s * ux + s * 0.5 * uy)},${f(y1 - s * uy - s * 0.5 * ux)} ${f(x1 - s * ux - s * 0.5 * uy)},${f(y1 - s * uy + s * 0.5 * ux)}" fill="${t.accent}"/>`;
      }
      b += `<circle class="mean" cx="${f(x0)}" cy="${f(y0)}" r="${curve ? 2 : 3.5}" fill="${t.surface}" stroke="${t.muted}" stroke-width="1.25"/>`;
      b += `<circle class="target" cx="${f(x1)}" cy="${f(y1)}" r="${curve ? 2.25 : 4}" fill="${t.accent}" stroke="${t.surface}" stroke-width="1"><title>${esc(o.rows[i].id)}</title></circle>`;
      if (o.labels !== false && !curve && mean.length <= 40) b += `<text x="${f(x1 + 7)}" y="${f(y1 - 7)}" fill="${t.ink}">${esc(o.rows[i].id)}</text>`;
    });
    return frame(W, H, t, `Shape change from the mean to ${o.targetLabel || 'the target'}`, b);
  }

  /* ---------- repeatability ---------- */
  function repeatabilityBars(o) {
    const t = o.theme, rows = o.rows.filter(r => r.mean != null).sort((a, b) => b.mean - a.mean);
    const rowH = 24, W = o.width || 640, m = { l: 150, r: 74, t: 26, b: 42 };
    const H = m.t + m.b + rowH * Math.max(1, rows.length);
    const pw = W - m.l - m.r, top = Math.max(...rows.map(r => r.mean), o.median || 0, 1e-9) * 1.05;
    const X = v => m.l + (v / top) * pw;
    let b = '';
    for (const v of niceTicks(0, top, 5)) {
      b += `<line x1="${f(X(v))}" x2="${f(X(v))}" y1="${m.t}" y2="${H - m.b}" stroke="${t.grid}"/>`;
      b += `<text x="${f(X(v))}" y="${H - m.b + 16}" fill="${t.muted}" text-anchor="middle">${v}</text>`;
    }
    b += `<text x="${m.l + pw / 2}" y="${H - 8}" fill="${t.ink}" text-anchor="middle">Mean distance between replicates (${esc(o.units)})</text>`;
    rows.forEach((r, i) => {
      const y = m.t + i * rowH + 4, h = rowH - 8, w = Math.max(1, X(r.mean) - m.l), rad = Math.min(4, w / 2);
      const label = r.name ? `${r.id} · ${r.name}` : r.id;
      b += `<text x="${m.l - 8}" y="${y + h - 3}" fill="${t.ink}" text-anchor="end">${esc(label.length > 24 ? `${label.slice(0, 23)}…` : label)}</text>`;
      b += `<path class="bar" d="M${m.l} ${y}h${f(w - rad)}q${f(rad)} 0 ${f(rad)} ${f(rad)}v${f(h - 2 * rad)}q0 ${f(rad)} ${f(-rad)} ${f(rad)}h${f(rad - w)}z" fill="${r.flag ? t.warn : t.series[0]}"><title>${esc(r.id)}: mean ${r.mean.toPrecision(3)}, over ${r.pairs} pair${r.pairs === 1 ? '' : 's'}</title></path>`;
      b += `<text x="${f(X(r.mean) + 6)}" y="${y + h - 3}" fill="${r.flag ? t.ink : t.muted}" font-weight="${r.flag ? 600 : 400}">${r.mean.toPrecision(3)}${r.flag ? ' · check' : ''}</text>`;
    });
    if (o.median != null) {
      const x = X(o.median);
      b += `<line x1="${f(x)}" x2="${f(x)}" y1="${m.t - 4}" y2="${H - m.b}" stroke="${t.ink}" stroke-dasharray="4 3"/>`;
      b += `<text x="${f(x)}" y="${m.t - 9}" fill="${t.ink}" text-anchor="middle">median ${o.median.toPrecision(3)}</text>`;
    }
    return frame(W, H, t, 'Mean distance between replicates per landmark', b);
  }

  return { THEMES, MAX_LEVELS, niceTicks, scatter, scree, project, turnView, superimposition, shapeChange, repeatabilityBars };
}));
