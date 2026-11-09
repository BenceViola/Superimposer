'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { openApp, loadExample, loadRaw, upload, tps2d, fit, expect } = require('./helpers.js');

const openData = async page => { await page.click('[data-tab="data"]'); await expect(page.locator('#dataTable')).toBeVisible(); };
const example = async page => { await loadRaw(page); await openData(page); };
const row = (page, key) => page.locator(`#dataTable tbody tr[data-key="${key}"]`);
const cell = (page, key, col) => row(page, key).locator(`input.dt-cell[data-col="${col}"]`);
const setCell = async (page, key, col, value) => { await cell(page, key, col).fill(value); await cell(page, key, col).press('Tab'); };
const addCol = async (page, name) => { await page.fill('#dtNewCol', name); await page.click('#bAddCol'); };
const groupOf = (page, key, col) => page.evaluate(([k, c]) => window.__sup.TB.buildRows(window.__sup.S.dataset, window.__sup.S.res, window.__sup.S.table, new Set()).find(r => r.key === k).groups[c], [key, col]);
const missingTps = 'LM=4\n-999 -999\n10 2\n11 9\n3 8\nID=A\nLM=4\n1 1\n10 3\n12 9\n3 7\nID=B\nLM=4\n1 2\n11 2\n11 8\n2 8\nID=C\n';

test('the data table lists every record before any fit', async ({ page }) => {
  const errors = await openApp(page);
  await example(page);
  const n = await page.evaluate(() => window.__sup.S.dataset.specimens.length);
  await expect(page.locator('#dataTable tbody tr')).toHaveCount(n);
  await expect(page.locator('#dataTable thead')).toContainText('Operator');
  await expect(page.locator('#dataTable thead')).toContainText('Centroid size');
  await expect(row(page, 'EX_01')).toContainText('EX_01.lmk.json');
  expect(errors).toEqual([]);
});

test('Procrustes distance appears after the fit', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await openData(page);
  await expect(row(page, 'EX_01').locator('td[data-c="dist"]')).not.toHaveText('');
});

test('editing a group cell creates the grouping', async ({ page }) => {
  const errors = await openApp(page);
  await example(page);
  await addCol(page, 'colony');
  await setCell(page, 'EX_01', 'colony', 'Alpha');
  await setCell(page, 'EX_03', 'colony', 'Beta');
  expect(await groupOf(page, 'EX_01', 'colony')).toBe('Alpha');
  await page.selectOption('#selColour', 'csv:colony');
  await page.click('[data-tab="super"]');
  await expect(page.locator('#plotSuper .legend')).toContainText('Beta');
  expect(errors).toEqual([]);
});

test('existing groups can be edited, and the plots follow', async ({ page }) => {
  await openApp(page);
  await example(page);
  await expect(cell(page, 'EX_01', 'form')).toHaveValue('deep');
  await setCell(page, 'EX_01', 'form', 'stout');
  await page.selectOption('#selColour', 'csv:form');
  await page.click('[data-tab="super"]');
  await expect(page.locator('#plotSuper .legend')).toContainText('stout');
});

test('replicates of a specimen share their group', async ({ page }) => {
  await openApp(page);
  await example(page);
  await setCell(page, 'EX_02_r2', 'form', 'odd');
  await expect(cell(page, 'EX_02', 'form')).toHaveValue('odd');
});

test('Tab moves on to the next cell and keeps the focus', async ({ page }) => {
  await openApp(page);
  await example(page);
  await addCol(page, 'colony');
  await cell(page, 'EX_01', 'form').fill('x');
  await cell(page, 'EX_01', 'form').press('Tab');
  await expect(cell(page, 'EX_01', 'site')).toBeFocused();
});

test('Enter moves down the column', async ({ page }) => {
  await openApp(page);
  await example(page);
  await cell(page, 'EX_01', 'form').fill('x');
  await cell(page, 'EX_01', 'form').press('Enter');
  await expect(cell(page, 'EX_02', 'form')).toBeFocused();
  expect(await groupOf(page, 'EX_01', 'form')).toBe('x');
});

test('a column name that is taken is refused with a message', async ({ page }) => {
  await openApp(page);
  await example(page);
  await addCol(page, 'form');
  await expect(page.locator('#dtHint')).toContainText('form');
  await expect(page.locator('#dataTable thead .dt-group')).toHaveCount(2);
});

test('removing a column needs a second click', async ({ page }) => {
  await openApp(page);
  await example(page);
  const button = page.locator('#dataTable thead button[data-remove="site"]');
  await button.click();
  await expect(page.locator('#dataTable thead .dt-group')).toHaveCount(2);
  await expect(page.locator('#dataTable thead button[data-remove="site"]')).toHaveText('Remove?');
  await page.locator('#dataTable thead button[data-remove="site"]').click();
  await expect(page.locator('#dataTable thead .dt-group')).toHaveCount(1);
});

test('selected rows can be assigned to a group together', async ({ page }) => {
  await openApp(page);
  await example(page);
  await row(page, 'EX_01').locator('.dt-select').check();
  await row(page, 'EX_03').locator('.dt-select').check();
  await expect(page.locator('#dtCount')).toContainText('2 selected');
  await page.selectOption('#dtBulkCol', 'form');
  await page.fill('#dtBulkValue', 'chosen');
  await page.click('#bBulk');
  await expect(cell(page, 'EX_01', 'form')).toHaveValue('chosen');
  await expect(cell(page, 'EX_03', 'form')).toHaveValue('chosen');
  await expect(cell(page, 'EX_04', 'form')).not.toHaveValue('chosen');
});

