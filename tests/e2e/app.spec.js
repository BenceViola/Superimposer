'use strict';
const { test } = require('@playwright/test');
const { openApp, loadExample, upload, tps2d, tps3d, expect } = require('./helpers.js');

test('opens with an invitation to add data', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('#empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the example data give every figure', async ({ page }) => {
  const errors = await openApp(page);
  await loadExample(page);
  await expect(page.locator('#plotSuper .consensus').first()).toBeVisible();
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#plotScatter .pt').first()).toBeVisible();
  await expect(page.locator('#plotScree .bar').first()).toBeVisible();
  await expect(page.locator('#plotShape .arrow').first()).toBeVisible();
  await page.click('[data-tab="size"]');
  await expect(page.locator('#plotSize .pt').first()).toBeVisible();
  await page.click('[data-tab="repeat"]');
  await expect(page.locator('#plotRepeat .bar').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a mirrored specimen is reported and can be flipped', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await expect(page.locator('#mirrorBanner')).toBeVisible();
  await page.click('#bFlipAll');
  await expect(page.locator('#mirrorBanner')).toBeHidden();
  await expect(page.locator('#flippedNote')).toBeVisible();
  await page.click('#bUnflip');
  await expect(page.locator('#mirrorBanner')).toBeVisible();
});

test('TPS files open, 2D', async ({ page }) => {
  await openApp(page);
  await upload(page, 'set.tps', tps2d());
  await expect(page.locator('#plotSuper .consensus')).toHaveCount(5);
  await expect(page.locator('#summary')).toContainText('6 specimens');
  await expect(page.locator('#summary')).toContainText('2D');
});

test('TPS files open, 3D, and the view turns by dragging', async ({ page }) => {
  await openApp(page);
  await upload(page, 'set3.tps', tps3d());
  await expect(page.locator('#summary')).toContainText('3D');
  const svg = page.locator('#plotSuper svg');
  const before = await svg.innerHTML();
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.locator('#plotSuper svg').innerHTML()).not.toBe(before);
});

test('mixing TPS with landmark-json waits for confirmation', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const n = await page.evaluate(() => window.__sup.S.dataset.specimens.length);
  const p = await page.evaluate(() => window.__sup.S.dataset.rows.length);
  await upload(page, 'extra.tps', tps2d(2, p));
  await expect(page.locator('#tpsBanner')).toBeVisible();
  expect(await page.evaluate(() => window.__sup.S.dataset.specimens.length)).toBe(n);
  await page.click('#bConfirmTps');
  await expect(page.locator('#tpsBanner')).toBeHidden();
  expect(await page.evaluate(() => window.__sup.S.dataset.specimens.length)).toBe(n + 2);
});

test('a bad file is reported and the app carries on', async ({ page }) => {
  const errors = await openApp(page);
  await upload(page, 'bad.tps', 'LM=3\n1 1\nID=A\n');
  await expect(page.locator('#issues')).toContainText('bad.tps');
  expect(errors).toEqual([]);
});

test('too little data gives a message instead of figures', async ({ page }) => {
  await openApp(page);
  await upload(page, 'two.tps', tps2d(2));
  await expect(page.locator('#message')).toContainText('three specimens');
});

test('a group table colours the plots', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await upload(page, 'groups.csv', await page.evaluate(() => window.SupExample.make().groups), '#fGroups');
  await page.selectOption('#selColour', 'csv:form');
  await expect(page.locator('#plotSuper .legend')).toContainText('slender');
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#plotScatter .legend')).toContainText('deep');
});

test('example data come with their groups', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await expect(page.locator('#selColour option[value="csv:form"]')).toHaveCount(1);
});

test('settings change the analysis', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const used = () => page.evaluate(() => window.__sup.S.res.prep.rows.length);
  const count = () => page.evaluate(() => window.__sup.S.res.prep.specimens.length);
  const p = await used(), n = await count();
  await page.check('#chkSemi');
  expect(await used()).toBeGreaterThan(p);
  await expect(page.locator('#issues')).toContainText('not slid');
  await page.uncheck('#chkSemi');
  await page.selectOption('#selReplicates', 'average');
  expect(await count()).toBeLessThan(n);
});

test('leaving out a specimen or a landmark by hand', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const n = await page.evaluate(() => window.__sup.S.res.prep.specimens.length);
  const p = await page.evaluate(() => window.__sup.S.res.prep.rows.length);
  await page.locator('#tblSpecimens input[type=checkbox]').first().uncheck();
  expect(await page.evaluate(() => window.__sup.S.res.prep.specimens.length)).toBe(n - 1);
  await page.locator('#tblPoints input[type=checkbox]').first().uncheck();
  expect(await page.evaluate(() => window.__sup.S.res.prep.rows.length)).toBe(p - 1);
});

test('a click in the morphospace selects the specimen', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('[data-tab="morpho"]');
  await page.locator('#plotScatter .pt').nth(3).click();
  await expect(page.locator('#selectionNote')).toContainText('EX_');
  await expect(page.locator('#plotScatter .pt-label')).not.toHaveCount(0);
  await page.click('[data-tab="super"]');
  await expect(page.locator('#plotSuper .selected')).not.toHaveCount(0);
});

test('the shape slider moves along the chosen PC', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('[data-tab="morpho"]');
  const before = await page.locator('#plotShape svg').innerHTML();
  await page.locator('#rngShape').fill('-1');
  await expect.poll(() => page.locator('#plotShape svg').innerHTML()).not.toBe(before);
  await page.selectOption('#selShapePc', '1');
  await expect(page.locator('#plotShape svg')).toContainText('PC2');
});

test('PC axes can be chosen', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('[data-tab="morpho"]');
  await page.selectOption('#selPcY', '2');
  await expect(page.locator('#plotScatter svg')).toContainText('PC3');
});

test('results download as a zip with every table', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  expect(dl.suggestedFilename()).toBe('superimposer-results.zip');
  const fs = require('node:fs');
  const text = fs.readFileSync(await dl.path()).toString('latin1');
  for (const n of ['scores.csv', 'aligned-coordinates.csv', 'consensus.csv', 'eigenvalues.csv', 'loadings.csv', 'settings.txt', 'repeatability.csv']) expect(text).toContain(n);
});

test('figures download as SVG and PNG', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const [svg] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="svg"][data-plot="super"]')]);
  expect(svg.suggestedFilename()).toBe('superimposition.svg');
  const fs = require('node:fs');
  const body = fs.readFileSync(await svg.path(), 'utf8');
  expect(body).toContain('<svg');
  expect(body).toContain('#F7F9FB');
  expect(body).not.toContain('class="hit"');
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="png"][data-plot="super"]')]);
  expect(png.suggestedFilename()).toBe('superimposition.png');
  expect(fs.readFileSync(await png.path()).subarray(1, 4).toString()).toBe('PNG');
});

test('clear starts over', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bClear');
  await expect(page.locator('#empty')).toBeVisible();
});

test('it works at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openApp(page);
  await loadExample(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
