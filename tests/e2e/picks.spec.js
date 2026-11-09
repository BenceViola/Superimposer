'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { openApp, loadExample, loadRaw, upload, tps3d, fit, expect } = require('./helpers.js');

const pick = (page, i) => page.locator('#plotScatter .pt').nth(i).dispatchEvent('click');
const morpho = async page => { await loadExample(page); await page.click('[data-tab="morpho"]'); };
const P = 10; // fixed landmarks in the example

/** Screen position inside the plot, well away from every specimen. */
const emptySpot = page => page.evaluate(() => {
  const svg = document.querySelector('#plotScatter svg');
  const r = svg.getBoundingClientRect();
  const dots = [...svg.querySelectorAll('.hit')].map(c => c.getBoundingClientRect()).map(b => [b.x + b.width / 2, b.y + b.height / 2]);
  for (let y = r.top + 50; y < r.bottom - 70; y += 8) {
    for (let x = r.left + 90; x < r.right - 40; x += 8) {
      if (dots.every(([a, b]) => Math.hypot(a - x, b - y) > 40)) return [x, y];
    }
  }
  return null;
});

test('clicking a specimen shows its landmark configuration', async ({ page }) => {
  const errors = await openApp(page);
  await morpho(page);
  await pick(page, 2);
  await expect(page.locator('#plotPicked .target')).toHaveCount(P);
  await expect(page.locator('#plotPicked .mean')).toHaveCount(P);
  await expect(page.locator('#pickChips li')).toHaveCount(1);
  await expect(page.locator('#pickChips')).toContainText('EX_');
  expect(errors).toEqual([]);
});

test('several specimens sit side by side; a fifth replaces the oldest', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  for (let i = 0; i < 4; i++) await pick(page, i);
  await expect(page.locator('#plotPicked .target')).toHaveCount(4 * P);
  const first = await page.locator('#pickChips li').first().textContent();
  await pick(page, 5);
  await expect(page.locator('#pickChips li')).toHaveCount(4);
  expect(await page.locator('#pickChips li').first().textContent()).not.toBe(first);
});

test('clicking a selected specimen again takes it away', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  await pick(page, 2);
  await pick(page, 2);
  await expect(page.locator('#pickChips li')).toHaveCount(0);
});

test('a specimen can be removed by its × and all by Clear', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  await pick(page, 1);
  await pick(page, 2);
  await page.locator('#pickChips button').first().click();
  await expect(page.locator('#pickChips li')).toHaveCount(1);
  await page.click('#bClearPicks');
  await expect(page.locator('#pickChips li')).toHaveCount(0);
  await expect(page.locator('#plotPicked svg')).toHaveCount(0);
});

test('the selected specimens are marked in the morphospace and the superimposition', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  await pick(page, 1);
  await pick(page, 2);
  await expect(page.locator('#plotScatter .pt-label')).not.toHaveCount(0);
  await page.click('[data-tab="super"]');
  await expect(page.locator('#plotSuper .selected')).toHaveCount(2 * P);
});

test('picking from the specimen table works too', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  await page.locator('#tblSpecimens td.id').nth(3).click();
  await expect(page.locator('#plotPicked .target')).toHaveCount(P);
  await expect(page.locator('#tblSpecimens tr.sel')).toHaveCount(1);
});

test('a click on empty space shows the theoretical shape there', async ({ page }) => {
  const errors = await openApp(page);
  await morpho(page);
  const [x, y] = await emptySpot(page);
  await page.mouse.click(x, y);
  await expect(page.locator('#plotScatter .virtual')).toHaveCount(1);
  await expect(page.locator('#pickChips')).toContainText('Theoretical');
  await expect(page.locator('#plotPicked .target')).toHaveCount(P);
  expect(errors).toEqual([]);
});