test('select all takes only the rows left by the filter', async ({ page }) => {
  await openApp(page);
  await example(page);
  await page.fill('#dtFilter', 'slender');
  const n = await page.locator('#dataTable tbody tr').count();
  await page.locator('#dtSelectAll').check();
  await expect(page.locator('#dtCount')).toContainText(`${n} selected`);
});

test('the filter narrows the rows and keeps the typing position', async ({ page }) => {
  await openApp(page);
  await example(page);
  await page.locator('#dtFilter').pressSequentially('EX_1');
  await expect(page.locator('#dtFilter')).toBeFocused();
  await expect(page.locator('#dtFilter')).toHaveValue('EX_1');
  await expect(page.locator('#dataTable tbody tr')).not.toHaveCount(0);
  expect(await page.locator('#dataTable tbody tr').count()).toBeLessThan(15);
});

test('headings sort, and a second click reverses', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await openData(page);
  const first = () => page.locator('#dataTable tbody tr').first().getAttribute('data-key');
  await page.click('#dataTable thead button[data-sort="key"]');
  expect(await first()).toBe('EX_01');
  await page.click('#dataTable thead button[data-sort="key"]');
  expect(await first()).toBe('EX_24');
});

test('paste from a spreadsheet fills down and across', async ({ page }) => {
  await openApp(page);
  await example(page);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('input.dt-cell')].find(i => i.dataset.key === 'EX_01' && i.dataset.col === 'form');
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    ev.clipboardData = { getData: () => 'p1\tq1\np2\tq2\n' };
    el.dispatchEvent(ev);
  });
  await expect(cell(page, 'EX_01', 'form')).toHaveValue('p1');
  await expect(cell(page, 'EX_01', 'site')).toHaveValue('q1');
  await expect(cell(page, 'EX_02', 'form')).toHaveValue('p2');
  await expect(cell(page, 'EX_02', 'site')).toHaveValue('q2');
});

test('coordinates can be shown, with gaps marked', async ({ page }) => {
  await openApp(page);
  await upload(page, 'gaps.tps', missingTps);
  await openData(page);
  await expect(page.locator('#dataTable thead')).not.toContainText('P01_x');
  await page.check('#chkCoords');
  await expect(page.locator('#dataTable thead')).toContainText('P01_x');
  await expect(row(page, 'A').locator('td.dt-gap')).toHaveCount(2);
  await expect(row(page, 'B').locator('td[data-c="P02_x"]')).toHaveText('10.000');
});

test('the data table works when there is too little to analyse', async ({ page }) => {
  await openApp(page);
  await upload(page, 'two.tps', tps2d(2));
  await expect(page.locator('#message')).toContainText('three specimens');
  await expect(page.locator('#dataTable tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-tab="super"]')).toBeDisabled();
  await expect(page.locator('[data-tab="data"]')).toBeEnabled();
});

test('specimens with gaps are visible even when the analysis fails because of them', async ({ page }) => {
  await openApp(page);
  await upload(page, 'gaps.tps', missingTps);
  await expect(page.locator('#message')).toBeVisible();
  await expect(row(page, 'A').locator('td[data-c="missing"]')).toHaveText('1');
});

test('the Use box leaves a specimen out', async ({ page }) => {
  await openApp(page);
  await example(page);
  const n = await page.evaluate(() => window.__sup.S.res.prep.specimens.length);
  await row(page, 'EX_01').locator('.dt-use').uncheck();
  expect(await page.evaluate(() => window.__sup.S.res.prep.specimens.length)).toBe(n - 1);
  await expect(page.locator('#tblSpecimens tr[data-key="EX_01"] input[type=checkbox]')).not.toBeChecked();
});

test('the marker in the table opens the popup', async ({ page }) => {
  await openApp(page);
  await example(page);
  await row(page, 'EX_03').locator('.mk').click();
  await expect(page.locator('#stylePop')).toBeVisible();
  await expect(page.locator('#popKey')).toContainText('EX_03');
});

test('groups save and load as a CSV', async ({ page }) => {
  await openApp(page);
  await example(page);
  await setCell(page, 'EX_01', 'form', 'saved');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bSaveGroups')]);
  expect(dl.suggestedFilename()).toBe('groups.csv');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  expect(text).toContain('EX_01,saved');
  await setCell(page, 'EX_01', 'form', 'changed');
  await upload(page, 'groups.csv', text, '#fGroups');
  await expect(cell(page, 'EX_01', 'form')).toHaveValue('saved');
});

test('the table downloads as shown, with coordinates when they are on', async ({ page }) => {
  await openApp(page);
  await example(page);
  await page.check('#chkCoords');
  await page.fill('#dtFilter', 'EX_01');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownloadTable')]);
  expect(dl.suggestedFilename()).toBe('specimen-table.csv');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  expect(text).toContain('LM01_x');
  expect(text.trim().split('\n').length).toBe(2);
});

test('group edits go into the results', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await openData(page);
  await addCol(page, 'colony');
  await setCell(page, 'EX_01', 'colony', 'Alpha');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  const text = fs.readFileSync(await dl.path()).toString('latin1');
  expect(text).toContain('colony');
  expect(text).toContain('Alpha');
});

test('groups are remembered for the same landmark set', async ({ page }) => {
  await openApp(page);
  await upload(page, 'set.tps', tps2d());
  await openData(page);
  await addCol(page, 'colony');
  await setCell(page, 'T0', 'colony', 'Alpha');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await upload(page, 'set.tps', tps2d());
  await openData(page);
  await expect(cell(page, 'T0', 'colony')).toHaveValue('Alpha');
  await expect(page.locator('#issues')).toContainText('remembered');
});

test('the fit button still leaves the data table where it is', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await fit(page);
  await openData(page);
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#plotScatter svg')).toBeVisible();
});
