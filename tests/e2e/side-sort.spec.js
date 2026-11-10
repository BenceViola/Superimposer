'use strict';
const { test } = require('@playwright/test');
const { openApp, loadExample, loadRaw, expect } = require('./helpers.js');

const keys = page => page.locator('#tblSpecimens tbody tr').evaluateAll(rows => rows.map(r => r.dataset.key));
const dists = page => page.locator('#tblSpecimens tbody tr td.num').evaluateAll(cells => cells.map(c => parseFloat(c.textContent)).filter(Number.isFinite));
const sortBy = (page, col) => page.click(`#tblSpecimens thead button[data-sort="${col}"]`);

test('the distance heading sorts the largest distances first, then reverses', async ({ page }) => {
  const errors = await openApp(page);
  await loadExample(page);
  await sortBy(page, 'dist');
  const down = await dists(page);
  expect(down.length).toBeGreaterThan(10);
  expect(down).toEqual([...down].sort((a, b) => b - a));
  await expect(page.locator('#tblSpecimens thead button[data-sort="dist"]')).toContainText('▼');
  expect((await keys(page))[0]).toBe('EX_07');
  await sortBy(page, 'dist');
  const up = await dists(page);
  expect(up).toEqual([...up].sort((a, b) => a - b));
  await expect(page.locator('#tblSpecimens thead button[data-sort="dist"]')).toContainText('▲');
  expect(errors).toEqual([]);
});

test('the specimen heading sorts by name, naturally, then reverses', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await sortBy(page, 'dist');
  await sortBy(page, 'key');
  const k = await keys(page);
  expect(k.slice(0, 4)).toEqual(['EX_01', 'EX_02', 'EX_02_r2', 'EX_03']);
  await expect(page.locator('#tblSpecimens thead button[data-sort="key"]')).toContainText('▲');
  await sortBy(page, 'key');
  expect((await keys(page))[0]).toBe('EX_24');
});

test('unsorted headings show that they can sort', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await expect(page.locator('#tblSpecimens thead button[data-sort="key"]')).toContainText('⇅');
  await expect(page.locator('#tblSpecimens thead button[data-sort="dist"]')).toContainText('⇅');
});

test('specimens without a distance stay at the bottom', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.locator('#tblSpecimens tr[data-key="EX_05"] input[type=checkbox]').uncheck();
  await sortBy(page, 'dist');
  expect((await keys(page)).slice(-1)).toEqual(['EX_05']);
  await sortBy(page, 'dist');
  expect((await keys(page)).slice(-1)).toEqual(['EX_05']);
});

test('the sort stays when the analysis changes', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await sortBy(page, 'dist');
  await page.locator('#tblSpecimens tbody tr').nth(3).locator('input[type=checkbox]').uncheck();
  const d = await dists(page);
  expect(d).toEqual([...d].sort((a, b) => b - a));
});

test('ticks and markers still act on the right specimen when sorted', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await sortBy(page, 'dist');
  const first = (await keys(page))[0];
  await page.locator('#tblSpecimens tbody tr').first().locator('input[type=checkbox]').uncheck();
  expect(await page.evaluate(k => window.__sup.S.excludeSpecimens.has(k), first)).toBe(true);
  await page.locator(`#tblSpecimens tr[data-key="${first}"] .mk`).click();
  await expect(page.locator('#popKey')).toContainText(first);
});

test('before the fit the distance heading explains why it can’t sort', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await expect(page.locator('#tblSpecimens thead button[data-sort="dist"]')).toHaveAttribute('title', /fit/);
  await sortBy(page, 'key');
  await sortBy(page, 'key');
  expect((await keys(page))[0]).toBe('EX_24');
});

test('sorting the list leaves the data table alone', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await sortBy(page, 'dist');
  await page.click('[data-tab="data"]');
  expect(await page.locator('#dataTable tbody tr').first().getAttribute('data-key')).toBe('EX_01');
});
