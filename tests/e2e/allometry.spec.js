'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { openApp, loadExample, loadRaw, expect } = require('./helpers.js');

const sizeTab = async page => { await loadExample(page); await page.click('[data-tab="size"]'); };

test('the Size tab shows shape against log size, with the regression line and the test', async ({ page }) => {
  const errors = await openApp(page);
  await sizeTab(page);
  await expect(page.locator('#selSizePc')).toHaveValue('reg');
  await expect(page.locator('#plotSize .fit-line')).toHaveCount(1);
  await expect(page.locator('#plotSize svg')).toContainText('log centroid size');
  await expect(page.locator('#plotSize svg')).toContainText('Regression score');
  await expect(page.locator('#alloStats')).toContainText(/R² = 0\.\d+.*p = [\d.<]+.*999 permutations/);
  expect(errors).toEqual([]);
});

test('a PC can still be plotted against centroid size, without the line', async ({ page }) => {
  await openApp(page);
  await sizeTab(page);
  await page.selectOption('#selSizePc', '0');
  await expect(page.locator('#plotSize .fit-line')).toHaveCount(0);
  await expect(page.locator('#plotSize svg')).toContainText('PC1');
});

test('shape change from the smallest to the largest specimen', async ({ page }) => {
  const errors = await openApp(page);
  await sizeTab(page);
  await expect(page.locator('#plotAllo .target')).toHaveCount(15);
  await expect(page.locator('#plotAllo svg')).toHaveAttribute('aria-label', /largest/);
  await page.locator('#rngAllo').fill('-1');
  await expect(page.locator('#plotAllo svg')).toHaveAttribute('aria-label', /smallest/);
  await page.selectOption('#selAlloStyle', 'grid');
  await expect(page.locator('#plotAllo .tps-grid')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('allometry can be removed from the morphospace', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const pc1 = () => page.evaluate(() => window.__sup.S.res.pca.proportion[0]);
  const before = await pc1();
  await page.check('#chkSizeCorrect');
  await expect.poll(pc1).not.toBe(before);
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#morphoNote')).toContainText('allometry removed');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  const text = fs.readFileSync(await dl.path()).toString('latin1');
  expect(text).toContain('size-corrected');
  expect(text).toContain('allometry.csv');
  expect(text).toContain('Allometry: shape on log centroid size');
});

test('the Size tab waits for the fit', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await expect(page.locator('[data-tab="size"]')).toBeDisabled();
});
