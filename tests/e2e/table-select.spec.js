'use strict';
const { test } = require('@playwright/test');
const { openApp, loadRaw, expect } = require('./helpers.js');

const openData = async page => { await loadRaw(page); await page.click('[data-tab="data"]'); await expect(page.locator('#dataTable')).toBeVisible(); };
const name = (page, key) => page.locator(`#dataTable tr[data-key="${key}"] td.f3`);
const detail = (page, key) => page.locator(`#dataTable tr[data-key="${key}"] td[data-c="source"]`);
const cell = (page, key, col) => page.locator(`#dataTable tr[data-key="${key}"] input.dt-cell[data-col="${col}"]`);
const tick = (page, key) => page.locator(`#dataTable tr[data-key="${key}"] .dt-select`);
const selected = page => page.evaluate(() => [...window.__sup.S.dtSelected].sort());
const MOD = 'ControlOrMeta';

test('a click on a row selects that row only', async ({ page }) => {
  const errors = await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  expect(await selected(page)).toEqual(['EX_03']);
  await detail(page, 'EX_05').click();
  expect(await selected(page)).toEqual(['EX_05']);
  await expect(tick(page, 'EX_05')).toBeChecked();
  await expect(tick(page, 'EX_03')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('shift-click selects every row in between', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  await name(page, 'EX_06').click({ modifiers: ['Shift'] });
  expect(await selected(page)).toEqual(['EX_03', 'EX_04', 'EX_05', 'EX_06']);
  await expect(page.locator('#dtCount')).toContainText('4 selected');
});

test('shift-click works upwards, and from the same starting row again', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_05').click();
  await name(page, 'EX_03').click({ modifiers: ['Shift'] });
  expect(await selected(page)).toEqual(['EX_03', 'EX_04', 'EX_05']);
  await name(page, 'EX_06').click({ modifiers: ['Shift'] });
  expect(await selected(page)).toEqual(['EX_05', 'EX_06']);
});

test('the range follows the order shown', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await page.click('#dataTable thead button[data-sort="group:form"]');
  const order = await page.locator('#dataTable tbody tr').evaluateAll(rows => rows.map(r => r.dataset.key));
  await name(page, order[0]).click();
  await name(page, order[3]).click({ modifiers: ['Shift'] });
  expect(await selected(page)).toEqual(order.slice(0, 4).sort());
});

test('the range keeps to the rows left by the filter', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await page.fill('#dtFilter', 'slender');
  const order = await page.locator('#dataTable tbody tr').evaluateAll(rows => rows.map(r => r.dataset.key));
  await name(page, order[0]).click();
  await name(page, order[2]).click({ modifiers: ['Shift'] });
  expect(await selected(page)).toEqual(order.slice(0, 3).sort());
});

test('Ctrl- or Cmd-click adds and removes single rows', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  await name(page, 'EX_07').click({ modifiers: [MOD] });
  await name(page, 'EX_09').click({ modifiers: [MOD] });
  expect(await selected(page)).toEqual(['EX_03', 'EX_07', 'EX_09']);
  await name(page, 'EX_07').click({ modifiers: [MOD] });
  expect(await selected(page)).toEqual(['EX_03', 'EX_09']);
});

test('Shift with Ctrl or Cmd adds a range to what is selected', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_01').click();
  await name(page, 'EX_05').click({ modifiers: [MOD] });
  await name(page, 'EX_07').click({ modifiers: [MOD, 'Shift'] });
  expect(await selected(page)).toEqual(['EX_01', 'EX_05', 'EX_06', 'EX_07']);
});

test('tick boxes toggle one row, and shift-click on them ticks a range', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await tick(page, 'EX_03').click();
  await tick(page, 'EX_08').click();
  expect(await selected(page)).toEqual(['EX_03', 'EX_08']);
  await tick(page, 'EX_11').click({ modifiers: ['Shift'] });
  expect(await selected(page)).toEqual(['EX_03', 'EX_08', 'EX_09', 'EX_10', 'EX_10_r2', 'EX_11']);
});

test('clicking into a group cell edits it without changing the selection', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  await name(page, 'EX_05').click({ modifiers: ['Shift'] });
  await cell(page, 'EX_09', 'form').click();
  expect(await selected(page)).toEqual(['EX_03', 'EX_04', 'EX_05']);
});

test('the Use box and the marker do not change the selection', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  await page.locator('#dataTable tr[data-key="EX_09"] .dt-use').uncheck();
  await page.locator('#dataTable tr[data-key="EX_10"] .mk').click();
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual(['EX_03']);
});

test('shift-click selects no page text', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_02').click();
  await name(page, 'EX_09').click({ modifiers: ['Shift'] });
  expect(await page.evaluate(() => String(window.getSelection()))).toBe('');
});

test('shift with the arrow keys extends the selection', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  await cell(page, 'EX_03', 'form').focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(cell(page, 'EX_05', 'form')).toBeFocused();
  expect(await selected(page)).toEqual(['EX_03', 'EX_04', 'EX_05']);
  await page.keyboard.press('Shift+ArrowUp');
  expect(await selected(page)).toEqual(['EX_03', 'EX_04']);
});

test('Ctrl- or Cmd-Enter fills the value into every selected row', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  await name(page, 'EX_06').click({ modifiers: ['Shift'] });
  await cell(page, 'EX_04', 'form').fill('chosen');
  await page.keyboard.press(`${MOD}+Enter`);
  for (const k of ['EX_03', 'EX_04', 'EX_05', 'EX_06']) await expect(cell(page, k, 'form')).toHaveValue('chosen');
  await expect(cell(page, 'EX_07', 'form')).not.toHaveValue('chosen');
  await expect(cell(page, 'EX_04', 'form')).toBeFocused();
});

test('Ctrl- or Cmd-Enter in a row that is not selected changes that row only', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  await name(page, 'EX_04').click({ modifiers: ['Shift'] });
  await cell(page, 'EX_09', 'form').fill('alone');
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(cell(page, 'EX_09', 'form')).toHaveValue('alone');
  await expect(cell(page, 'EX_03', 'form')).not.toHaveValue('alone');
});

test('Ctrl- or Cmd-A selects every row shown, outside the text cells', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await page.fill('#dtFilter', 'deep');
  const n = await page.locator('#dataTable tbody tr').count();
  await tick(page, 'EX_01').focus();
  await page.keyboard.press(`${MOD}+a`);
  await expect(page.locator('#dtCount')).toContainText(`${n} selected`);
  await cell(page, 'EX_01', 'form').click();
  await page.keyboard.press(`${MOD}+a`);
  expect(await page.evaluate(() => String(window.getSelection() || document.activeElement.value))).toBeTruthy();
  await expect(page.locator('#dtCount')).toContainText(`${n} selected`);
});

test('Clear selection empties it', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await expect(page.locator('#bClearSel')).toBeHidden();
  await name(page, 'EX_03').click();
  await name(page, 'EX_06').click({ modifiers: ['Shift'] });
  await page.click('#bClearSel');
  expect(await selected(page)).toEqual([]);
  await expect(page.locator('#bClearSel')).toBeHidden();
});

test('the Assign bar uses rows selected with the mouse', async ({ page }) => {
  await openApp(page);
  await openData(page);
  await name(page, 'EX_03').click();
  await name(page, 'EX_05').click({ modifiers: ['Shift'] });
  await page.selectOption('#dtBulkCol', 'site');
  await page.fill('#dtBulkValue', 'pond');
  await page.click('#bBulk');
  for (const k of ['EX_03', 'EX_04', 'EX_05']) await expect(cell(page, k, 'site')).toHaveValue('pond');
});
