'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { openApp, loadExample, expect } = require('./helpers.js');

async function sizeByForm(page, model) {
  await loadExample(page);
  await page.click('#bFlipAll');
  await page.selectOption('#selColour', 'csv:form');
  await page.click('[data-tab="size"]');
  if (model) await page.selectOption('#selAlloModel', model);
}

test('the choice of model appears once a grouping is chosen', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('[data-tab="size"]');
  await expect(page.locator('#alloModelRow')).toBeHidden();
  await page.selectOption('#selColour', 'csv:form');
  await expect(page.locator('#alloModelRow')).toBeVisible();
  await expect(page.locator('#selAlloModel')).toHaveValue('pooled');
});

test('separate slopes: the test of slopes, the angle between slopes, and a line per group', async ({ page }) => {
  const errors = await openApp(page);
  await sizeByForm(page, 'separate');
  await expect(page.locator('#tblAllo')).toContainText('Size × group');
  await expect(page.locator('#tblAllo')).toContainText(/permutations/);
  await expect(page.locator('#tblAlloPairs')).toContainText('deep – slender');
  await expect(page.locator('#tblAlloPairs thead')).toContainText('Angle');
  await expect(page.locator('#plotSize .fit-line')).toHaveCount(2);
  await expect(page.locator('#plotSize svg')).toContainText('common slope');
  expect(errors).toEqual([]);
});

test('common slope: groups compared at the same size', async ({ page }) => {
  await openApp(page);
  await sizeByForm(page, 'common');
  await expect(page.locator('#tblAllo')).toContainText('Group (at the same size)');
  await expect(page.locator('#tblAlloPairs thead')).toContainText('size-adjusted');
  await expect(page.locator('#plotSize .fit-line')).toHaveCount(2);
});

test('the shape change with size is shown for a chosen group', async ({ page }) => {
  await openApp(page);
  await sizeByForm(page, 'separate');
  await expect(page.locator('#selAlloGroup')).toBeVisible();
  await page.selectOption('#selAlloGroup', 'slender');
  await expect(page.locator('#plotAllo svg')).toHaveAttribute('aria-label', /slender/);
  await page.selectOption('#selAlloModel', 'pooled');
  await expect(page.locator('#selAlloGroup')).toBeHidden();
});

test('replicates kept separately are pointed out', async ({ page }) => {
  await openApp(page);
  await sizeByForm(page, 'separate');
  await expect(page.locator('#alloWarn')).toContainText('Average per specimen');
});

test('removing allometry from the PCA uses the slope within groups when groups are chosen', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.check('#chkSizeCorrect');
  await expect.poll(() => page.evaluate(() => window.__sup.S.res.pca.sizeCorrected)).toBe(true);
  await page.selectOption('#selColour', 'csv:form');
  await expect.poll(() => page.evaluate(() => window.__sup.S.res.pca.sizeCorrected)).toBe('groups');
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#morphoNote')).toContainText('within groups');
});

test('the results include the models by group', async ({ page }) => {
  await openApp(page);
  await sizeByForm(page, 'separate');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  const text = fs.readFileSync(await dl.path()).toString('latin1');
  expect(text).toContain('allometry-groups.csv');
  expect(text).toContain('allometry-pairs.csv');
  expect(text).toContain('Allometry by groups (form)');
});
