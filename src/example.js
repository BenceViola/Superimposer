// Invented fish, for trying the app. Made as landmark-json files so they take the normal route in.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupExample = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const WIDTH = 1200, HEIGHT = 700;
  const BASE = [
    ['Snout tip', -5, 0], ['Eye centre', -3.6, 0.35], ['Nape', -2.8, 1.3], ['Dorsal fin origin', -0.6, 1.9],
    ['Dorsal fin end', 2, 1], ['Caudal base, upper', 4.2, 0.4], ['Caudal base, lower', 4.2, -0.4],
    ['Anal fin origin', 1.8, -1.1], ['Pelvic fin origin', -0.8, -1.8], ['Operculum edge', -2.4, -0.3],
  ];
  const template = {
    id: 'example-fish', name: 'Example fish (invented data)', version: '1.0', dimensions: 2,
    landmarks: BASE.map(([name], i) => ({ id: `LM${String(i + 1).padStart(2, '0')}`, name })),
    curves: [{ id: 'C01', name: 'Back profile', start: 'LM03', end: 'LM04', n_points: 5, path: 'spline', spacing: 'equal_arc_length' }],
  };
  const ids = template.landmarks.map(l => l.id);

  function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

  /** The fish in y-up units before its pose on the photograph. */
  function body(depth, head, r, sd) {
    return BASE.map(([, x, y], i) => [
      x + ([1, 2, 9].includes(i) ? head : 0) + sd * gauss(r),
      y * depth + sd * gauss(r),
    ]);
  }

  function pose(p, size, angle, dx, dy) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [dx + size * (c * p[0] - s * p[1]), dy - size * (s * p[0] + c * p[1])]; // y down in the image
  }

  function curvePoints(a, b, bulge, r, sd) {
    return Array.from({ length: 5 }, (_, i) => {
      const t = (i + 1) / 6;
      return [a[0] + (b[0] - a[0]) * t + sd * gauss(r), a[1] + (b[1] - a[1]) * t + bulge * Math.sin(Math.PI * t) + sd * gauss(r)];
    });
  }

  function makeDoc(id, replicate, shape, curveShape, placement, r, jitter, mirrored, gaps) {
    const put = p => {
      const q = pose([p[0] + jitter * gauss(r), p[1] + jitter * gauss(r)], ...placement);
      return [Number((mirrored ? WIDTH - q[0] : q[0]).toFixed(2)), Number(q[1].toFixed(2))];
    };
    return {
      format: 'landmark-json', version: '0.3.0',
      specimen: {
        id, ...(replicate > 1 ? { replicate } : {}),
        image: { file: `${id}.png`, sha256: `example-${id}`, width: WIDTH, height: HEIGHT, scale: { value: 0.04, units: 'mm', method: 'manual' } },
      },
      template,
      landmarks: shape.map((p, i) => {
        const position = put(p); // always, so the random sequence stays the same
        return gaps && gaps.includes(i)
          ? { id: ids[i], template_id: ids[i], status: 'missing', position: null, note: 'Damaged (example)' }
          : { id: ids[i], template_id: ids[i], status: 'placed', position };
      }),
      curves: [{ id: 'C01', template_id: 'C01', status: 'placed', points: curveShape.map(p => ({ position: put(p) })) }],
      provenance: { software: 'superimposer example' },
    };
  }

  function make() {
    const r = rng(20261108);
    const files = [], rows = ['specimen_id,form,site'];
    const N = 24;
    for (let i = 0; i < N; i++) {
      const id = `EX_${String(i + 1).padStart(2, '0')}`;
      const deep = i % 2 === 0;
      const depth = (deep ? 1.28 : 0.82) + 0.05 * gauss(r);
      const head = 0.28 * gauss(r);
      const shape = body(depth, head, r, 0.035);
      const curve = curvePoints(shape[2], shape[3], 0.22, r, 0.02);
      const placement = [38 + 44 * r(), 0.22 * gauss(r), 300 + 600 * r(), 230 + 240 * r()];
      const mirrored = i === 6;
      const gaps = { 13: [4], 16: [1, 8], 20: [9] }[i]; // a few damaged fish, to try imputation on
      files.push({ name: `${id}.lmk.json`, data: JSON.stringify(makeDoc(id, 1, shape, curve, placement, r, 0, mirrored, gaps)) });
      if (i % 8 === 1) {
        files.push({ name: `${id}_r2.lmk.json`, data: JSON.stringify(makeDoc(id, 2, shape, curve, placement, r, 0.05, mirrored)) });
      }
      rows.push(`${id},${deep ? 'deep' : 'slender'},${i % 3 === 0 ? 'lake' : 'river'}`);
    }
    return { files, groups: rows.join('\n') + '\n' };
  }

  return { make };
}));
