// Result tables as text. Pure and DOM-free (UMD: window.SupExport in the browser).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupExport = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '0.1.0';
  const num = v => (Number.isFinite(v) ? String(Number(v.toPrecision(10))) : '');
  const cell = v => { const x = String(v == null ? '' : v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const table = (head, rows) => [head, ...rows].map(r => r.map(cell).join(',')).join('\n') + '\n';
  const axes = ['x', 'y', 'z'];
  const pcNames = res => res.pca.values.map((_, i) => `PC${i + 1}`);

  function scoresCSV(res, groups) {
    const cols = groups ? groups.columns : [];
    const head = ['key', 'specimen_id', 'replicate', 'operator', 'source_file', 'n_replicates', 'flipped', 'n_imputed', 'centroid_size', 'units', 'procrustes_distance', ...cols, ...pcNames(res)];
    const rows = res.prep.specimens.map((s, i) => [
      s.key, s.id, s.replicate, s.operator, s.sourceName, s.nReplicates, s.flipped ? 'yes' : 'no', (res.prep.imputed && res.prep.imputed[i] ? res.prep.imputed[i].length : 0),
      num(res.gpa.csize[i]), s.units, num(res.gpa.procD[i]),
      ...cols.map(c => (groups.values[i] && typeof groups.values[i] === 'object' ? groups.values[i][c] : groups.values[i]) || ''),
      ...res.pca.scores[i].map(num),
    ]);
    return table(head, rows);
  }

  function alignedCSV(res) {
    const k = res.prep.dim;
    const head = ['key', ...res.prep.rows.flatMap(r => axes.slice(0, k).map(a => `${r.id}_${a}`))];
    return table(head, res.prep.specimens.map((s, i) => [s.key, ...res.gpa.tangent[i].flat().map(num)]));
  }

  function consensusCSV(res) {
    const k = res.prep.dim;
    return table(['point', 'label', ...axes.slice(0, k)], res.prep.rows.map((r, i) => [r.id, r.label, ...res.gpa.consensus[i].map(num)]));
  }

  function eigenCSV(res) {
    let cum = 0;
    return table(['pc', 'eigenvalue', 'proportion', 'cumulative'], res.pca.values.map((v, i) => {
      cum += res.pca.proportion[i];
      return [`PC${i + 1}`, num(v), num(res.pca.proportion[i]), num(cum)];
    }));
  }

  function loadingsCSV(res) {
    const k = res.prep.dim;
    const names = res.prep.rows.flatMap(r => axes.slice(0, k).map(a => `${r.id}_${a}`));
    return table(['coordinate', ...pcNames(res)], names.map((n, j) => [n, ...res.pca.loadings.map(l => num(l[j]))]));
  }

  function repeatabilityCSV(rep) {
    return table(['id', 'name', 'specimens', 'pairs', 'mean', 'max', 'units', 'flagged'],
      rep.rows.map(r => [r.id, r.name, r.specimens, r.pairs, r.mean == null ? '' : num(r.mean), r.max == null ? '' : num(r.max), rep.units, r.flag ? 'yes' : 'no']));
  }

  function semilandmarkLine(res) {
    const { prep } = res, g = res.gpa;
    if (!prep.semilandmarksUsed) return `Semilandmarks: ${prep.semilandmarksAvailable ? 'left out' : 'none'}.`;
    if (g.slideIterations) {
      const how = g.slide === 'procd' ? "Procrustes distance (as geomorph's gpagen with ProcD = TRUE)" : "bending energy (as geomorph's gpagen with ProcD = FALSE)";
      const fixedOnes = prep.semilandmarksUsed - g.sliders.length;
      return `Semilandmarks: ${g.sliders.length} slid by ${how}, ${g.slideIterations} rounds (geomorph's count), sliders in sliders.csv.`
        + (fixedOnes ? ` ${fixedOnes} other semilandmark${fixedOnes === 1 ? '' : 's'} (curve ends) treated as fixed.` : '')
        + (prep.sliderNotes.length ? ` ${prep.sliderNotes.join(' ')}` : '');
    }
    return `Semilandmarks: ${prep.semilandmarksUsed} treated as fixed landmarks (not slid).`;
  }

  function settingsText(res, opts, dataset) {
    opts = opts || {};
    const { prep } = res;
    const L = [
      `Superimposer ${VERSION}`,
      '',
      `Analysed: ${prep.specimens.length} specimens, ${prep.rows.length} points, ${prep.dim}D.`,
      `Superimposition: generalised Procrustes (full iteration), projected to tangent space, consensus on its principal axes.`,
      `PCA: on tangent coordinates, ${res.pca.values.length} components.`,
      `Coordinates: y points up; 2D landmark-json files were flipped to match TPS.`,
      `Units for centroid size: ${dataset.units}.`,
      `Missing data: ${opts.missing === 'points' ? 'landmarks with gaps left out' : 'specimens with gaps left out'}.`,
      semilandmarkLine(res),
      `Replicates: ${opts.replicates === 'average' ? 'averaged per specimen and operator' : 'all kept as separate records'}.`,
      `Estimated landmarks used: ${prep.estimated}.`,
      imputationLine(prep, opts.impute),
    ];
    if (prep.imputeNotes && prep.imputeNotes.length) { L.push('', 'Not imputed:'); prep.imputeNotes.forEach(d => L.push(`  ${d.key}: ${d.reason}`)); }
    const flipped = prep.specimens.filter(s => s.flipped).map(s => s.key);
    if (flipped.length) L.push(`Mirrored before analysis: ${flipped.join(', ')}.`);
    if (prep.dropped.specimens.length) { L.push('', 'Specimens left out:'); prep.dropped.specimens.forEach(d => L.push(`  ${d.key}: ${d.reason}`)); }
    if (prep.dropped.points.length) { L.push('', 'Points left out:'); prep.dropped.points.forEach(d => L.push(`  ${d.id}: ${d.reason}`)); }
    if (dataset.excluded.length) { L.push('', 'Files or specimens not used:'); dataset.excluded.forEach(d => L.push(`  ${d.id} (${d.sourceName}): ${d.reason}`)); }
    return L.join('\n') + '\n';
  }

  const METHOD_NAMES = { mirror: 'mirroring', tps: 'thin-plate spline', reg: 'regression', mean: 'mean substitution' };

  function imputationLine(prep, imp) {
    if (!imp || !imp.method || imp.method === 'none') return 'Imputation: none.';
    const parts = [METHOD_NAMES[imp.method] + (imp.mirrorFirst && imp.method !== 'mirror' ? ', after mirroring paired landmarks' : '')];
    if (imp.method !== 'mirror') parts.push(`reference: ${imp.groupOf ? `complete specimens of the same ${imp.groupName || 'group'}` : 'all complete specimens'}`);
    if (Number.isFinite(imp.max)) parts.push(`at most ${imp.max} per specimen`);
    if (imp.notDone) parts.push('landmarks not yet placed included');
    const n = prep.imputedCount || 0, k = (prep.imputed || []).filter(x => x.length).length;
    return `Imputation: ${parts.join('; ')}. ${n} landmark${n === 1 ? '' : 's'} imputed in ${k} specimen${k === 1 ? '' : 's'}.`;
  }

  /** Each imputed landmark, in the specimen's own coordinates (y up, scaled; a flipped specimen back as it was). */
  function imputedCSV(res) {
    const k = res.prep.dim;
    const rows = [];
    res.prep.specimens.forEach((s, i) => (res.prep.imputed[i] || []).forEach(f => {
      const c = res.prep.matrix[i][f.j];
      rows.push([s.key, res.prep.rows[f.j].id, METHOD_NAMES[f.method], ...c.map((v, d) => num(d === 0 && s.flipped ? -v : v))]);
    }));
    return table(['key', 'point', 'method', ...axes.slice(0, k)], rows);
  }

  /* ---------- groups ---------- */
  function groupSummaryCSV(stats, units) {
    return table(['group', 'n', 'mean_centroid_size', 'units', 'procrustes_variance'],
      stats.groups.map(g => [g.name, g.n, num(g.csize), units || '', g.disparity == null ? '' : num(g.disparity)]));
  }
  function groupPairsCSV(stats) {
    const rows = [], G = stats.groups;
    const opt = (m, a, b) => (m && m[a][b] != null ? num(m[a][b]) : '');
    for (let a = 0; a < G.length; a++) for (let b = a + 1; b < G.length; b++) {
      rows.push([G[a].name, G[b].name, opt(stats.distances, a, b), opt(stats.pDistance, a, b), opt(stats.disparityDiff, a, b), opt(stats.pDisparity, a, b), stats.permutations]);
    }
    return table(['group_a', 'group_b', 'procrustes_distance', 'p_distance', 'variance_difference', 'p_variance', 'permutations'], rows);
  }
  function groupMeansCSV(stats, res) {
    const k = res.prep.dim, rows = [];
    for (const g of stats.groups) g.mean.forEach((p, i) => rows.push([g.name, res.prep.rows[i].id, res.prep.rows[i].label, ...p.map(num)]));
    return table(['group', 'point', 'label', ...axes.slice(0, k)], rows);
  }
  function groupsLine(g) {
    const n = g.stats.groups.length;
    const tests = g.stats.permutations ? `${g.stats.permutations} permutations of specimens among groups (as geomorph's pairwise and morphol.disparity)` : 'no permutation tests';
    return `Groups: ${g.name} (${n} group${n === 1 ? '' : 's'}); ${tests}. Means from the shared superimposition; Procrustes variance around each group's own mean.`
      + (g.stats.unassigned ? ` ${g.stats.unassigned} specimen${g.stats.unassigned === 1 ? '' : 's'} without a group left out.` : '');
  }

  function bundle(res, dataset, opts, groups, groupRes) {
    const extra = res.prep.imputedCount ? [{ name: 'imputed.csv', data: imputedCSV(res) }] : [];
    if (groupRes && groupRes.stats && groupRes.stats.groups.length) {
      extra.push({ name: 'groups.csv', data: groupSummaryCSV(groupRes.stats, groupRes.units) },
        { name: 'group-pairs.csv', data: groupPairsCSV(groupRes.stats) },
        { name: 'group-means.csv', data: groupMeansCSV(groupRes.stats, res) });
    }
    if (res.gpa.slideIterations) extra.push({ name: 'sliders.csv', data: 'before,slide,after\n' + res.gpa.sliders.map(t => t.map(i => i + 1).join(',')).join('\n') + '\n' });
    let settings = settingsText(res, opts, dataset);
    if (groupRes && groupRes.stats && groupRes.stats.groups.length) settings += groupsLine(groupRes) + '\n';
    return [...extra,
      { name: 'scores.csv', data: scoresCSV(res, groups) },
      { name: 'aligned-coordinates.csv', data: alignedCSV(res) },
      { name: 'consensus.csv', data: consensusCSV(res) },
      { name: 'eigenvalues.csv', data: eigenCSV(res) },
      { name: 'loadings.csv', data: loadingsCSV(res) },
      { name: 'settings.txt', data: settings },
    ];
  }

  return { groupSummaryCSV, groupPairsCSV, groupMeansCSV, groupsLine, imputedCSV, METHOD_NAMES, scoresCSV, alignedCSV, consensusCSV, eigenCSV, loadingsCSV, repeatabilityCSV, settingsText, bundle };
}));
