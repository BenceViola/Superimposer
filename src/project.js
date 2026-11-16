// Project files: one zip with the original data files and project.json (settings, groups, links, flips, …),
// so a session can be handed out or handed in and opened again elsewhere. Pure: no DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./io.js'));
  else root.SupProject = factory(root.SupIO);
}(typeof self !== 'undefined' ? self : this, function (IO) {
  'use strict';

  const FORMAT = 'superimposer-project', VERSION = 1;

  const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const isStr = v => typeof v === 'string';
  const isBool = v => typeof v === 'boolean';
  const oneOf = list => v => list.includes(v);
  const intAtLeast = lo => v => Number.isInteger(v) && v >= lo;
  const between = (lo, hi) => v => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const strList = v => Array.isArray(v) && v.every(isStr);
  const tuples = n => v => Array.isArray(v) && v.every(t => Array.isArray(t) && t.length === n && t.every(isStr));

  /** Settings kept in a project, each with its check. Anything else in a file is ignored. */
  const SETTINGS = {
    missing: oneOf(['specimens', 'points']),
    replicates: oneOf(['all', 'average']),
    semilandmarks: oneOf(['fixed', 'slide', 'omit']),
    slide: oneOf(['be', 'procd']),
    sizeCorrect: isBool,
    confirmTps: isBool,
    impute: v => isObject(v) && oneOf(['none', 'mirror', 'tps', 'reg', 'mean'])(v.method) && isBool(v.mirrorFirst)
      && intAtLeast(0)(v.max) && isBool(v.notDone) && isStr(v.ref),
    fitted: isBool,
    tab: oneOf(['super', 'morpho', 'groups', 'size', 'repeat', 'data']),
    colour: isStr,
    labels: isBool, hulls: isBool, equal: isBool, groupMeans: isBool, ellipses: isBool, groupOverall: isBool, showBefore: isBool,
    perms: oneOf([0, 99, 999, 9999]),
    groupA: isStr, groupB: isStr,
    groupStyle: oneOf(['arrows', 'grid']), shapeStyle: oneOf(['arrows', 'grid']), alloStyle: oneOf(['arrows', 'grid']),
    groupMag: between(1, 5), mag: between(1, 5), alloMag: between(1, 5),
    groupT: between(0, 1), shapeT: between(-1, 1), alloT: between(-1, 1),
    pcX: intAtLeast(0), pcY: intAtLeast(0), shapePc: intAtLeast(0),
    sizePc: v => v === 'reg' || intAtLeast(0)(v),
    view: v => Array.isArray(v) && v.length === 3 && v.every(r => Array.isArray(r) && r.length === 3 && r.every(x => typeof x === 'number' && Number.isFinite(x))),
  };
  /** Collections, with their checks; sets are stored as lists. */
  const COLLECTIONS = {
    table: v => v === null || (isObject(v) && strList(v.columns) && v.columns.length > 0 && Array.isArray(v.rows) && v.rows.every(isObject)),
    links: tuples(2),
    styles: v => isObject(v) && Object.values(v).every(isObject),
    pairs: tuples(2), pairsFile: isStr,
    sliders: tuples(3), slidersFile: isStr,
    flip: strList, excludeSpecimens: strList, excludePoints: strList,
  };
  const SETS = ['flip', 'excludeSpecimens', 'excludePoints'];

  /** What a project keeps of the app's state. */
  function snapshot(state) {
    const settings = {};
    for (const k of Object.keys(SETTINGS)) if (state[k] !== undefined) settings[k] = JSON.parse(JSON.stringify(state[k]));
    const out = { format: FORMAT, version: VERSION, settings };
    for (const k of Object.keys(COLLECTIONS)) {
      if (state[k] === undefined) continue;
      out[k] = SETS.includes(k) ? [...state[k]] : JSON.parse(JSON.stringify(state[k]));
    }
    return out;
  }

  const baseName = n => String(n).split(/[\\/]/).pop() || 'file';
  function uniqueNames(names) {
    const seen = new Map();
    return names.map(n => {
      const b = baseName(n), count = (seen.get(b.toLowerCase()) || 0) + 1;
      seen.set(b.toLowerCase(), count);
      if (count === 1) return b;
      const dot = b.indexOf('.');
      return dot > 0 ? `${b.slice(0, dot)} (${count})${b.slice(dot)}` : `${b} (${count})`;
    });
  }

  const README = `Superimposer project

Open this zip in Superimposer (Open files) to get the same data and settings back.
project.json holds the settings, group table, links, flips and other choices.
The folder data/ holds the landmark files exactly as they were opened.
`;

  /** The project as a zip: project.json, a read-me and the data files. */
  function build(project, sources, date) {
    date = date || new Date();
    const names = uniqueNames(sources.map(s => s.name)).map(n => `data/${n}`);
    const p = Object.assign({}, project, { saved: date.toISOString(), data: names });
    return IO.zipFiles([
      { name: 'project.json', data: JSON.stringify(p, null, 1) },
      { name: 'README.txt', data: README },
    ].concat(sources.map((s, i) => ({ name: names[i], data: s.data }))), date);
  }

  const text = d => (typeof d === 'string' ? d : new TextDecoder().decode(d));
  function projectJson(entries) {
    const e = entries.find(x => x.name === 'project.json');
    if (!e) return null;
    try {
      const p = JSON.parse(text(e.data));
      return isObject(p) && p.format === FORMAT ? p : null;
    } catch { return null; }
  }
  const isProject = entries => projectJson(entries) != null;

  /** The state and data files of a project, with warnings for anything that couldn't be used. */
  function read(entries) {
    const p = projectJson(entries);
    if (!p) throw new Error('This zip is not a Superimposer project.');
    const warnings = [], state = {};
    if (typeof p.version === 'number' && p.version > VERSION) warnings.push('This project was saved by a newer version of Superimposer; some settings may not be used.');
    const settings = isObject(p.settings) ? p.settings : {};
    const bad = [];
    for (const [k, v] of Object.entries(settings)) {
      if (SETTINGS[k] && SETTINGS[k](v)) state[k] = v;
      else bad.push(k);
    }
    for (const [k, check] of Object.entries(COLLECTIONS)) {
      if (p[k] === undefined) continue;
      if (check(p[k])) state[k] = SETS.includes(k) ? new Set(p[k]) : p[k];
      else bad.push(k);
    }
    if (bad.length) warnings.push(`Not used from the project (damaged or unknown): ${bad.join(', ')}.`);
    const files = entries.filter(e => /^data\//.test(e.name) && !/\/$/.test(e.name))
      .map(e => ({ name: e.name.slice(5), data: e.data }));
    return { state, files, warnings };
  }

  /** A file name from the template's name and the date. */
  function fileName(title, date) {
    const d = date || new Date(), pad = n => String(n).padStart(2, '0');
    const slug = String(title || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
    return `${slug}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.superimposer.zip`;
  }

  return { FORMAT, VERSION, snapshot, build, isProject, read, fileName };
}));