test('the theoretical shape is the one the PCA gives at that position', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  const [x, y] = await emptySpot(page);
  await page.mouse.click(x, y);
  const check = await page.evaluate(() => {
    const { S } = window.__sup, v = S.picked[0];
    const others = v.scores.filter((_, i) => i !== S.pcX && i !== S.pcY);
    return { others, x: v.scores[S.pcX], y: v.scores[S.pcY], n: v.scores.length, q: S.res.pca.values.length };
  });
  expect(check.n).toBe(check.q);
  expect(check.others.every(v => v === 0)).toBe(true);
  expect(check.x !== 0 || check.y !== 0).toBe(true);
});

test('a theoretical shape goes away when the analysis changes', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  const [x, y] = await emptySpot(page);
  await page.mouse.click(x, y);
  await page.check('#chkSemi');
  await expect(page.locator('#pickChips li')).toHaveCount(0);
});

test('one can go back to the shape along an axis', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  await pick(page, 2);
  await expect(page.locator('#shapeAxis')).toBeHidden();
  await page.click('[data-shape="axis"]');
  await expect(page.locator('#plotShape .target').first()).toBeVisible();
  await expect(page.locator('#shapePicked')).toBeHidden();
});

test('selected specimens download as one figure', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  await pick(page, 1);
  await pick(page, 2);
  const [svg] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="svg"][data-plot="picked"]')]);
  expect(svg.suggestedFilename()).toBe('selected-specimens.svg');
  const body = fs.readFileSync(await svg.path(), 'utf8');
  expect((body.match(/class="target"/g) || []).length).toBe(2 * P);
});

test('links show on the selected specimens', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  await page.click('#bOutline');
  await pick(page, 1);
  await expect(page.locator('#plotPicked .wire-target')).toHaveCount(1);
});

/* ---------- deformation grids ---------- */
test('the shape along an axis can be shown as a deformation grid', async ({ page }) => {
  const errors = await openApp(page);
  await morpho(page);
  await page.selectOption('#selShapeStyle', 'grid');
  await expect(page.locator('#plotShape .tps-grid')).toHaveCount(1);
  await expect(page.locator('#plotShape .arrow')).toHaveCount(0);
  const before = await page.locator('#plotShape svg').innerHTML();
  await page.locator('#rngShape').fill('-1');
  await expect.poll(() => page.locator('#plotShape svg').innerHTML()).not.toBe(before);
  expect(errors).toEqual([]);
});

test('selected specimens can use the grid too', async ({ page }) => {
  await openApp(page);
  await morpho(page);
  await page.selectOption('#selShapeStyle', 'grid');
  await pick(page, 1);
  await pick(page, 2);
  await expect(page.locator('#plotPicked .tps-grid')).toHaveCount(2);
});

test('3D data have no grid option, and selected specimens turn by dragging', async ({ page }) => {
  await openApp(page);
  await upload(page, 'set3.tps', tps3d());
  await fit(page);
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#shapeStyleRow')).toBeHidden();
  await pick(page, 1);
  const svg = page.locator('#plotPicked svg').first();
  await expect(svg).toBeVisible();
  const before = await svg.innerHTML();
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.locator('#plotPicked svg').first().innerHTML()).not.toBe(before);
});

/* ---------- specimen markers ---------- */
const mk = (page, n = 0) => page.locator('#tblSpecimens .mk').nth(n);

test('each specimen has a marker between its tick box and name', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  const cells = page.locator('#tblSpecimens tbody tr').first().locator('td');
  await expect(cells.nth(0).locator('input')).toHaveCount(1);
  await expect(cells.nth(1).locator('.mk svg')).toHaveCount(1);
  await expect(cells.nth(2)).toContainText('EX_01');
});

test('clicking a marker opens the popup, Escape closes it', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await mk(page).click();
  await expect(page.locator('#stylePop')).toBeVisible();
  await expect(page.locator('#popKey')).toContainText('EX_01');
  await expect(page.locator('#popColours button')).toHaveCount(8);
  await expect(page.locator('#popMarkers button')).toHaveCount(8);
  await page.keyboard.press('Escape');
  await expect(page.locator('#stylePop')).toBeHidden();
});

