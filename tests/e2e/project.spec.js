'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { openApp, loadExample, upload, expect } = require('./helpers.js');

const fixture = name => fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8');
const state = page => page.evaluate(() => {
  const S = window.__sup.S;
  return { semi: S.semilandmarks, colour: S.colour, flip: [...S.flip], excluded: [...S.excludeSpecimens], links: S.links.length, fitted: S.fitted, tab: S.tab, labels: S.labels, sizeCorrect: S.sizeCorrect, n: S.all.length, tableCols: S.table ? S.table.columns : null, sliders: S.sliders.length };
});
async function saveProject(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bSaveProject')]);
  const file = path.join(test.info().outputDir, dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), file };
}

test('saving and opening a project restores the data and the settings', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('#bSaveProject')).toBeDisabled();
  await loadExample(page);
  await page.click('#bFlipAll');
  await page.selectOption('#selSemi', 'slide');
  await page.check('#chkSizeCorrect');
  await page.selectOption('#selColour', 'csv:form');
  await page.uncheck('#chkLabels');
  await page.locator('#tblSpecimens input[type=checkbox]').nth(2).uncheck();
  await page.evaluate(() => { window.__sup.S.links = [['LM01', 'LM02'], ['LM02', 'LM03']]; });
  await page.click('[data-tab="morpho"]');
  const before = await state(page);
  const { name, file } = await saveProject(page);
  expect(name).toMatch(/^Example-fish-invented-data-\d{4}-\d{2}-\d{2}\.superimposer\.zip$/);

  await page.click('#bClear');
  expect((await state(page)).n).toBe(0);
  await page.setInputFiles('#fData', file);
  await expect.poll(async () => (await state(page)).n).toBe(before.n);
  expect(await state(page)).toEqual(before);
  await expect(page.locator('#plotScatter .pt').first()).toBeVisible();
  await expect(page.locator('#message, #issues')).toContainText(/Project opened/);
  expect(errors).toEqual([]);
});

test('opening a project replaces the data already loaded', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const { file } = await saveProject(page);
  await page.click('#bClear');
  await upload(page, 'curves-2d.tps', fixture('curves-2d.tps'));
  await page.setInputFiles('#fData', file);
  await expect.poll(async () => (await state(page)).n).toBe(27);
  expect((await page.evaluate(() => window.__sup.S.dataset.templateName))).toContain('Example fish');
});

test('a TPS project keeps its sliders file', async ({ page }) => {
  await openApp(page);
  await upload(page, 'curves-2d.tps', fixture('curves-2d.tps'));
  await page.click('#bFit');
  await page.selectOption('#selSemi', 'slide');
  await page.setInputFiles('#fSliders', { name: 'sliders-2d.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture('sliders-2d.csv')) });
  await expect(page.locator('#slidersInfo')).toContainText('17 sliders');
  const { file } = await saveProject(page);
  await page.evaluate(() => localStorage.clear());
  await page.click('#bClear');
  await page.setInputFiles('#fData', file);
  await expect(page.locator('#slidersInfo')).toContainText('17 sliders loaded from sliders-2d.csv');
  expect((await state(page)).semi).toBe('slide');
});

test('an ordinary zip of landmark files still opens as data', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  const p = path.join(test.info().outputDir, 'results.zip');
  await dl.saveAs(p);
  await page.click('#bClear');
  await page.setInputFiles('#fData', p);
  await expect(page.locator('#message, #issues')).not.toContainText(/Project opened/);
});
