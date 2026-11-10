'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { openApp, loadRaw, upload, tps2d, expect } = require('./helpers.js');

const openData = async page => { await loadRaw(page); await page.click('[data-tab="data"]'); await expect(page.locator('#dataTable')).toBeVisible(); };
const cell = (page, key, col) => page.locator(`#dataTable tr[data-key="${key}"] input.dt-cell[data-col="${col}"]`);
const inRow = (page, key, cls) => page.locator(`#dataTable tr[data-key="${key}"] .${cls}`);

/* ---------- arrow keys ---------- */
test('up and down move along a column, keeping edits', async ({ page }) => {
  const errors = await openApp(page);
  await openData(page);
  await cell(page, 'EX_01', 'form').fill('stout');
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 'EX_02', 'form')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 'EX_02_r2', 'form')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, 'EX_01', 'form')).toBeFocused();
  await expect(cell(page, 'EX_01', 'form')).toHaveValue('stout');
  expect(errors).toEqual([]);
});

test('arriving in a cell selects it, so left and right move straight on', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await cell(page, 'EX_01', 'form').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 'EX_02', 'site')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(cell(page, 'EX_02', 'form')).toBeFocused();
});

test('with the caret inside the text, left and right edit the text', async ({ page }) => {
  await openApp(page);
  await openData(page);
  const c = cell(page, 'EX_01', 'form');
  await c.click();
  await c.press('End');
  await c.press('ArrowLeft');
  await expect(c).toBeFocused();
  await c.press('ArrowLeft');
  await c.type('X');
  await expect(c).toHaveValue('deXep');
});

test('at the end of the text, right moves to the next cell', async ({ page }) => {
  await openApp(page);
  await openData(page);
  const c = cell(page, 'EX_01', 'form');
  await c.click();
  await c.press('End');
  await c.press('ArrowRight');
  await expect(cell(page, 'EX_01', 'site')).toBeFocused();
});

test('left from the first group cell reaches the marker and the tick boxes', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await cell(page, 'EX_03', 'form').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(inRow(page, 'EX_03', 'mk')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(inRow(page, 'EX_03', 'dt-use')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(inRow(page, 'EX_03', 'dt-select')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(inRow(page, 'EX_04', 'dt-select')).toBeFocused();
});

test('ticking a row with the space bar keeps the focus there', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await inRow(page, 'EX_03', 'dt-select').focus();
  await page.keyboard.press('Space');
  await expect(inRow(page, 'EX_03', 'dt-select')).toBeChecked();
  await expect(inRow(page, 'EX_03', 'dt-select')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('#dtCount')).toContainText('2 selected');
});

test('the edges of the table stop the movement', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await cell(page, 'EX_01', 'form').focus();
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, 'EX_01', 'form')).toBeFocused();
  await cell(page, 'EX_01', 'site').focus();
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 'EX_01', 'site')).toBeFocused();
});

test('Escape undoes the typing in a cell', async ({ page }) => {
  await openApp(page);
  await openData(page);
  const c = cell(page, 'EX_01', 'form');
  await c.fill('oops');
  await c.press('Escape');
  await expect(c).toHaveValue('deep');
  await c.press('ArrowDown');
  await expect(cell(page, 'EX_01', 'form')).toHaveValue('deep');
});

test('arrow keys follow the sorted order', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await page.click('#dataTable thead button[data-sort="key"]');
  await page.click('#dataTable thead button[data-sort="key"]');
  await cell(page, 'EX_24', 'form').focus();
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 'EX_23', 'form')).toBeFocused();
});

/* ---------- renaming ---------- */
const rename = async (page, col, name, key = 'Enter') => {
  await page.click(`#dataTable thead button[data-rename="${col}"]`);
  const box = page.locator('#dataTable thead input.dt-rename');
  await expect(box).toBeFocused();
  await box.fill(name);
  await box.press(key);
};

test('a group column can be renamed, keeping its values', async ({ page }) => {
  const errors = await openApp(page);
  await openData(page);
  await rename(page, 'form', 'body form');
  await expect(page.locator('#dataTable thead button[data-rename="body form"]')).toHaveCount(1);
  await expect(page.locator('#dataTable thead button[data-rename="form"]')).toHaveCount(0);
  await expect(cell(page, 'EX_01', 'body form')).toHaveValue('deep');
  expect(errors).toEqual([]);
});

test('renaming keeps the colouring and the sort', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await page.selectOption('#selColour', 'csv:form');
  await page.click('#dataTable thead button[data-sort="group:form"]');
  const order = await page.locator('#dataTable tbody tr').evaluateAll(rows => rows.map(r => r.dataset.key));
  await rename(page, 'form', 'shape');
  await expect(page.locator('#selColour')).toHaveValue('csv:shape');
  await expect(page.locator('#dataTable thead')).toContainText('shape ▲');
  expect(await page.locator('#dataTable tbody tr').evaluateAll(rows => rows.map(r => r.dataset.key))).toEqual(order);
  await page.click('[data-tab="super"]');
  await expect(page.locator('#plotSuper .legend')).toContainText('slender');
});

test('a taken name is refused and the box stays open', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await rename(page, 'form', 'site');
  await expect(page.locator('#dtHint')).toContainText('site');
  await expect(page.locator('#dataTable thead input.dt-rename')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#dataTable thead input.dt-rename')).toHaveCount(0);
  await expect(page.locator('#dataTable thead button[data-rename="form"]')).toHaveCount(1);
});

test('Escape cancels a rename', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await rename(page, 'form', 'shape', 'Escape');
  await expect(page.locator('#dataTable thead button[data-rename="form"]')).toHaveCount(1);
});

test('clicking elsewhere keeps the new name', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await page.click('#dataTable thead button[data-rename="form"]');
  await page.locator('#dataTable thead input.dt-rename').fill('shape');
  await page.click('#dtFilter');
  await expect(page.locator('#dataTable thead button[data-rename="shape"]')).toHaveCount(1);
});

test('renamed columns are saved and remembered', async ({ page }) => {
  await openApp(page);
  await upload(page, 'set.tps', tps2d());
  await page.click('[data-tab="data"]');
  await page.fill('#dtNewCol', 'colony');
  await page.click('#bAddCol');
  await cell(page, 'T0', 'colony').fill('Alpha');
  await cell(page, 'T0', 'colony').press('Enter');
  await rename(page, 'colony', 'nest');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bSaveGroups')]);
  expect(fs.readFileSync(await dl.path(), 'utf8')).toContain('nest');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await upload(page, 'set.tps', tps2d());
  await page.click('[data-tab="data"]');
  await expect(cell(page, 'T0', 'nest')).toHaveValue('Alpha');
});