test('a click elsewhere closes the popup', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await mk(page).click();
  await page.mouse.click(900, 500);
  await expect(page.locator('#stylePop')).toBeHidden();
});

test('a chosen marker appears in the table, the Procrustes view and the PCA', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await expect(mk(page).locator('polygon')).toHaveCount(0);
  await mk(page).click();
  await page.locator('#popMarkers button').nth(3).click();
  await expect(mk(page).locator('polygon')).toHaveCount(1);
  const shaped = page.locator('#plotSuper path.cloud[fill-opacity]');
  await expect(shaped).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#plotScatter .pt polygon')).toHaveCount(1);
});

test('a chosen colour appears in the plots', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const clouds = () => page.locator('#plotSuper path.cloud').count();
  expect(await clouds()).toBe(1);
  await mk(page).click();
  await page.locator('#popColours button').nth(1).click();
  await expect.poll(clouds).toBe(2);
});

test('a custom colour can be picked', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await mk(page).click();
  await page.locator('#popCustom').fill('#123456');
  await expect.poll(() => page.locator('#plotSuper svg').innerHTML()).toContain('#123456');
});

test('the raw view uses the chosen marker too', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await mk(page).click();
  await page.locator('#popMarkers button').nth(2).click();
  await expect(page.locator('#plotSuper path.cloud[fill-opacity]')).toHaveCount(1);
});

test('markers follow the groups until overridden, and go back on request', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.selectOption('#selColour', 'csv:form');
  await expect(page.locator('#tblSpecimens .mk polygon').first()).toBeAttached();
  const shapes = async () => page.evaluate(() => [...document.querySelectorAll('#tblSpecimens .mk svg')].map(s => s.querySelector('polygon') ? 'p' : 'c').join(''));
  expect(new Set(await shapes()).size).toBe(2);
  const n = await page.locator('#tblSpecimens .mk polygon').count();
  await page.selectOption('#selColour', '');
  await expect(page.locator('#tblSpecimens .mk polygon')).toHaveCount(0);
  await page.selectOption('#selColour', 'csv:form');
  await expect(page.locator('#tblSpecimens .mk polygon')).toHaveCount(n);
  const circleRow = (await shapes()).indexOf('c');
  await mk(page, circleRow).click();
  await page.locator('#popMarkers button').nth(5).click();
  await expect(page.locator('#tblSpecimens .mk polygon')).toHaveCount(n + 1);
  await page.click('#bStyleReset');
  await expect(page.locator('#tblSpecimens .mk polygon')).toHaveCount(n);
});

test('an override stays when the grouping changes', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await mk(page).click();
  await page.locator('#popMarkers button').nth(5).click();
  await page.keyboard.press('Escape');
  await page.selectOption('#selColour', 'csv:form');
  await expect(mk(page).locator('polygon')).toHaveCount(1);
  await page.selectOption('#selColour', '');
  await expect(mk(page).locator('polygon')).toHaveCount(1);
});

test('Reset all clears every override', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  for (const n of [0, 1]) {
    await mk(page, n).click();
    await page.locator('#popMarkers button').nth(2).click();
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('#tblSpecimens .mk polygon')).toHaveCount(2);
  await mk(page).click();
  await page.click('#bStyleResetAll');
  await expect(page.locator('#tblSpecimens .mk polygon')).toHaveCount(0);
});

test('choices are remembered for the same landmark set', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await mk(page).click();
  await page.locator('#popMarkers button').nth(4).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await loadExample(page);
  await expect(mk(page).locator('polygon')).toHaveCount(1);
});

test('exported figures use the chosen style', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await mk(page).click();
  await page.locator('#popCustom').fill('#123456');
  await page.keyboard.press('Escape');
  const [svg] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="svg"][data-plot="super"]')]);
  expect(fs.readFileSync(await svg.path(), 'utf8')).toContain('#123456');
});
