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
    const head = ['key', 'specimen_id', 'replicate', 'operator', 'source_file', 'n_replicates', 'flipped', 'centroid_size', 'units', 'procrustes_distance', ...cols, ...pcNames(res)];
    const rows = res.prep.specimens.map((s, i) => [
      s.key, s.id, s.replicate, s.operator, s.sourceName, s.nReplicates, s.flipped ? 'yes' : 'no',
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
      `Semilandmarks: ${prep.semilandmarksUsed ? `${prep.semilandmarksUsed} included, NOT slid` : 'left out'}.`,
      `Replicates: ${opts.replicates === 'average' ? 'averaged per specimen and operator' : 'all kept as separate records'}.`,
      `Estimated landmarks used: ${prep.estimated}.`,
    ];
    const flipped = prep.specimens.filter(s => s.flipped).map(s => s.key);
    if (flipped.length) L.push(`Mirrored before analysis: ${flipped.join(', ')}.`);
    if (prep.dropped.specimens.length) { L.push('', 'Specimens left out:'); prep.dropped.specimens.forEach(d => L.push(`  ${d.key}: ${d.reason}`)); }
    if (prep.dropped.points.length) { L.push('', 'Points left out:'); prep.dropped.points.forEach(d => L.push(`  ${d.id}: ${d.reason}`)); }
    if (dataset.excluded.length) { L.push('', 'Files or specimens not used:'); dataset.excluded.forEach(d => L.push(`  ${d.id} (${d.sourceName}): ${d.reason}`)); }
    return L.join('\n') + '\n';
  }

  function bundle(res, dataset, opts, groups) {
    return [
      { name: 'scores.csv', data: scoresCSV(res, groups) },
      { name: 'aligned-coordinates.csv', data: alignedCSV(res) },
      { name: 'consensus.csv', data: consensusCSV(res) },
      { name: 'eigenvalues.csv', data: eigenCSV(res) },
      { name: 'loadings.csv', data: loadingsCSV(res) },
      { name: 'settings.txt', data: settingsText(res, opts, dataset) },
    ];
  }

  return { scoresCSV, alignedCSV, consensusCSV, eigenCSV, loadingsCSV, repeatabilityCSV, settingsText, bundle };
}));
