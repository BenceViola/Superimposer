'use strict';
const { test } = require('@playwright/test');
const { openApp, loadExample, loadRaw, upload, tps2d, tps3d, expect } = require('./helpers.js');

test('an error in the analysis is reported, and the app keeps working', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/index.html');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await page.evaluate(() => {
    const real = window.SupGM.analyse;
    window.__breakOnce = true;
    window.SupGM.analyse = (...a) => { if (window.__breakOnce) { window.__breakOnce = false; throw new Error('boom'); } return real(...a); };
  });
  await upload(page, 'set.tps', tps2d());
  await expect(page.locator('#message')).toContainText('went wrong');
  await expect(page.locator('#message')).toContainText('boom');
  await page.selectOption('#selMissing', 'points');
  await expect(page.locator('#message')).toBeHidden();
  await expect(page.locator('#plotSuper svg')).toBeVisible();
  expect(errors).toEqual([]);
});

test('corrupted saved settings are ignored', async ({ page }) => {
  const errors = await openApp(page);
  await loadExample(page);
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.includes(':links:')) localStorage.setItem(k, '{"not":"a list"}');
      if (k.includes(':styles:')) localStorage.setItem(k, '[1,2,3]');
      if (k.includes(':groups:')) localStorage.setItem(k, '{"columns":5}');
      if (k.includes(':pairs:')) localStorage.setItem(k, '"pairs"');
    }
    const sig = window.__sup.S.linkSig;
    localStorage.setItem(`superimposer:links:${sig}`, '{"not":"a list"}');
    localStorage.setItem(`superimposer:styles:${sig}`, '[1,2,3]');
    localStorage.setItem(`superimposer:groups:${sig}`, '{"columns":5}');
    localStorage.setItem(`superimposer:pairs:${sig}`, '"pairs"');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await page.click('#bExample');
  await expect(page.locator('#plotSuper svg')).toBeVisible();
  await page.click('[data-tab="data"]');
  await expect(page.locator('#dataTable tbody tr').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a file with unusable coordinates loads, with a note', async ({ page }) => {
  const errors = await openApp(page);
  await loadRaw(page);
  const doc = await page.evaluate(() => JSON.parse(window.SupExample.make().files[0].data));
  doc.specimen.id = 'BROKEN';
  doc.landmarks[0].position = [null, 'x'];
  await upload(page, 'broken.lmk.json', JSON.stringify(doc));
  await expect(page.locator('#issues')).toContainText('broken.lmk.json');
  expect(errors).toEqual([]);
});

/* ---------- not redoing work ---------- */
const countAnalyses = page => page.evaluate(() => {
  const real = window.SupGM.analyse;
  window.__analyses = 0;
  window.SupGM.analyse = (...a) => { window.__analyses++; return real(...a); };
});

test('editing groups does not redo the analysis', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await countAnalyses(page);
  await page.click('[data-tab="data"]');
  await page.fill('#dtNewCol', 'colony');
  await page.click('#bAddCol');
  const c = page.locator('#dataTable tr[data-key="EX_01"] input.dt-cell[data-col="colony"]');
  await c.fill('Alpha');
  await c.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__sup.S.table.rows.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__analyses)).toBe(0);
});

test('…unless the imputation uses the groups as its reference', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.selectOption('#selImpute', 'tps');
  await page.selectOption('#selImputeRef', 'form');
  await countAnalyses(page);
  await page.click('[data-tab="data"]');
  const c = page.locator('#dataTable tr[data-key="EX_01"] input.dt-cell[data-col="form"]');
  await c.fill('stout');
  await c.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__analyses)).toBe(1);
});

test('changing a display option does not redo the analysis', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await countAnalyses(page);
  await page.uncheck('#chkLabels');
  await page.selectOption('#selColour', 'csv:form');
  expect(await page.evaluate(() => window.__analyses)).toBe(0);
  await page.selectOption('#selMissing', 'points');
  expect(await page.evaluate(() => window.__analyses)).toBe(1);
});

