'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { openApp, loadExample, loadRaw, upload, tps2d, tps3d, fit, expect } = require('./helpers.js');

const links = page => page.evaluate(() => window.__sup.S.links);
const clickLm = (page, i) => page.locator(`#plotSuper .lm-hit[data-lm="${i}"]`).dispatchEvent('click');

test('landmarks can be linked by clicking them', async ({ page }) => {
  const errors = await openApp(page);
  await loadExample(page);
  await page.click('#bEditLinks');
  await clickLm(page, 0);
  await expect(page.locator('#plotSuper .link-start')).toHaveCount(1);
  await clickLm(page, 1);
  expect(await links(page)).toEqual([['LM01', 'LM02']]);
  await expect(page.locator('#plotSuper .wire')).toHaveCount(1);
  await expect(page.locator('#linksCount')).toContainText('1 link');
  expect(errors).toEqual([]);
});

test('clicks chain from one landmark to the next, and the same landmark ends the chain', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bEditLinks');
  await clickLm(page, 0);
  await clickLm(page, 1);
  await clickLm(page, 2);
  expect((await links(page)).length).toBe(2);
  await clickLm(page, 2);
  await expect(page.locator('#plotSuper .link-start')).toHaveCount(0);
});

test('linking the same two landmarks again removes the link', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bEditLinks');
  await clickLm(page, 0);
  await clickLm(page, 1);
  await clickLm(page, 1);
  await clickLm(page, 0);
  await clickLm(page, 1);
  expect(await links(page)).toEqual([]);
});

test('a link can be removed from the list', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bOutline');
  const n = (await links(page)).length;
  await page.locator('#linksList button').first().click();
  expect((await links(page)).length).toBe(n - 1);
});

test('editing is available only after the fit', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await expect(page.locator('#bEditLinks')).toBeDisabled();
  await fit(page);
  await expect(page.locator('#bEditLinks')).toBeEnabled();
  await page.click('#bEditLinks');
  await expect(page.locator('#plotSuper .lm-hit').first()).toBeAttached();
  await page.click('#bFit');
  await expect(page.locator('#bEditLinks')).toBeDisabled();
  await expect(page.locator('#plotSuper .lm-hit')).toHaveCount(0);
});

test('outline and triangulate work on the raw view too, without the fit', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await page.click('#bOutline');
  await expect(page.locator('#plotSuper .wire').first()).toBeVisible();
  await expect(page.locator('#plotSuper .raw-outline')).toHaveCount(0);
  const ring = (await links(page)).length;
  await page.click('#bTriangulate');
  expect((await links(page)).length).toBeGreaterThan(ring);
});

test('links show on the shape change, and Clear removes them', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bTriangulate');
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#plotShape .wire-target')).toHaveCount(1);
  await page.click('#bClearLinks');
  await expect(page.locator('#plotShape .wire-target')).toHaveCount(0);
});

test('links can be saved and loaded', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bOutline');
  const saved = await links(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bSaveLinks')]);
  expect(dl.suggestedFilename()).toBe('links.csv');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  await page.click('#bClearLinks');
  expect(await links(page)).toEqual([]);
  await upload(page, 'links.csv', text, '#fLinks');
  await expect.poll(() => links(page)).toEqual(saved);
});

test('a links file naming unknown landmarks says so', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await upload(page, 'links.csv', 'LM01,LM02\nLM01,NOPE\n', '#fLinks');
  await expect(page.locator('#issues')).toContainText('NOPE');
  expect((await links(page)).length).toBe(1);
});

test('links are remembered for the same landmark set', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bOutline');
  const saved = await links(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await loadExample(page);
  expect(await links(page)).toEqual(saved);
});

test('other data do not inherit the links', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bOutline');
  await page.click('#bClear');
  await upload(page, 'set.tps', tps2d());
  await expect(page.locator('#plotSuper svg')).toBeVisible();
  expect(await links(page)).toEqual([]);
});

test('leaving out a landmark drops its links from the figure but keeps them defined', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bEditLinks');
  await clickLm(page, 0);
  await clickLm(page, 1);
  await page.locator('details:has(#tblPoints) summary').click();
  await page.locator('#tblPoints input[type=checkbox]').first().uncheck();
  await expect(page.locator('#plotSuper .wire')).toHaveCount(0);
  expect((await links(page)).length).toBe(1);
});

test('3D data: links by hand only', async ({ page }) => {
  await openApp(page);
  await upload(page, 'set3.tps', tps3d());
  await fit(page);
  await expect(page.locator('#bOutline')).toBeHidden();
  await expect(page.locator('#bTriangulate')).toBeHidden();
  await page.click('#bEditLinks');
  await clickLm(page, 0);
  await clickLm(page, 1);
  expect((await links(page)).length).toBe(1);
});

test('links go into figures and the results zip', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('#bOutline');
  const [svg] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="svg"][data-plot="super"]')]);
  expect(fs.readFileSync(await svg.path(), 'utf8')).toContain('class="wire"');
  const [zip] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  expect(fs.readFileSync(await zip.path()).toString('latin1')).toContain('links.csv');
});
