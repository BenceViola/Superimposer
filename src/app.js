// The page: keeps one state object S, reruns the analysis on any change and draws the figures.
// All calculation is in io.js, gm.js, exports.js and plots.js.
(function () {
  'use strict';
  const LK = window.SupLinks, IO = window.SupIO, GM = window.SupGM, EX = window.SupExport, PL = window.SupPlots, EXAMPLE = window.SupExample;
  const $ = id => document.getElementById(id);
  const on = (el, ev, fn) => el.addEventListener(ev, fn);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  const S = {
    all: [], warnings: [], refused: [], confirmTps: false, table: null,
    dataset: null, res: null, repeat: null,
    missing: 'specimens', replicates: 'all', semilandmarks: false,
    flip: new Set(), excludeSpecimens: new Set(), excludePoints: new Set(),
    colour: '', labels: true, hulls: false, equal: true,
    links: [], linkSig: null, editingLinks: false, linkStart: null, linkReport: '',
    fitted: false, tab: 'super', pcX: 0, pcY: 1, shapePc: 0, shapeT: 1, mag: 1, sizePc: 0, selected: null,
    view: IDENTITY.map(r => r.slice()),
  };
  window.__sup = { S };

  const optsNow = () => ({ missing: S.missing, replicates: S.replicates, semilandmarks: S.semilandmarks, flip: S.flip, excludeSpecimens: S.excludeSpecimens, excludePoints: S.excludePoints });
  const theme = () => {
    const forced = document.documentElement.dataset.theme;
    const dark = forced ? forced === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? PL.THEMES.dark : PL.THEMES.light;
  };
  const unitWord = u => ({ px: 'pixels', mm: 'mm', scaled: 'scaled units', unknown: 'unknown units', mixed: 'mixed units' }[u] || u);

  /* ---------- analysis ---------- */
  function rerun() {
    S.dataset = IO.assemble(S.all, { confirmTps: S.confirmTps });
    syncLinks();
    const known = new Set(S.dataset.specimens.map(s => s.key));
    if (S.selected && !known.has(S.selected)) S.selected = null;
    S.res = S.dataset.specimens.length ? GM.analyse(S.dataset, optsNow()) : null;
    S.repeat = GM.repeatability(S.dataset);
    if (S.res && S.res.ok) {
      const q = S.res.pca.values.length;
      for (const k of ['pcX', 'shapePc', 'sizePc']) if (S[k] >= q) S[k] = 0;
      if (S.pcY >= q) S.pcY = Math.min(1, q - 1);
    }
    render();
  }

  /* ---------- links ---------- */
  // Remembered per landmark set in this browser, as a convenience; saving a file is the way to share them.
  const storeKey = sig => `superimposer:links:${sig}`;
  function readStored(sig) {
    try { return JSON.parse(localStorage.getItem(storeKey(sig))) || []; } catch { return []; }
  }
  function writeStored() {
    if (!S.linkSig) return;
    try {
      if (S.links.length) localStorage.setItem(storeKey(S.linkSig), JSON.stringify(S.links));
      else localStorage.removeItem(storeKey(S.linkSig));
    } catch { /* private window or storage switched off: links just aren't remembered */ }
  }
  function syncLinks() {
    const d = S.dataset;
    const sig = d.rows.length ? JSON.stringify([d.templateName, d.dim, d.rows.map(r => r.id)]) : null;
    if (sig === S.linkSig) return;
    S.linkSig = sig;
    S.links = sig ? readStored(sig) : [];
    S.linkStart = null;
    S.linkReport = '';
  }
  function setLinks(list) {
    S.links = list;
    writeStored();
    render();
  }
  /** Ids and consensus positions of the fixed landmarks, for the automatic links. */
  function fixedLandmarks() {
    const { rows } = S.res.prep, at = rows.map((r, i) => i).filter(i => rows[i].type !== 'curve');
    return { ids: at.map(i => rows[i].id), points: at.map(i => S.res.gpa.consensus[i]) };
  }
  function clickLandmark(id) {
    if (S.linkStart == null) S.linkStart = id;
    else if (S.linkStart === id) S.linkStart = null;
    else { S.links = LK.toggle(S.links, S.linkStart, id); S.linkStart = id; writeStored(); }
    render();
  }

  /** Each colouring option: operator, source file, group-table columns. Up to eight levels can be shown. */
  function colourOptions() {
    const out = [];
    if (!S.res || !S.res.prep) return out;
    const list = S.res.prep.specimens;
    const levels = get => [...new Set(list.map(get).filter(Boolean))].sort();
    const add = (value, label, get) => { const lv = levels(get); if (lv.length > 1 || value.startsWith('csv:')) out.push({ value, label, get, levels: lv }); };
    add('operator', 'Operator', s => s.operator);
    add('replicate', 'Replicate', s => (s.nReplicates > 1 ? '' : String(s.replicate)));
    if (S.table) {
      const joined = IO.joinGroups(list, S.table);
      for (const f of joined.factors) {
        const byKey = new Map(list.map((s, i) => [s.key, joined.values[i][f.name]]));
        add(`csv:${f.name}`, f.name, s => byKey.get(s.key));
      }
    }
    return out;
  }
  function currentGroups(options) {
    const opt = options.find(o => o.value === S.colour);
    if (!opt || opt.levels.length === 0 || opt.levels.length > PL.MAX_LEVELS) return undefined;
    return { name: opt.label, levels: opt.levels, index: S.res.prep.specimens.map(s => opt.levels.indexOf(opt.get(s) || '')) };
  }

  /* ---------- drawing ---------- */
  function render() {
    const has = S.all.length > 0 || S.refused.length > 0;
    $('empty').hidden = has;
    $('side').hidden = !has;
    const ok = !!(S.res && S.res.ok);
    $('results').hidden = !ok;
    $('message').hidden = !(S.res && !S.res.ok);
    if (S.res && !S.res.ok) $('message').textContent = S.res.message;
    if (!S.res && has) { $('message').hidden = false; $('message').textContent = 'None of the files could be used. The notes on the left say why.'; }
    if (!(ok && S.fitted)) { S.editingLinks = false; S.linkStart = null; }
    $('bDownload').disabled = !(ok && S.fitted);
    $('bClear').disabled = !has;
    $('bGroups').disabled = !S.all.length;
    if (!has) return;
    renderSide();
    if (ok) renderFigures();
  }

  function renderSide() {
    const d = S.dataset, res = S.res, prep = res && res.prep;
    const sources = new Set(d.specimens.map(s => s.source));
    const fmt = [...sources].map(x => (x === 'tps' ? 'TPS' : 'landmark-json')).join(' + ');
    $('summary').innerHTML = d.specimens.length
      ? `<div><b>${plural(d.specimens.length, 'specimen')}</b> · ${d.dim}D · ${plural(d.rows.length, 'point')}</div>`
        + `<div class="sub">${esc(d.templateName || fmt)} · ${esc(unitWord(d.units))}</div>`
        + (prep ? `<div class="sub">Analysed: ${plural(prep.specimens.length, 'specimen')}, ${plural(prep.rows.length, 'point')}</div>` : '')
      : '<div class="sub">No usable specimens yet.</div>';

    // banners
    $('tpsBanner').hidden = !d.needsTpsConfirm;
    if (d.needsTpsConfirm) {
      const n = d.excluded.filter(e => /TPS has no landmark names/.test(e.reason)).length;
      $('tpsText').textContent = `${plural(n, 'specimen')} from TPS can join only if the rows are in the same order as “${d.templateName}”. TPS can’t tell us that.`;
    }
    const mirrored = res && res.ok ? res.mirrored : [];
    $('mirrorBanner').hidden = !mirrored.length;
    if (mirrored.length) {
      $('mirrorCount').textContent = `${plural(mirrored.length, 'specimen')} look${mirrored.length === 1 ? 's' : ''} mirrored:`;
      $('mirrorList').textContent = mirrored.slice(0, 12).join(', ') + (mirrored.length > 12 ? ', …' : '');
    }
    $('flippedNote').hidden = !S.flip.size;
    if (S.flip.size) $('flippedText').textContent = `${plural(S.flip.size, 'specimen')} flipped left to right: ${[...S.flip].slice(0, 12).join(', ')}.`;

    // notes
    const notes = [];
    for (const r of S.refused) notes.push(`<span class="mono">${esc(r.name)}</span> not opened: ${esc(r.reason)}`);
    for (const e of d.excluded) if (!/TPS has no landmark names/.test(e.reason)) notes.push(`<span class="mono">${esc(e.id)}</span> not used: ${esc(e.reason)}`);
    for (const w of [...S.warnings, ...d.warnings]) notes.push(esc(w));
    if (prep) {
      for (const x of prep.dropped.specimens) notes.push(`<span class="mono">${esc(x.key)}</span> left out: ${esc(x.reason)}`);
      for (const x of prep.dropped.points) notes.push(`<span class="mono">${esc(x.id)}</span> left out: ${esc(x.reason)}`);
      if (prep.estimated) notes.push(`${plural(prep.estimated, 'estimated landmark')} used in the analysis.`);
      if (prep.semilandmarksUsed) notes.push(`${plural(prep.semilandmarksUsed, 'semilandmark')} included but not slid, so treat the results as exploratory.`);
      else if (prep.semilandmarksAvailable) notes.push(`${plural(prep.semilandmarksAvailable, 'semilandmark')} left out. They need sliding, which comes later.`);
    }
    if (d.units === 'px') notes.push('Coordinates are in pixels, so centroid sizes are only comparable at equal magnification.');
    if (S.tableReport) notes.push(S.tableReport);
    if (S.linkReport) notes.push(esc(S.linkReport));
    $('issuesCard').hidden = !notes.length;
    $('issues').innerHTML = notes.map(n => `<li>${n}</li>`).join('');

    // links
    const usable = !!(res && res.ok);
    $('linksCard').hidden = !d.rows.length;
    $('linksCount').textContent = S.links.length ? plural(S.links.length, 'link') : '';
    $('bEditLinks').disabled = !(usable && S.fitted);
    $('bEditLinks').title = usable && S.fitted ? 'Click landmarks in the superimposition' : 'Run the Procrustes fit first';
    $('bEditLinks').textContent = S.editingLinks ? 'Done' : 'Draw links';
    $('bEditLinks').classList.toggle('on', S.editingLinks);
    for (const id of ['bOutline', 'bTriangulate']) { $(id).hidden = d.dim === 3; $(id).disabled = !usable; }
    $('bSaveLinks').disabled = !S.links.length;
    $('bClearLinks').disabled = !S.links.length;
    $('linksList').innerHTML = S.links.map((l, i) => `<li>${esc(l[0])}–${esc(l[1])}<button type="button" data-i="${i}" aria-label="Remove link ${esc(l[0])} to ${esc(l[1])}">×</button></li>`).join('');

    // controls
    $('selMissing').value = S.missing;
    $('selReplicates').value = S.replicates;
    $('semiRow').hidden = !d.rows.some(r => r.type === 'curve');
    $('chkSemi').checked = S.semilandmarks;
    const options = colourOptions();
    if (S.colour && !options.some(o => o.value === S.colour)) S.colour = '';
    $('selColour').innerHTML = '<option value="">Nothing</option>' + options.map(o => {
      const tooMany = o.levels.length > PL.MAX_LEVELS;
      return `<option value="${esc(o.value)}" ${tooMany ? 'disabled' : ''}>${esc(o.label)}${tooMany ? ` (${o.levels.length} levels, too many)` : ''}</option>`;
    }).join('');
    $('selColour').value = S.colour;

    // specimen table
    const inPrep = new Map(prep ? prep.specimens.map((s, i) => [s.key, i]) : []);
    const droppedBy = new Map(prep ? prep.dropped.specimens.map(x => [x.key, x.reason]) : []);
    const ok = res && res.ok && S.fitted;
    $('tblSpecimens').innerHTML = '<thead><tr><th></th><th>Specimen</th><th class="num" title="Procrustes distance to the consensus">Dist.</th></tr></thead><tbody>' + d.specimens.map(s => {
      const off = S.excludeSpecimens.has(s.key);
      const i = inPrep.get(s.key);
      const why = off ? '' : droppedBy.get(s.key) || (i == null && S.replicates === 'average' ? 'averaged' : '');
      const dist = ok && i != null ? res.gpa.procD[i].toFixed(4) : '';
      const flag = ok && i != null && res.outliers[i];
      return `<tr class="${off ? 'off' : ''} ${S.selected === s.key ? 'sel' : ''}" data-key="${esc(s.key)}"><td><input type="checkbox" ${off ? '' : 'checked'} aria-label="Use ${esc(s.key)}"></td>`
        + `<td class="id">${esc(s.key)}${why ? `<div class="why">${esc(why)}</div>` : ''}</td>`
        + `<td class="num ${flag ? 'flag' : ''}" ${flag ? 'title="Far from the others: check its landmarks"' : ''}>${dist}${flag ? ' !' : ''}</td></tr>`;
    }).join('') + '</tbody>';

    // landmark table
    const gaps = i => d.specimens.filter(s => !s.coords[i]).length;
    $('tblPoints').innerHTML = '<thead><tr><th></th><th>Point</th><th class="num" title="Specimens where it is missing">Gaps</th></tr></thead><tbody>' + d.rows.map((r, i) => {
      if (r.type === 'curve') return '';
      const off = S.excludePoints.has(r.id);
      return `<tr class="${off ? 'off' : ''}" data-id="${esc(r.id)}"><td><input type="checkbox" ${off ? '' : 'checked'} aria-label="Use ${esc(r.id)}"></td>`
        + `<td class="id">${esc(r.id)}${r.label ? `<div class="why">${esc(r.label)}</div>` : ''}</td><td class="num">${gaps(i) || ''}</td></tr>`;
    }).join('') + '</tbody>';
  }

  const pcName = (i) => `PC${i + 1} (${(S.res.pca.proportion[i] * 100).toFixed(1)}%)`;
  function fillPcSelect(id, value) {
    const q = Math.min(S.res.pca.values.length, 12);
    $(id).innerHTML = Array.from({ length: q }, (_, i) => `<option value="${i}">${pcName(i)}</option>`).join('');
    $(id).value = String(value);
  }

  function shapeOptions(th) {
    const { res } = S, pc = S.shapePc;
    const col = res.pca.scores.map(r => r[pc]);
    const reach = S.shapeT >= 0 ? Math.max(...col) : Math.min(...col);
    const score = Math.abs(S.shapeT) * reach * S.mag;
    const sign = score >= 0 ? '+' : '';
    return {
      mean: res.gpa.consensus,
      target: GM.shapeAt(res.pca, pc, score),
      rows: res.prep.rows,
      view: res.prep.dim === 3 ? S.view : null,
      links: LK.indexPairs(S.links, res.prep.rows),
      targetLabel: `PC${pc + 1} ${sign}${score.toFixed(3)}${S.mag > 1 ? ` (×${S.mag})` : ''}`,
      labels: S.labels, theme: th, width: 520, height: 430,
    };
  }

  /** Every figure as a function of the theme, so exports can always be drawn in the light theme. */
  function figureBuilders() {
    const { res } = S;
    const options = colourOptions();
    const groups = currentGroups(options);
    const keys = res.prep.specimens.map(s => s.key);
    const view = res.prep.dim === 3 ? S.view : null;
    const tip = res.prep.specimens.map((s, i) => `size ${res.gpa.csize[i].toPrecision(4)} · dist ${res.gpa.procD[i].toFixed(4)}`);
    const links = LK.indexPairs(S.links, res.prep.rows);
    const startAt = S.linkStart == null ? -1 : res.prep.rows.findIndex(r => r.id === S.linkStart);
    const base = { keys, selected: S.selected, groups, outliers: res.outliers, tips: tip, hulls: S.hulls };
    const col = c => res.pca.scores.map(r => r[c]);
    return {
      super: (theme_, extra) => (!S.fitted
        ? PL.rawData(Object.assign({ matrix: GM.rawCoords(res.prep), keys, groups, selected: S.selected, view, links, theme: theme_ }, extra))
        : PL.superimposition(Object.assign({ aligned: res.gpa.aligned, consensus: res.gpa.consensus, rows: res.prep.rows, keys, groups, selected: S.selected, view, labels: S.labels, links, editing: S.editingLinks, linkStart: startAt >= 0 ? startAt : undefined, theme: theme_ }, extra))),
      scatter: (theme_, extra) => PL.scatter(Object.assign({}, base, { x: col(S.pcX), y: col(S.pcY), xLabel: pcName(S.pcX), yLabel: pcName(S.pcY), equal: S.equal, zeroLines: true, theme: theme_ }, extra)),
      scree: (theme_, extra) => PL.scree(Object.assign({ proportion: res.pca.proportion, theme: theme_, height: 190 }, extra)),
      shape: (theme_, extra) => PL.shapeChange(Object.assign(shapeOptions(theme_), extra)),
      size: (theme_, extra) => PL.scatter(Object.assign({}, base, { x: res.gpa.csize, y: col(S.sizePc), xLabel: `Centroid size (${unitWord(S.dataset.units)})`, yLabel: pcName(S.sizePc), theme: theme_ }, extra)),
      repeat: (theme_, extra) => (S.repeat.specimens.length ? PL.repeatabilityBars({ rows: S.repeat.rows.map(r => Object.assign({}, r)), units: unitWord(S.repeat.units), median: S.repeat.median, theme: theme_, width: extra && extra.width }) : ''),
    };
  }

  /** Live figures are drawn at the panel's width, so text keeps its size; exported ones use the default size. */
  function liveSize(name, el) {
    const width = Math.max(300, Math.round(el.clientWidth));
    const room = Math.max(320, window.innerHeight - 190);
    const shares = { super: Math.min(room, width * 0.72), scatter: Math.min(room, width * 0.74), scree: 190, shape: Math.min(room, width * 0.82), size: Math.min(room, width * 0.62), repeat: 0 };
    return { width, height: Math.round(shares[name]) };
  }

  const NEEDS_FIT = ['morpho', 'size'];
  const PLOT_IDS = { super: 'plotSuper', scatter: 'plotScatter', scree: 'plotScree', shape: 'plotShape', size: 'plotSize', repeat: 'plotRepeat' };
  const TAB_PLOTS = { super: ['super'], morpho: ['scatter', 'scree', 'shape'], size: ['size'], repeat: ['repeat'] };

  function renderFigures() {
    const { res } = S;
    if (!S.fitted && NEEDS_FIT.includes(S.tab)) S.tab = 'super';
    document.querySelectorAll('.tab').forEach(b => {
      if (NEEDS_FIT.includes(b.dataset.tab)) {
        b.disabled = !S.fitted;
        b.title = S.fitted ? '' : 'Run the Procrustes fit first';
      }
    });
    document.querySelectorAll('.tab').forEach(b => { b.classList.toggle('on', b.dataset.tab === S.tab); b.setAttribute('aria-selected', b.dataset.tab === S.tab); });
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== S.tab; });
    fillPcSelect('selPcX', S.pcX);
    fillPcSelect('selPcY', S.pcY);
    fillPcSelect('selShapePc', S.shapePc);
    fillPcSelect('selSizePc', S.sizePc);
    $('rngShape').value = String(S.shapeT);
    $('rngMag').value = String(S.mag);
    $('magValue').textContent = `×${S.mag}`;
    $('chkLabels').checked = S.labels;
    $('chkHulls').checked = S.hulls;
    $('chkEqual').checked = S.equal;
    const is3D = res.prep.dim === 3;
    $('plotSuper').classList.toggle('turn', is3D);
    $('plotShape').classList.toggle('turn', is3D);
    $('bFit').textContent = S.fitted ? 'Show raw data' : 'Run Procrustes fit';
    $('superHint').textContent = S.editingLinks ? 'Click a landmark, then the next, to draw lines. Click the same landmark again to stop. Linking a joined pair removes the line.' : (S.fitted
      ? `${plural(res.prep.specimens.length, 'specimen')} aligned; the large points are the consensus.`
      : `${plural(res.prep.specimens.length, 'specimen')} as digitised (${unitWord(S.dataset.units)}, y up), before any alignment.`) + (is3D && !S.editingLinks ? ' Drag to turn.' : '');
    const mixed = S.dataset.units === 'mixed';
    $('sizeWarn').hidden = !mixed;
    if (mixed) $('sizeWarn').textContent = 'These specimens are in different units, so their centroid sizes can’t be compared.';
    const repeated = S.repeat.specimens;
    $('repeatHint').textContent = repeated.length
      ? `Raw distance between replicates of ${plural(repeated.length, 'specimen')}, within each operator. Landmarks over twice the median are marked.`
      : 'No replicates found. Landmark the same specimen again in the landmarking app to see how repeatable each landmark is.';
    const note = $('selectionNote');
    if (S.selected) {
      const i = res.prep.specimens.findIndex(s => s.key === S.selected);
      note.textContent = i >= 0
        ? `${S.selected}: centroid size ${res.gpa.csize[i].toPrecision(4)}, distance to consensus ${res.gpa.procD[i].toFixed(4)}, PC1 ${res.pca.scores[i][0].toFixed(4)}`
        : `${S.selected} is not in this analysis.`;
    } else note.textContent = 'Click a specimen to pick it out.';

    const build = figureBuilders(), th = theme();
    for (const name of TAB_PLOTS[S.tab]) {
      const el = $(PLOT_IDS[name]);
      el.innerHTML = build[name](th, liveSize(name, el));
      el.querySelectorAll('.pt').forEach(g => {
        const t = g.querySelector('title');
        if (t) { g.dataset.tip = t.textContent; t.remove(); }
      });
    }
  }

  /* ---------- reading files ---------- */
  const fileBytes = f => f.arrayBuffer().then(b => new Uint8Array(b));

  async function addFiles(fileList) {
    const files = [];
    for (const f of fileList) files.push({ name: f.name, data: await fileBytes(f) });
    const r = await IO.loadFiles(files);
    S.fitted = false;
    S.all.push(...r.specimens);
    S.warnings.push(...r.warnings);
    S.refused.push(...r.refused);
    rerun();
  }

  function useTable(text, name) {
    S.table = IO.parseTable(text);
    const list = S.dataset ? S.dataset.specimens : [];
    const j = IO.joinGroups(list, S.table);
    S.tableReport = `${name || 'Group table'}: matched on “${j.idColumn}”${j.unmatched.length ? `, ${plural(j.unmatched.length, 'specimen')} not in it` : ''}${j.unused.length ? `, ${plural(j.unused.length, 'row')} unused` : ''}.`;
  }

  async function loadExample() {
    clearAll(false);
    const ex = EXAMPLE.make();
    const r = await IO.loadFiles(ex.files);
    S.all.push(...r.specimens);
    S.table = IO.parseTable(ex.groups);
    S.tableReport = '';
    rerun();
  }

  function clearAll(draw) {
    Object.assign(S, { all: [], warnings: [], refused: [], confirmTps: false, fitted: false, links: [], linkSig: null, editingLinks: false, linkStart: null, linkReport: '', table: null, tableReport: '', dataset: null, res: null, repeat: null, selected: null, colour: '', tab: 'super', view: IDENTITY.map(r => r.slice()) });
    S.flip = new Set(); S.excludeSpecimens = new Set(); S.excludePoints = new Set();
    if (draw !== false) render();
  }

  /* ---------- downloads ---------- */
  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function downloadResults() {
    const list = S.res.prep.specimens;
    let groups = null;
    if (S.table) {
      const j = IO.joinGroups(list, S.table);
      groups = { columns: j.factors.map(x => x.name), values: j.values };
    }
    const files = EX.bundle(S.res, S.dataset, optsNow(), groups);
    if (S.repeat.specimens.length) files.push({ name: 'repeatability.csv', data: EX.repeatabilityCSV(S.repeat) });
    if (S.links.length) files.push({ name: 'links.csv', data: LK.toCSV(S.links) });
    save(new Blob([IO.zipFiles(files)], { type: 'application/zip' }), 'superimposer-results.zip');
  }

  const FIG_NAMES = { super: 'superimposition', scatter: 'morphospace', scree: 'scree', shape: 'shape-change', size: 'size', repeat: 'repeatability' };

  function exportFigure(name, kind) {
    const svg = figureBuilders()[name](PL.THEMES.light, { forExport: true });
    if (!svg) return;
    const file = name === 'super' && !S.fitted ? 'raw-data' : FIG_NAMES[name];
    if (kind === 'svg') { save(new Blob([svg], { type: 'image/svg+xml' }), `${file}.svg`); return; }
    const img = new Image();
    img.onload = () => {
      const k = 3, canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * k; canvas.height = img.naturalHeight * k;
      const g = canvas.getContext('2d');
      g.scale(k, k);
      g.drawImage(img, 0, 0);
      canvas.toBlob(b => save(b, `${file}.png`), 'image/png');
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  /* ---------- events ---------- */
  const bindChange = (id, fn) => on($(id), 'change', e => { fn(e.target); rerun(); });
  const openPicker = () => $('fData').click();
  on($('bOpen'), 'click', openPicker);
  on($('bOpen2'), 'click', openPicker);
  on($('bExample'), 'click', loadExample);
  on($('bExample2'), 'click', loadExample);
  on($('bGroups'), 'click', () => $('fGroups').click());
  on($('bClear'), 'click', () => clearAll());
  on($('bDownload'), 'click', downloadResults);
  on($('fData'), 'change', async e => { await addFiles(e.target.files); e.target.value = ''; });
  on($('fGroups'), 'change', async e => {
    const f = e.target.files[0];
    if (f) { useTable(await f.text(), f.name); rerun(); }
    e.target.value = '';
  });
  on($('bFit'), 'click', () => { S.fitted = !S.fitted; render(); });
  on($('bEditLinks'), 'click', () => {
    S.editingLinks = !S.editingLinks;
    S.linkStart = null;
    if (S.editingLinks) S.tab = 'super';
    render();
  });
  on($('bOutline'), 'click', () => { const { points, ids } = fixedLandmarks(); setLinks(LK.outline(points, ids)); });
  on($('bTriangulate'), 'click', () => { const { points, ids } = fixedLandmarks(); setLinks(LK.triangulate(points, ids)); });
  on($('bClearLinks'), 'click', () => { S.linkStart = null; setLinks([]); });
  on($('bSaveLinks'), 'click', () => save(new Blob([LK.toCSV(S.links)], { type: 'text/csv' }), 'links.csv'));
  on($('bLoadLinks'), 'click', () => $('fLinks').click());
  on($('fLinks'), 'change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !S.dataset) return;
    const r = LK.parse(await f.text(), S.dataset.rows.filter(x => x.type !== 'curve').map(x => x.id));
    S.linkStart = null;
    S.linkReport = r.unknown.length ? `${f.name}: ${plural(r.unknown.length, 'line')} not used: ${r.unknown.slice(0, 6).join('; ')}${r.unknown.length > 6 ? '; …' : ''}` : '';
    setLinks(r.links);
  });
  on($('linksList'), 'click', e => {
    const b = e.target.closest('button[data-i]');
    if (b) setLinks(S.links.filter((_, i) => i !== Number(b.dataset.i)));
  });
  on($('plotSuper'), 'click', e => {
    const hit = e.target.closest('.lm-hit');
    if (hit) clickLandmark(S.res.prep.rows[Number(hit.dataset.lm)].id);
  });
  on($('bConfirmTps'), 'click', () => { S.confirmTps = true; rerun(); });
  on($('bFlipAll'), 'click', () => { for (const k of S.res.mirrored) S.flip.add(k); rerun(); });
  on($('bUnflip'), 'click', () => { S.flip = new Set(); rerun(); });
  bindChange('selMissing', t => { S.missing = t.value; });
  bindChange('selReplicates', t => { S.replicates = t.value; });
  bindChange('chkSemi', t => { S.semilandmarks = t.checked; });
  bindChange('selColour', t => { S.colour = t.value; });
  bindChange('chkLabels', t => { S.labels = t.checked; });
  bindChange('chkHulls', t => { S.hulls = t.checked; });
  bindChange('chkEqual', t => { S.equal = t.checked; });
  bindChange('selPcX', t => { S.pcX = Number(t.value); });
  bindChange('selPcY', t => { S.pcY = Number(t.value); });
  bindChange('selShapePc', t => { S.shapePc = Number(t.value); });
  bindChange('selSizePc', t => { S.sizePc = Number(t.value); });
  on($('rngShape'), 'input', e => { S.shapeT = Number(e.target.value); render(); });
  on($('rngMag'), 'input', e => { S.mag = Number(e.target.value); render(); });

  document.querySelectorAll('.tab').forEach(b => on(b, 'click', () => { S.tab = b.dataset.tab; render(); }));
  document.querySelectorAll('[data-export]').forEach(b => on(b, 'click', () => exportFigure(b.dataset.plot, b.dataset.export)));

  on($('tblSpecimens'), 'change', e => {
    const tr = e.target.closest('tr');
    if (e.target.checked) S.excludeSpecimens.delete(tr.dataset.key); else S.excludeSpecimens.add(tr.dataset.key);
    rerun();
  });
  on($('tblSpecimens'), 'click', e => {
    if (e.target.tagName === 'INPUT') return;
    const tr = e.target.closest('tr[data-key]');
    if (tr) { S.selected = S.selected === tr.dataset.key ? null : tr.dataset.key; render(); }
  });
  on($('tblPoints'), 'change', e => {
    const tr = e.target.closest('tr');
    if (e.target.checked) S.excludePoints.delete(tr.dataset.id); else S.excludePoints.add(tr.dataset.id);
    rerun();
  });

  // Hover and click on specimens, by delegation because the figures are redrawn often.
  const tipEl = $('tip');
  for (const id of ['plotScatter', 'plotSize']) {
    const el = $(id);
    on(el, 'click', e => {
      const g = e.target.closest('.pt');
      if (!g) return;
      const key = S.res.prep.specimens[Number(g.dataset.i)].key;
      S.selected = S.selected === key ? null : key;
      render();
    });
    on(el, 'pointermove', e => {
      const g = e.target.closest('.pt');
      if (!g) { tipEl.hidden = true; return; }
      tipEl.hidden = false;
      tipEl.textContent = g.dataset.tip;
      tipEl.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 290)}px`;
      tipEl.style.top = `${e.clientY + 14}px`;
    });
    on(el, 'pointerleave', () => { tipEl.hidden = true; });
  }

  // Dragging turns 3D figures.
  for (const id of ['plotSuper', 'plotShape']) {
    const el = $(id);
    let last = null, queued = false;
    on(el, 'pointerdown', e => {
      if (!S.res || !S.res.ok || S.res.prep.dim !== 3) return;
      last = [e.clientX, e.clientY];
      e.preventDefault();
    });
    on(window, 'pointermove', e => {
      if (!last) return;
      S.view = PL.turnView(S.view, (e.clientX - last[0]) * 0.012, (e.clientY - last[1]) * 0.012);
      last = [e.clientX, e.clientY];
      if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; renderFigures(); }); }
    });
    on(window, 'pointerup', () => { last = null; });
  }

  // Dropping files anywhere.
  let dragDepth = 0;
  on(window, 'dragenter', e => { e.preventDefault(); dragDepth++; $('dropCue').hidden = false; });
  on(window, 'dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropCue').hidden = true; });
  on(window, 'dragover', e => e.preventDefault());
  on(window, 'drop', e => {
    e.preventDefault();
    dragDepth = 0;
    $('dropCue').hidden = true;
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  let resizing = false;
  on(window, 'resize', () => {
    if (resizing || !(S.res && S.res.ok)) return;
    resizing = true;
    requestAnimationFrame(() => { resizing = false; renderFigures(); });
  });

  on(window.matchMedia('(prefers-color-scheme: dark)'), 'change', () => { if (S.res && S.res.ok) render(); });
  render();
  document.documentElement.dataset.ready = '1';
}());