/* ---------- large tables ---------- */
const big = () => tps2d(600, 5);
const openBig = async page => {
  await upload(page, 'big.tps', big());
  await page.click('[data-tab="data"]');
  await expect(page.locator('#dataTable tbody tr[data-key]').first()).toBeVisible();
};
const rendered = page => page.locator('#dataTable tbody tr[data-key]').count();

test('a large table draws only the rows in view', async ({ page }) => {
  const errors = await openApp(page);
  await openBig(page);
  expect(await rendered(page)).toBeLessThan(150);
  await expect(page.locator('#dtCount')).toContainText('600 of 600 records');
  await page.locator('.dt-wrap').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('#dataTable tr[data-key="T599"]')).toBeVisible();
  expect(await rendered(page)).toBeLessThan(150);
  expect(errors).toEqual([]);
});

test('the scroll height matches all the rows', async ({ page }) => {
  await openApp(page);
  await openBig(page);
  const h = await page.locator('#dataTable').evaluate(el => el.getBoundingClientRect().height);
  const row = await page.locator('#dataTable tbody tr[data-key]').first().evaluate(el => el.getBoundingClientRect().height);
  expect(Math.abs(h - row * 601)).toBeLessThan(row * 3);
});

test('arrow keys move past the rows drawn', async ({ page }) => {
  await openApp(page);
  await openBig(page);
  await page.locator('#dataTable tr[data-key="T0"] .dt-select').focus();
  for (let i = 0; i < 150; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('#dataTable tr[data-key="T150"] .dt-select')).toBeFocused();
});

test('select all, Shift-click and Ctrl-A cover rows that are not drawn', async ({ page }) => {
  await openApp(page);
  await openBig(page);
  await page.locator('#dtSelectAll').check();
  await expect(page.locator('#dtCount')).toContainText('600 selected');
  await page.click('#bClearSel');
  await page.locator('#dataTable tr[data-key="T1"] td.f3').click();
  await page.locator('.dt-wrap').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.locator('#dataTable tr[data-key="T598"] td.f3').click({ modifiers: ['Shift'] });
  await expect(page.locator('#dtCount')).toContainText('598 selected');
});

test('selecting a row does not redraw the table', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('[data-tab="data"]');
  await page.locator('#dataTable tr[data-key="EX_05"]').evaluate(el => { el.__marker = 1; });
  await page.locator('#dataTable tr[data-key="EX_03"] td.f3').click();
  await page.locator('#dataTable tr[data-key="EX_06"] td.f3').click({ modifiers: ['Shift'] });
  await expect(page.locator('#dataTable tr[data-key="EX_05"]')).toHaveClass(/ticked/);
  await expect(page.locator('#dataTable tr[data-key="EX_05"] .dt-select')).toBeChecked();
  expect(await page.locator('#dataTable tr[data-key="EX_05"]').evaluate(el => el.__marker)).toBe(1);
  await expect(page.locator('#dtCount')).toContainText('4 selected');
});

/* ---------- turning 3D figures ---------- */
test('the full figure is back after turning a 3D view', async ({ page }) => {
  await openApp(page);
  await upload(page, 'set3.tps', tps3d(40, 30));
  const dots = () => page.locator('#plotSuper path.cloud').evaluate(p => (p.getAttribute('d').match(/h0/g) || []).length);
  expect(await dots()).toBe(40 * 30);
  const box = await page.locator('#plotSuper svg').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(dots).toBe(40 * 30);
});

test('acting straight after typing a filter uses the filtered rows', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('[data-tab="data"]');
  await page.fill('#dtFilter', 'slender');
  await page.locator('#dtSelectAll').check();
  const n = await page.evaluate(() => window.__sup.S.res.prep.specimens.length);
  const selected = await page.evaluate(() => window.__sup.S.dtSelected.size);
  expect(selected).toBeGreaterThan(0);
  expect(selected).toBeLessThan(n);
});
