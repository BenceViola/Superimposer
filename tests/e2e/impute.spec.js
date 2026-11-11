'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { openApp, loadExample, loadRaw, upload, expect } = require('./helpers.js');

const analysed = page => page.evaluate(() => window.__sup.S.res.prep.specimens.length);
const choose = (page, method) => page.selectOption('#selImpute', method);

test('the example has gaps; imputing brings the specimens back, marked', async ({ page }) => {
  const errors = await openApp(page);
  await loadExample(page);
  await expect(page.locator('#issues')).toContainText('EX_14');
  const before = await analysed(page);
  await choose(page, 'tps');
  expect(await analysed(page)).toBe(before + 3);
  await expect(page.locator('#plotSuper .imputed')).toHaveCount(4);
  await expect(page.locator('#plotSuper .legend')).toContainText('Imputed landmark');
  await expect(page.locator('#issues')).toContainText('4 landmarks imputed in 3 specimens');
  expect(errors).toEqual([]);
});

test('the controls appear only when imputing', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  for (const id of ['#selImputeRef', '#selImputeMax', '#chkNotDone', '#chkMirrorFirst']) await expect(page.locator(id)).toBeHidden();
  await choose(page, 'tps');
  for (const id of ['#selImputeRef', '#selImputeMax', '#chkNotDone', '#chkMirrorFirst']) await expect(page.locator(id)).toBeVisible();
  await choose(page, 'mirror');
  await expect(page.locator('#selImputeRef')).toBeHidden();
  await expect(page.locator('#chkMirrorFirst')).toBeHidden();
  await expect(page.locator('#pairsInfo')).toBeVisible();
});

test('the raw view rings the imputed landmarks too', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await choose(page, 'mean');
  await expect(page.locator('#plotSuper .imputed')).toHaveCount(4);
});

test('the methods give different results', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const scores = () => page.evaluate(() => {
    const { S } = window.__sup, i = S.res.prep.specimens.findIndex(s => s.key === 'EX_17');
    return S.res.pca.scores[i].slice(0, 2);
  });
  await choose(page, 'mean');
  const a = await scores();
  await choose(page, 'reg');
  const b = await scores();
  expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeGreaterThan(1e-4);
});

test('the limit per specimen leaves a specimen out, with the reason', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await choose(page, 'tps');
  await page.selectOption('#selImputeMax', '1');
  await expect(page.locator('#issues')).toContainText('limit of 1');
  await expect(page.locator('#plotSuper .imputed')).toHaveCount(2);
});

test('the reference can be the specimen’s own group', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await choose(page, 'tps');
  await page.selectOption('#selImputeRef', 'form');
  await expect(page.locator('#plotSuper .imputed')).toHaveCount(4);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  const text = fs.readFileSync(await dl.path()).toString('latin1');
  expect(text).toContain('imputed.csv');
  expect(text).toContain('reference: complete specimens of the same form');
});

test('mirroring without pairs says so; loading pairs is offered', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await choose(page, 'mirror');
  await expect(page.locator('#pairsInfo')).toContainText('No pairs');
  await expect(page.locator('#issues')).toContainText('no landmark pairs');
  await expect(page.locator('#bLoadPairs')).toBeVisible();
});

/** Symmetric 3D specimens with bilateral pairs in the template; G misses one paired landmark. */
function symmetricFiles() {
  const SYM = [[0, 0, 0], [0, 30, 10], [0, 50, -10], [20, 10, 5], [-20, 10, 5], [30, 40, 10], [-30, 40, 10]];
  const ids = SYM.map((_, i) => `LM0${i + 1}`);
  const template = {
    id: 'skull', name: 'Skull', version: '1.0', dimensions: 3,
    landmarks: ids.map((id, i) => ({ id, name: id, ...(i === 3 ? { bilateral_pair: 'LM05' } : i === 4 ? { bilateral_pair: 'LM04' } : i === 5 ? { bilateral_pair: 'LM07' } : i === 6 ? { bilateral_pair: 'LM06' } : {}) })),
  };
  return ['A', 'B', 'C', 'D', 'G'].map((id, n) => {
    const pts = SYM.map(([x, y, z]) => [x * (1 + 0.03 * n), y + n, z - 0.5 * n]);
    const landmarks = pts.map((p, i) => (id === 'G' && i === 6
      ? { id: ids[i], template_id: ids[i], status: 'missing', position: null }
      : { id: ids[i], template_id: ids[i], status: 'placed', position: p }));
    const doc = { format: 'landmark-json', version: '0.3.0', specimen: { id, mesh: { file: `${id}.ply`, sha256: id, units: 'mm', vertex_count: 1, face_count: 1 } }, template, landmarks };
    return { name: `${id}.lmk.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) };
  });
}

test('pairs from the template are used for mirroring', async ({ page }) => {
  const errors = await openApp(page);
  await page.setInputFiles('#fData', symmetricFiles());
  await expect(page.locator('#plotSuper svg')).toBeVisible();
  expect(await analysed(page)).toBe(4);
  await choose(page, 'mirror');
  await expect(page.locator('#pairsInfo')).toContainText('2 pairs from the template');
  expect(await analysed(page)).toBe(5);
  await expect(page.locator('#plotSuper .imputed')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('pairs can be loaded from a file and removed again', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await choose(page, 'mirror');
  await upload(page, 'pairs.csv', 'LM02,LM09\nLM03,LM08\n', '#fPairs');
  await expect(page.locator('#pairsInfo')).toContainText('2 pairs loaded');
  await page.click('#bClearPairs');
  await expect(page.locator('#pairsInfo')).toContainText('No pairs');
});

test('the morphospace rings specimens with imputed landmarks', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await choose(page, 'tps');
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#plotScatter .imputed-ring')).toHaveCount(3);
  await page.locator('#plotScatter .pt').nth(await page.evaluate(() => window.__sup.S.res.prep.specimens.findIndex(s => s.key === 'EX_17'))).dispatchEvent('click');
  await expect(page.locator('#plotPicked .imputed')).toHaveCount(2);
});

test('the data table shows imputed values and counts them', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await choose(page, 'tps');
  await page.click('[data-tab="data"]');
  await expect(page.locator('#dataTable tr[data-key="EX_17"] td[data-c="imputed"]')).toHaveText('2');
  await page.check('#chkCoords');
  await expect(page.locator('#dataTable tr[data-key="EX_17"] td.dt-imp')).toHaveCount(4);
  await expect(page.locator('#dataTable tr[data-key="EX_17"] td.dt-imp').first()).toHaveAttribute('title', /thin-plate spline/);
});

test('the specimen list says which specimens were imputed', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await choose(page, 'tps');
  await expect(page.locator('#tblSpecimens tr[data-key="EX_17"]')).toContainText('2 imputed');
});
