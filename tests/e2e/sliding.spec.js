'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { openApp, loadExample, upload, expect } = require('./helpers.js');

const fixture = name => fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8');
const consensus = page => page.locator('#plotSuper .consensus');
const settingsOf = async page => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  return fs.readFileSync(await dl.path()).toString('latin1');
};

test('semilandmarks are treated as fixed landmarks by default', async ({ page }) => {
  const errors = await openApp(page);
  await loadExample(page);
  await expect(page.locator('#selSemi')).toHaveValue('fixed');
  await expect(consensus(page)).toHaveCount(15);
  await expect(page.locator('#slideOpts')).toBeHidden();
  expect(errors).toEqual([]);
});

test('semilandmarks can be left out', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.selectOption('#selSemi', 'omit');
  await expect(consensus(page)).toHaveCount(10);
});

test('sliding uses the template’s curves, and the results say so', async ({ page }) => {
  const errors = await openApp(page);
  await loadExample(page);
  await page.selectOption('#selSemi', 'slide');
  await expect(page.locator('#slideOpts')).toBeVisible();
  await expect(page.locator('#slidersInfo')).toContainText('5 sliders from the template');
  await expect(page.locator('#selSlide')).toHaveValue('be');
  await expect(consensus(page)).toHaveCount(15);
  const zip = await settingsOf(page);
  expect(zip).toContain('sliders.csv');
  expect(zip).toContain('slid by bending energy');
  await page.selectOption('#selSlide', 'procd');
  expect(await settingsOf(page)).toContain('slid by Procrustes distance');
  expect(errors).toEqual([]);
});

test('the points before sliding can be shown', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await expect(page.locator('#beforeRow')).toBeHidden();
  await page.selectOption('#selSemi', 'slide');
  await expect(page.locator('#beforeRow')).toBeVisible();
  await page.check('#chkBefore');
  const n = await page.locator('#plotSuper .before-slide').count();
  expect(n).toBeGreaterThan(5 * 20);
  await expect(page.locator('#plotSuper')).toContainText('Before sliding');
  await page.uncheck('#chkBefore');
  await expect(page.locator('#plotSuper .before-slide')).toHaveCount(0);
});

test('TPS data slide once a sliders file is loaded', async ({ page }) => {
  const errors = await openApp(page);
  await upload(page, 'curves-2d.tps', fixture('curves-2d.tps'));
  await page.click('#bFit');
  await expect(consensus(page)).toHaveCount(24);
  await page.selectOption('#selSemi', 'slide');
  await expect(page.locator('#slidersInfo')).toContainText('No sliders');
  await page.setInputFiles('#fSliders', { name: 'sliders-2d.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture('sliders-2d.csv')) });
  await expect(page.locator('#slidersInfo')).toContainText('17 sliders loaded from sliders-2d.csv');
  await expect(consensus(page)).toHaveCount(24);
  expect(await settingsOf(page)).toContain('17 slid by bending energy');
  await page.selectOption('#selSemi', 'omit');
  await expect(consensus(page)).toHaveCount(7);
  await page.selectOption('#selSemi', 'slide');
  await page.click('#bClearSliders');
  await expect(page.locator('#slidersInfo')).toContainText('No sliders');
  expect(errors).toEqual([]);
});

test('a loaded sliders file is remembered for the same landmarks', async ({ page }) => {
  await openApp(page);
  await upload(page, 'curves-2d.tps', fixture('curves-2d.tps'));
  await page.click('#bFit');
  await page.selectOption('#selSemi', 'slide');
  await page.setInputFiles('#fSliders', { name: 'sliders-2d.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture('sliders-2d.csv')) });
  await expect(page.locator('#slidersInfo')).toContainText('17 sliders');
  await page.reload();
  await upload(page, 'curves-2d.tps', fixture('curves-2d.tps'));
  await page.click('#bFit');
  await page.selectOption('#selSemi', 'slide');
  await expect(page.locator('#slidersInfo')).toContainText('17 sliders loaded from sliders-2d.csv');
});

test('problems in a sliders file are listed in the notes', async ({ page }) => {
  await openApp(page);
  await upload(page, 'curves-2d.tps', fixture('curves-2d.tps'));
  await page.click('#bFit');
  await page.selectOption('#selSemi', 'slide');
  await page.setInputFiles('#fSliders', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('before,slide,after\n1,6,7\n1,99,7\n') });
  await expect(page.locator('#slidersInfo')).toContainText('1 slider loaded');
  await expect(page.locator('#issues')).toContainText('bad.csv');
  await expect(page.locator('#issues')).toContainText('99');
});
