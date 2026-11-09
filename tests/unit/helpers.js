'use strict';

const tpl2d = extra => Object.assign({
  id: 'fish', name: 'Fish', version: '1.0', dimensions: 2,
  landmarks: [{ id: 'LM01', name: 'Snout' }, { id: 'LM02', name: 'Eye' }, { id: 'LM03', name: 'Tail' }],
}, extra);

/** A landmark-json 2D document; `over` overrides specimen fields, pts gives positions (null = missing). */
function doc2d(id, pts, over = {}) {
  const landmarks = pts.map((p, i) => {
    const code = `LM0${i + 1}`;
    return p ? { id: code, template_id: code, status: 'placed', position: p } : { id: code, template_id: code, status: 'missing', position: null };
  });
  return {
    format: 'landmark-json', version: '0.3.0',
    specimen: Object.assign({ id, image: { file: `${id}.png`, sha256: `sha-${id}`, width: 100, height: 200 } }, over.specimen),
    template: over.template || tpl2d(),
    landmarks,
    provenance: over.provenance,
    curves: over.curves,
  };
}

function doc3d(id, pts, over = {}) {
  const template = over.template || { id: 'skull', name: 'Skull', version: '1.0', dimensions: 3, landmarks: pts.map((_, i) => ({ id: `LM0${i + 1}`, name: `L${i + 1}` })) };
  return {
    format: 'landmark-json', version: '0.1.0',
    specimen: { id, mesh: { file: `${id}.ply`, sha256: `sha-${id}`, units: (over.units || 'mm'), vertex_count: 1, face_count: 1 } },
    template,
    landmarks: pts.map((p, i) => ({ id: `LM0${i + 1}`, template_id: `LM0${i + 1}`, status: 'placed', position: p })),
    provenance: over.provenance,
  };
}

function near(a, b, eps = 1e-9, msg = '') {
  if (Math.abs(a - b) > eps) throw new Error(`${msg} expected ${b}, got ${a} (tolerance ${eps})`);
}
function nearAll(a, b, eps = 1e-9, msg = '') {
  const fa = a.flat(Infinity), fb = b.flat(Infinity);
  if (fa.length !== fb.length) throw new Error(`${msg} length ${fa.length} vs ${fb.length}`);
  fa.forEach((v, i) => near(v, fb[i], eps, `${msg}[${i}]`));
}

/** A little deterministic random number generator (mulberry32). */
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

module.exports = { tpl2d, doc2d, doc3d, near, nearAll, rng };
