// The page: keeps one state object S, reruns the analysis on any change and draws the figures.
// All calculation is in io.js, gm.js, exports.js and plots.js.
(function () {
  'use strict';
  const TB = window.SupTable, LK = window.SupLinks, IO = window.SupIO, GM = window.SupGM, EX = window.SupExport, PL = window.SupPlots, EXAMPLE = window.SupExample;
  const $ = id => document.getElementById(id);
  const on = (el, ev, fn) => el.addEventListener(ev, fn);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const MAX_PICKS = 4;
  const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  const S = {
    all: [], warnings: [], refused: [], confirmTps: false, table: null,
    dataset: null, res: null, repeat: null,
    missing: 'specimens', replicates: 'all', semilandmarks: false,
    flip: new Set(), excludeSpecimens: new Set(), excludePoints: new Set(),
    colour: '', labels: true, hulls: false, equal: true,
    links: [], linkSig: null, editingLinks: false, linkStart: null, linkReport: '',
    dtFilter: '', dtSort: null, dtCoords: false, dtSelected: new Set(), dtRows: [], dtMessage: '', dtArmed: null, autoData: false,
    fitted: false, tab: 'super', pcX: 0, pcY: 1, shapePc: 0, shapeT: 1, mag: 1, sizePc: 0,
    picked: [], analysisSig: '', shapeMode: 'axis', shapeStyle: 'arrows', styles: {}, styleKey: null,
    view: IDENTITY.map(r => r.slice()),
  };
  window.__sup = { S, TB };

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
    S.picked = S.picked.filter(p => p.virtual || known.has(p.key));
    S.res = S.dataset.specimens.length ? GM.analyse(S.dataset, optsNow()) : null;
    S.repeat = GM.repeatability(S.dataset);
    // A theoretical shape only means something in the PCA it came from.
    const fitted = S.res && S.res.ok ? S.res.prep : null;
    const sig = fitted ? JSON.stringify([fitted.specimens.map(s => [s.key, s.flipped]), fitted.rows.map(r => r.id)]) : '';
    if (sig !== S.analysisSig) { S.analysisSig = sig; S.picked = S.picked.filter(p => !p.virtual); }
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
  const styleKey = sig => `superimposer:styles:${sig}`;
  const groupKey = sig => `superimposer:groups:${sig}`;
  function writeGroups() {
    if (!S.linkSig || !S.table) return;
    try { localStorage.setItem(groupKey(S.linkSig), JSON.stringify(S.table)); } catch { /* see writeStored */ }
  }
  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function writeStyles() {
    if (!S.linkSig) return;
    try {
      if (Object.keys(S.styles).length) localStorage.setItem(styleKey(S.linkSig), JSON.stringify(S.styles));
      else localStorage.removeItem(styleKey(S.linkSig));
    } catch { /* see writeStored */ }
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
    S.links = sig ? readJson(storeKey(sig), []) : [];
    S.styles = sig ? readJson(styleKey(sig), {}) : {};
    if (sig && !S.table) {
      S.table = readJson(groupKey(sig), null);
      if (S.table) S.tableReport = 'Group columns remembered from your last session in this browser.';
    }
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
      const everyone = [...new Map([...S.dataset.specimens, ...list].map(s => [s.key, s])).values()];
      const joined = IO.joinGroups(everyone, S.table);
      for (const f of joined.factors) {
        const byKey = new Map(everyone.map((s, i) => [s.key, joined.values[i][f.name]]));
        add(`csv:${f.name}`, f.name, s => byKey.get(s.key));
      }
    }
    return out;
  }
  function currentGroups(options, list) {
    const opt = options.find(o => o.value === S.colour);
    if (!opt || opt.levels.length === 0 || opt.levels.length > PL.MAX_LEVELS) return undefined;
    return { name: opt.label, levels: opt.levels, index: (list || S.res.prep.specimens).map(s => opt.levels.indexOf(opt.get(s) || '')) };
  }

  /* ---------- drawing ---------- */
  function render() {
    const has = S.all.length > 0 || S.refused.length > 0;
    $('empty').hidden = has;
    $('side').hidden = !has;
    const ok = !!(S.res && S.res.ok);
    const shown = !!(S.dataset && S.dataset.specimens.length);
    $('results').hidden = !shown;
    $('message').hidden = !(S.res && !S.res.ok);
    if (S.res && !S.res.ok) $('message').textContent = S.res.message;
    if (!S.res && has) { $('message').hidden = false; $('message').textContent = 'None of the files could be used. The notes on the left say why.'; }
    if (!(ok && S.fitted)) { S.editingLinks = false; S.linkStart = null; }
    $('bDownload').disabled = !(ok && S.fitted);
    $('bClear').disabled = !has;
    $('bGroups').disabled = !S.all.length;
    if (!has) return;
    renderSide();
    if (shown) showPanels(ok);
    if (ok) renderFigures();
    if (shown && S.tab === 'data') renderDataTable();
  }

  /** Which tabs can be opened. The data table always can; it is where to look when an analysis fails. */
  function showPanels(ok) {
    if (!ok) { if (S.tab !== 'data') S.autoData = true; S.tab = 'data'; }
    else if (S.autoData) { S.autoData = false; S.tab = 'super'; }
    if (ok && !S.fitted && NEEDS_FIT.includes(S.tab)) S.tab = 'super';
    document.querySelectorAll('.tab').forEach(b => {
      const tab = b.dataset.tab;
      const blocked = tab === 'data' ? '' : !ok ? 'Not enough data to analyse' : NEEDS_FIT.includes(tab) && !S.fitted ? 'Run the Procrustes fit first' : '';
      b.disabled = !!blocked;
      b.title = blocked;
      b.classList.toggle('on', tab === S.tab);
      b.setAttribute('aria-selected', tab === S.tab);
    });
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== S.tab; });
  }

  /* ---------- data table ---------- */
  const groupColumns = () => (S.table ? S.table.columns.filter(c => c !== TB.idColumn(S.table)) : []);
  const pointColumns = () => S.dataset.rows.map((r, at) => Object.assign({}, r, { at })).filter(r => r.type !== 'curve' || S.semilandmarks);
  function visibleRows() {
    const all = TB.buildRows(S.dataset, S.res, S.table, S.excludeSpecimens, { fitted: S.fitted, semilandmarks: S.semilandmarks });
    const shown = TB.filterRows(all, S.dtFilter);
    return { all, rows: S.dtSort ? TB.sortRows(shown, S.dtSort.col, S.dtSort.dir) : shown };
  }

  function renderDataTable() {
    const active = document.activeElement;
    const focus = active && active.classList && active.classList.contains('dt-cell') ? { key: active.dataset.key, col: active.dataset.col, at: active.selectionStart } : null;
    const known = new Set(S.dataset.specimens.map(s => s.key));
    S.dtSelected = new Set([...S.dtSelected].filter(k => known.has(k)));
    const { all, rows } = visibleRows();
    S.dtRows = rows;
    const groups = groupColumns();
    const points = S.dtCoords ? pointColumns() : [];
    const axes = ['x', 'y', 'z'].slice(0, S.dataset.dim);
    const options = colourOptions();
    const styleByKey = new Map(S.dataset.specimens.map((s, i, list) => [s.key, PL.resolveStyles(list.map(x => x.key), currentGroups(options, list), S.styles)[i]]));
    const th = theme();
    const arrow = col => (S.dtSort && S.dtSort.col === col ? (S.dtSort.dir > 0 ? ' ▲' : ' ▼') : '');
    const head = (col, label) => `<button type="button" data-sort="${esc(col)}">${esc(label)}${arrow(col)}</button>`;
    const BASE = [['replicate', 'Rep.'], ['operator', 'Operator'], ['source', 'Source'], ['units', 'Units'], ['csize', 'Centroid size'], ['dist', 'Proc. distance'], ['missing', 'Missing'], ['notDone', 'Not done'], ['estimated', 'Estimated']];
    const numCell = (v, text, c, extra) => `<td class="n ${extra || ''}" data-c="${c}">${v == null || v === 0 ? '' : text}</td>`;

    const lines = rows.map(r => {
      const coordCells = points.flatMap(p => axes.map((a, d) => {
        const c = r.coords[p.at], name = `${p.id}_${a}`;
        const est = r.status[p.at] === 'estimated' ? 'dt-est' : '';
        return c ? `<td class="n ${est}" data-c="${esc(name)}">${c[d].toFixed(3)}</td>` : `<td class="dt-gap" data-c="${esc(name)}">–</td>`;
      })).join('');
      return `<tr data-key="${esc(r.key)}" class="${S.dtSelected.has(r.key) ? 'ticked' : ''} ${r.use ? '' : 'left-out'}">`
        + `<td class="fix f0"><input type="checkbox" class="dt-select" ${S.dtSelected.has(r.key) ? 'checked' : ''} aria-label="Tick ${esc(r.key)}"></td>`
        + `<td class="fix f1"><input type="checkbox" class="dt-use" ${r.use ? 'checked' : ''} aria-label="Use ${esc(r.key)} in the analysis"></td>`
        + `<td class="fix f2"><button class="mk" type="button" aria-label="Change the marker of ${esc(r.key)}" title="Change marker">${PL.markerIcon(styleByKey.get(r.key), th)}</button></td>`
        + `<td class="fix f3">${esc(r.key)}</td>`
        + groups.map((g, i) => `<td class="g"><input class="dt-cell" data-key="${esc(r.key)}" data-col="${esc(g)}" list="dl-${i}" value="${esc(r.groups[g] || '')}" aria-label="${esc(g)} of ${esc(r.key)}"></td>`).join('')
        + `<td class="n" data-c="replicate">${r.replicate}</td><td data-c="operator">${esc(r.operator)}</td><td data-c="source">${esc(r.source)}</td><td data-c="units">${esc(unitWord(r.units))}</td>`
        + numCell(r.csize, r.csize == null ? '' : r.csize.toPrecision(5), 'csize')
        + numCell(r.dist, r.dist == null ? '' : r.dist.toFixed(4), 'dist')
        + numCell(r.missing, r.missing, 'missing', r.missing ? 'has-gap' : '')
        + numCell(r.notDone, r.notDone, 'notDone', r.notDone ? 'has-gap' : '')
        + numCell(r.estimated, r.estimated, 'estimated')
        + coordCells + '</tr>';
    }).join('');

    const allTicked = rows.length > 0 && rows.every(r => S.dtSelected.has(r.key));
    $('dataTable').innerHTML = `<thead><tr><th class="fix f0"><input type="checkbox" id="dtSelectAll" ${allTicked ? 'checked' : ''} aria-label="Tick all rows shown"></th>`
      + '<th class="fix f1" title="Use in the analysis">Use</th><th class="fix f2"></th>'
      + `<th class="fix f3">${head('key', 'Specimen')}</th>`
      + groups.map(g => `<th class="dt-group">${head(`group:${g}`, g)}<button type="button" class="x ${S.dtArmed === g ? 'armed' : ''}" data-remove="${esc(g)}" aria-label="Remove column ${esc(g)}">${S.dtArmed === g ? 'Remove?' : '×'}</button></th>`).join('')
      + BASE.map(([c, l]) => `<th>${head(c, l)}</th>`).join('')
      + points.flatMap(p => axes.map(a => `<th>${esc(p.id)}_${a}</th>`)).join('')
      + `</tr></thead><tbody>${lines}</tbody>`;
    const headBox = $('dtSelectAll');
    if (headBox) headBox.indeterminate = !allTicked && rows.some(r => S.dtSelected.has(r.key));

    $('dtLists').innerHTML = groups.map((g, i) => {
      const levels = [...new Set(all.map(r => r.groups[g]).filter(Boolean))].sort();
      return `<datalist id="dl-${i}">${levels.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
    }).join('');
    const bulk = $('dtBulkCol'), keep = bulk.value;
    bulk.innerHTML = groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    if (groups.includes(keep)) bulk.value = keep;
    const bulkLevels = [...new Set(all.map(r => r.groups[bulk.value]).filter(Boolean))].sort();
    $('dtBulkList').innerHTML = bulkLevels.map(v => `<option value="${esc(v)}">`).join('');
    $('bBulk').disabled = !groups.length || !S.dtSelected.size;
    $('bSaveGroups').disabled = !groups.length;
    $('chkCoords').checked = S.dtCoords;
    $('dtCount').textContent = `${rows.length} of ${plural(all.length, 'record')}${S.dtSelected.size ? ` · ${S.dtSelected.size} selected` : ''}`;
    $('dtHint').textContent = S.dtMessage || (S.dtCoords
      ? 'Coordinates as imported: y points up, and scale applied. Red cells are missing, yellow ones estimated.'
      : 'Groups belong to the specimen ID, so replicates stay together. Type in a cell, paste from a spreadsheet, or tick rows and assign them.');

    if (focus) {
      const again = [...document.querySelectorAll('input.dt-cell')].find(i => i.dataset.key === focus.key && i.dataset.col === focus.col);
      if (again) { again.focus(); if (focus.at != null) again.setSelectionRange(focus.at, focus.at); }
    }
  }

  /** The records sharing these rows' specimen IDs, as a group value belongs to the ID. */
  function recordsOf(keys) {
    const ids = new Set(S.dataset.specimens.filter(s => keys.includes(s.key)).map(s => s.id));
    return S.dataset.specimens.filter(s => ids.has(s.id));
  }
  function editGroups(next) {
    S.table = next;
    S.dtMessage = '';
    writeGroups();
    setTimeout(rerun, 0); // after the browser has moved the focus, so typing carries on in the next cell
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
    const tableStyles = PL.resolveStyles(d.specimens.map(s => s.key), currentGroups(options, d.specimens), S.styles);
    const pickedSet = new Set(S.picked.map(p => p.key));
    $('tblSpecimens').innerHTML = '<thead><tr><th></th><th></th><th>Specimen</th><th class="num" title="Procrustes distance to the consensus">Dist.</th></tr></thead><tbody>' + d.specimens.map((s, row) => {
      const off = S.excludeSpecimens.has(s.key);
      const i = inPrep.get(s.key);
      const why = off ? '' : droppedBy.get(s.key) || (i == null && S.replicates === 'average' ? 'averaged' : '');
      const dist = ok && i != null ? res.gpa.procD[i].toFixed(4) : '';
      const flag = ok && i != null && res.outliers[i];
      return `<tr class="${off ? 'off' : ''} ${pickedSet.has(s.key) ? 'sel' : ''}" data-key="${esc(s.key)}"><td><input type="checkbox" ${off ? '' : 'checked'} aria-label="Use ${esc(s.key)}"></td>`
        + `<td><button class="mk" type="button" aria-label="Change the marker of ${esc(s.key)}" title="Change marker">${PL.markerIcon(tableStyles[row], theme())}</button></td>`
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

  const useGrid = () => S.shapeStyle === 'grid' && S.res.prep.dim === 2;

  /** What the Selected panel shows: real specimens and theoretical shapes, ready to draw. */
  function pickedItems(paints) {
    const { res } = S, keys = res.prep.specimens.map(s => s.key);
    const out = [];
    S.picked.forEach((p, index) => {
      let target, colour;
      if (p.virtual) target = GM.shapeFromScores(res.pca, p.scores);
      else {
        const i = keys.indexOf(p.key);
        if (i < 0) return;
        target = res.gpa.tangent[i];
        colour = paints[i];
      }
      out.push({ target, colour, label: p.virtual ? p.label.replace(/PC\d+ /g, '').replace('Theoretical: ', 'Theoretical (') + ')' : p.label, index, warp: useGrid() ? GM.tpsWarp(res.gpa.consensus, target) || undefined : undefined });
    });
    return out;
  }

  function togglePick(key) {
    const at = S.picked.findIndex(p => p.key === key);
    if (at >= 0) S.picked.splice(at, 1);
    else addPick({ key, label: key });
    render();
  }
  function addPick(entry) {
    S.picked.push(entry);
    if (S.picked.length > MAX_PICKS) S.picked.shift();
    S.shapeMode = 'picked';
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
      warp: useGrid() ? GM.tpsWarp(res.gpa.consensus, GM.shapeAt(res.pca, pc, score)) || undefined : undefined,
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
    const styles = PL.resolveStyles(keys, groups, S.styles);
    const selected = S.picked.filter(p => !p.virtual).map(p => p.key);
    const base = { keys, selected, styles, groups, outliers: res.outliers, tips: tip, hulls: S.hulls };
    const col = c => res.pca.scores.map(r => r[c]);
    return {
      super: (theme_, extra) => (!S.fitted
        ? PL.rawData(Object.assign({ matrix: GM.rawCoords(res.prep), keys, groups, styles, selected, view, links, theme: theme_ }, extra))
        : PL.superimposition(Object.assign({ aligned: res.gpa.aligned, consensus: res.gpa.consensus, rows: res.prep.rows, keys, groups, styles, selected, view, labels: S.labels, links, editing: S.editingLinks, linkStart: startAt >= 0 ? startAt : undefined, theme: theme_ }, extra))),
      scatter: (theme_, extra) => PL.scatter(Object.assign({}, base, { x: col(S.pcX), y: col(S.pcY), xLabel: pcName(S.pcX), yLabel: pcName(S.pcY), equal: S.equal, zeroLines: true, virtual: S.picked.filter(p => p.virtual).map(p => ({ x: p.scores[S.pcX], y: p.scores[S.pcY], label: 'Theoretical' })), theme: theme_ }, extra)),
      picked: (theme_, extra) => PL.shapeGrid({ items: pickedItems(styles.map(st => PL.colourValue(st.colour, theme_))), mean: res.gpa.consensus, rows: res.prep.rows, links, view, labels: S.labels, theme: theme_, width: extra && extra.width }),
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
    const shares = { picked: 0, super: Math.min(room, width * 0.72), scatter: Math.min(room, width * 0.74), scree: 190, shape: Math.min(room, width * 0.82), size: Math.min(room, width * 0.62), repeat: 0 };
    return { width, height: Math.round(shares[name]) };
  }

  const NEEDS_FIT = ['morpho', 'size'];
  const PLOT_IDS = { picked: 'plotPicked', super: 'plotSuper', scatter: 'plotScatter', scree: 'plotScree', shape: 'plotShape', size: 'plotSize', repeat: 'plotRepeat' };
  const tabPlots = tab => ({ super: ['super'], morpho: ['scatter', 'scree', S.shapeMode === 'picked' ? 'picked' : 'shape'], size: ['size'], repeat: ['repeat'], data: [] }[tab]);

  function renderFigures() {
    const { res } = S;
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
    const latest = S.picked[S.picked.length - 1];
    if (latest && !latest.virtual) {
      const i = res.prep.specimens.findIndex(s => s.key === latest.key);
      note.textContent = i >= 0
        ? `${latest.key}: centroid size ${res.gpa.csize[i].toPrecision(4)}, distance to consensus ${res.gpa.procD[i].toFixed(4)}, PC1 ${res.pca.scores[i][0].toFixed(4)}`
        : `${latest.key} is not in this analysis.`;
    } else if (latest) note.textContent = latest.label;
    else note.textContent = `Click a specimen to see its landmarks (up to ${MAX_PICKS}), or empty space for the shape at that position.`;
    document.querySelectorAll('.segb').forEach(b => b.classList.toggle('on', b.dataset.shape === S.shapeMode));
    $('pickCount').textContent = S.picked.length ? `(${S.picked.length})` : '';
    $('shapeAxis').hidden = S.shapeMode !== 'axis';
    $('shapePicked').hidden = S.shapeMode !== 'picked';
    $('shapeStyleRow').hidden = is3D;
    $('selShapeStyle').value = S.shapeStyle;
    $('bClearPicks').hidden = !S.picked.length;
    $('pickChips').innerHTML = S.picked.map((p, i) => `<li>${esc(p.label)}<button type="button" data-i="${i}" aria-label="Remove ${esc(p.label)}">×</button></li>`).join('');
    $('pickHint').textContent = S.picked.length ? (S.picked.length === MAX_PICKS ? 'A fifth click replaces the oldest.' : '') : `Click specimens in the morphospace (up to ${MAX_PICKS}), or empty space for the theoretical shape there.`;
    $('plotPicked').classList.toggle('turn', is3D);
    if (!S.picked.length) $('plotPicked').innerHTML = '';

    const build = figureBuilders(), th = theme();
    for (const name of tabPlots(S.tab)) {
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
    Object.assign(S, { all: [], warnings: [], refused: [], confirmTps: false, fitted: false, links: [], linkSig: null, editingLinks: false, linkStart: null, linkReport: '', table: null, tableReport: '', dtFilter: '', dtSort: null, dtSelected: new Set(), dtRows: [], dtMessage: '', dtArmed: null, autoData: false, dataset: null, res: null, repeat: null, picked: [], analysisSig: '', shapeMode: 'axis', styles: {}, colour: '', tab: 'super', view: IDENTITY.map(r => r.slice()) });
    S.flip = new Set(); S.excludeSpecimens = new Set(); S.excludePoints = new Set();
    closeStylePop();
    $('dtFilter').value = '';
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

  const FIG_NAMES = { picked: 'selected-specimens', super: 'superimposition', scatter: 'morphospace', scree: 'scree', shape: 'shape-change', size: 'size', repeat: 'repeatability' };

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
    if (f) { useTable(await f.text(), f.name); writeGroups(); rerun(); }
    e.target.value = '';
  });
  on($('bFit'), 'click', () => { S.fitted = !S.fitted; render(); });

  // Data table
  on($('dtFilter'), 'input', e => { S.dtFilter = e.target.value; renderDataTable(); });
  on($('chkCoords'), 'change', e => { S.dtCoords = e.target.checked; renderDataTable(); });
  on($('dtBulkCol'), 'change', () => renderDataTable());
  on($('bLoadGroups'), 'click', () => $('fGroups').click());
  on($('bSaveGroups'), 'click', () => save(new Blob([TB.groupsCSV(S.table)], { type: 'text/csv' }), 'groups.csv'));
  on($('bDownloadTable'), 'click', () => {
    const text = TB.tableCSV(S.dtRows, groupColumns(), pointColumns(), { coords: S.dtCoords });
    save(new Blob([text], { type: 'text/csv' }), 'specimen-table.csv');
  });
  const addColumnNow = () => {
    const name = $('dtNewCol').value;
    const next = TB.addColumn(S.table || TB.emptyTable(), name);
    if (!next) {
      S.dtMessage = name.trim() ? `There is already a column called “${name.trim()}”.` : 'Give the new column a name first.';
      renderDataTable();
      return;
    }
    $('dtNewCol').value = '';
    editGroups(next);
  };
  on($('bAddCol'), 'click', addColumnNow);
  on($('dtNewCol'), 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addColumnNow(); } });
  on($('bBulk'), 'click', () => {
    const col = $('dtBulkCol').value;
    if (!col || !S.dtSelected.size) return;
    editGroups(TB.setCells(S.table, recordsOf([...S.dtSelected]), col, $('dtBulkValue').value));
  });
  on($('dataTable'), 'click', e => {
    const mark = e.target.closest('.mk');
    if (mark) { openStylePop(mark.closest('tr').dataset.key, mark); return; }
    const sort = e.target.closest('[data-sort]');
    if (sort) {
      const col = sort.dataset.sort;
      S.dtSort = { col, dir: S.dtSort && S.dtSort.col === col ? -S.dtSort.dir : 1 };
      renderDataTable();
      return;
    }
    const remove = e.target.closest('[data-remove]');
    if (!remove) return;
    const col = remove.dataset.remove;
    if (S.dtArmed === col) { S.dtArmed = null; editGroups(TB.removeColumn(S.table, col)); return; }
    S.dtArmed = col;
    renderDataTable();
    setTimeout(() => { if (S.dtArmed === col) { S.dtArmed = null; if (S.tab === 'data') renderDataTable(); } }, 4000);
  });
  on($('dataTable'), 'change', e => {
    const t = e.target;
    if (t.id === 'dtSelectAll') {
      for (const r of S.dtRows) { if (t.checked) S.dtSelected.add(r.key); else S.dtSelected.delete(r.key); }
      renderDataTable();
    } else if (t.classList.contains('dt-select')) {
      const key = t.closest('tr').dataset.key;
      if (t.checked) S.dtSelected.add(key); else S.dtSelected.delete(key);
      renderDataTable();
    } else if (t.classList.contains('dt-use')) {
      const key = t.closest('tr').dataset.key;
      if (t.checked) S.excludeSpecimens.delete(key); else S.excludeSpecimens.add(key);
      rerun();
    } else if (t.classList.contains('dt-cell')) {
      editGroups(TB.setCells(S.table, recordsOf([t.dataset.key]), t.dataset.col, t.value));
    }
  });
  on($('dataTable'), 'keydown', e => {
    if (e.key !== 'Enter' || !e.target.classList.contains('dt-cell')) return;
    e.preventDefault();
    const column = [...document.querySelectorAll('input.dt-cell')].filter(i => i.dataset.col === e.target.dataset.col);
    const next = column[column.indexOf(e.target) + 1];
    if (next) next.focus(); else e.target.blur();
  });
  on($('dataTable'), 'paste', e => {
    const t = e.target;
    if (!t.classList.contains('dt-cell') || !e.clipboardData) return;
    const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; // one value: an ordinary paste into the cell
    e.preventDefault();
    const matrix = TB.parsePaste(text), groups = groupColumns();
    const startRow = S.dtRows.findIndex(r => r.key === t.dataset.key), startCol = groups.indexOf(t.dataset.col);
    let next = S.table;
    matrix.forEach((line, r) => line.forEach((value, c) => {
      const row = S.dtRows[startRow + r], col = groups[startCol + c];
      if (row && col) next = TB.setCells(next, recordsOf([row.key]), col, value);
    }));
    editGroups(next);
  });

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
  bindChange('selShapeStyle', t => { S.shapeStyle = t.value; });
  bindChange('selSizePc', t => { S.sizePc = Number(t.value); });
  document.querySelectorAll('.segb').forEach(b => on(b, 'click', () => { S.shapeMode = b.dataset.shape; render(); }));
  on($('bClearPicks'), 'click', () => { S.picked = []; render(); });
  on($('pickChips'), 'click', e => {
    const b = e.target.closest('button[data-i]');
    if (b) { S.picked.splice(Number(b.dataset.i), 1); render(); }
  });
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
    const tr = e.target.closest('tr[data-key]');
    if (!tr) return;
    const mark = e.target.closest('.mk');
    if (mark) { openStylePop(tr.dataset.key, mark); return; }
    if (e.target.closest('td.id') && S.res && S.res.ok) togglePick(tr.dataset.key);
  });
  on($('tblPoints'), 'change', e => {
    const tr = e.target.closest('tr');
    if (e.target.checked) S.excludePoints.delete(tr.dataset.id); else S.excludePoints.add(tr.dataset.id);
    rerun();
  });

  /** A click on empty space in the morphospace: the theoretical shape at that position. */
  function pickEmptySpace(el, e) {
    const svg = el.querySelector('svg');
    const group = svg && svg.querySelector('[data-map]');
    if (!group) return;
    const box = svg.getBoundingClientRect(), k = svg.viewBox.baseVal.width / box.width;
    const at = PL.pixelToData(group.getAttribute('data-map'), (e.clientX - box.left) * k, (e.clientY - box.top) * k);
    if (!at) return;
    const scores = new Array(S.res.pca.values.length).fill(0);
    scores[S.pcX] = at[0];
    if (S.pcY !== S.pcX) scores[S.pcY] = at[1];
    const signed = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`;
    addPick({ virtual: true, scores, label: `Theoretical: PC${S.pcX + 1} ${signed(at[0])}, PC${S.pcY + 1} ${signed(at[1])}` });
    render();
  }

  /* ---------- specimen marker popup ---------- */
  function drawStylePop() {
    const key = S.styleKey, over = S.styles[key] || {}, th = theme();
    const options = colourOptions();
    const specimen = S.dataset.specimens.find(s => s.key === key);
    const now = PL.resolveStyles([key], specimen ? currentGroups(options, [specimen]) : undefined, S.styles)[0];
    $('popKey').textContent = key;
    $('popColours').innerHTML = th.series.map((c, i) => `<button type="button" data-c="${i}" class="${now.colour === i ? 'on' : ''}" aria-label="Colour ${i + 1}"><i style="background:${c}"></i></button>`).join('');
    $('popMarkers').innerHTML = PL.MARKER_NAMES.map((name, i) => `<button type="button" data-m="${i}" class="${now.marker === i ? 'on' : ''}" aria-label="${name}" title="${name}">${PL.markerIcon({ colour: now.colour, marker: i }, th, 15)}</button>`).join('');
    $('popCustom').value = /^#/.test(PL.colourValue(now.colour, th)) ? PL.colourValue(now.colour, th) : '#808080';
    $('bStyleReset').disabled = !S.styles[key] || !Object.keys(over).length;
    $('bStyleResetAll').disabled = !Object.keys(S.styles).length;
  }
  function openStylePop(key, anchor) {
    S.styleKey = key;
    drawStylePop();
    const pop = $('stylePop');
    pop.hidden = false;
    const a = anchor.getBoundingClientRect(), p = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(a.right + 6, window.innerWidth - p.width - 8))}px`;
    pop.style.top = `${Math.max(8, Math.min(a.top - 6, window.innerHeight - p.height - 8))}px`;
    const first = $('popMarkers').querySelector('button.on') || $('popMarkers').querySelector('button');
    if (first) first.focus();
  }
  function closeStylePop() {
    S.styleKey = null;
    $('stylePop').hidden = true;
  }
  function restyle(next) {
    S.styles = next;
    writeStyles();
    render();
    if (S.styleKey) drawStylePop();
  }
  const setStyle = patch => restyle(Object.assign({}, S.styles, { [S.styleKey]: Object.assign({}, S.styles[S.styleKey], patch) }));
  on($('popColours'), 'click', e => { const b = e.target.closest('[data-c]'); if (b) setStyle({ colour: Number(b.dataset.c) }); });
  on($('popMarkers'), 'click', e => { const b = e.target.closest('[data-m]'); if (b) setStyle({ marker: Number(b.dataset.m) }); });
  on($('popCustom'), 'input', e => setStyle({ colour: e.target.value }));
  on($('bStyleReset'), 'click', () => { const next = Object.assign({}, S.styles); delete next[S.styleKey]; restyle(next); });
  on($('bStyleResetAll'), 'click', () => restyle({}));
  on(window, 'pointerdown', e => { if (S.styleKey && !e.target.closest('#stylePop') && !e.target.closest('.mk')) closeStylePop(); });
  on(window, 'keydown', e => {
    if (e.key !== 'Escape' || !S.styleKey) return;
    const key = S.styleKey;
    closeStylePop();
    const row = [...document.querySelectorAll('#tblSpecimens tr[data-key]')].find(tr => tr.dataset.key === key);
    if (row) row.querySelector('.mk').focus();
  });

  // Hover and click on specimens, by delegation because the figures are redrawn often.
  const tipEl = $('tip');
  for (const id of ['plotScatter', 'plotSize']) {
    const el = $(id);
    on(el, 'click', e => {
      const g = e.target.closest('.pt');
      if (g) { togglePick(S.res.prep.specimens[Number(g.dataset.i)].key); return; }
      if (id === 'plotScatter') pickEmptySpace(el, e);
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
  for (const id of ['plotSuper', 'plotShape', 'plotPicked']) {
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
