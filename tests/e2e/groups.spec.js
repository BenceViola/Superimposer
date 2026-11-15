'use strict';
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { openApp, loadExample, loadRaw, upload, tps3d, expect } = require('./helpers.js');

const P = 10; // fixed landmarks in the example
const row = (page, i) => page.locator('#dataTable tbody tr[data-key]').nth(i).locator('td.f3');
const groupsTab = async (page, colour = 'csv:form') => {
  await loadExample(page);
  if (colour) await page.selectOption('#selColour', colour);
  await page.click('[data-tab="groups"]');
};

test('the Groups tab waits for the Procrustes fit', async ({ page }) => {
  await openApp(page);
  await loadRaw(page);
  await expect(page.locator('[data-tab="groups"]')).toBeDisabled();
});

test('without a grouping, the tab says how to choose one', async ({ page }) => {
  const errors = await openApp(page);
  await groupsTab(page, '');
  await expect(page.locator('#groupsHint')).toContainText('Colour by');
  await expect(page.locator('#plotGroupMeans svg')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('group means are drawn on top of each other, one per group', async ({ page }) => {
  const errors = await openApp(page);
  await groupsTab(page);
  await expect(page.locator('#plotGroupMeans .group-mean')).toHaveCount(2);
  await expect(page.locator('#plotGroupMeans .gm-pt')).toHaveCount(2 * P);
  await expect(page.locator('#groupsHint')).toContainText('form');
  expect(errors).toEqual([]);
});

test('the summary table gives n, size and variance per group', async ({ page }) => {
  await openApp(page);
  await groupsTab(page);
  const rows = page.locator('#tblGroups tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('deep');
  await expect(page.locator('#tblGroups thead')).toContainText('Procrustes variance');
});

test('pairwise distances come with permutation p-values; deep and slender fish differ', async ({ page }) => {
  await openApp(page);
  await groupsTab(page);
  const row = page.locator('#tblGroupPairs tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('deep');
  await expect(row).toContainText('slender');
  const p = await row.locator('td.p-dist').textContent();
  expect(p.trim()).toMatch(/^0\.001/);
  await expect(page.locator('#groupsTests')).toContainText('999 permutations');
});

test('the number of permutations can be changed, or the tests turned off', async ({ page }) => {
  await openApp(page);
  await groupsTab(page);
  await page.selectOption('#selPerms', '99');
  await expect(page.locator('#groupsTests')).toContainText('99 permutations');
  await expect(page.locator('#tblGroupPairs td.p-dist')).toHaveText(/0\.01/);
  await page.selectOption('#selPerms', '0');
  await expect(page.locator('#tblGroupPairs td.p-dist')).toHaveText(/—/);
});

test('comparing two groups shows the change from one mean to the other', async ({ page }) => {
  await openApp(page);
  await groupsTab(page);
  await expect(page.locator('#plotGroupDiff .target')).toHaveCount(P);
  await expect(page.locator('#plotGroupDiff svg')).toHaveAttribute('aria-label', 'Shape change from deep to slender');
  await page.selectOption('#selGroupA', 'all');
  await expect(page.locator('#plotGroupDiff svg')).toHaveAttribute('aria-label', /from all specimens to slender/);
  await page.selectOption('#selGroupStyle', 'grid');
  await expect(page.locator('#plotGroupDiff .tps-grid')).toHaveCount(1);
});

test('exaggerating the difference moves the target further', async ({ page }) => {
  await openApp(page);
  await groupsTab(page);
  const spread = () => page.evaluate(() => {
    const t = [...document.querySelectorAll('#plotGroupDiff .target')].map(c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
    const m = [...document.querySelectorAll('#plotGroupDiff .mean')].map(c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
    return t.reduce((s, p, i) => s + Math.hypot(p[0] - m[i][0], p[1] - m[i][1]), 0) / t.length;
  });
  const before = await spread();
  await page.locator('#rngGroupMag').fill('3');
  await expect(page.locator('#groupMagValue')).toHaveText('×3');
  expect(await spread()).toBeGreaterThan(before * 1.5);
});

test('the overall mean can be shown with the group means', async ({ page }) => {
  await openApp(page);
  await groupsTab(page);
  await page.check('#chkGroupOverall');
  await expect(page.locator('#plotGroupMeans .overall-pt')).toHaveCount(P);
});

test('replicates kept separately are pointed out', async ({ page }) => {
  await openApp(page);
  await groupsTab(page);
  await expect(page.locator('#groupsWarn')).toContainText('Average per specimen');
  await page.selectOption('#selReplicates', 'average');
  await expect(page.locator('#groupsWarn')).toBeHidden();
});

test('groups of one specimen are marked', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('[data-tab="data"]');
  await page.fill('#dtNewCol', 'odd');
  await page.click('#bAddCol');
  await row(page, 0).click();
  await page.selectOption('#dtBulkCol', 'odd');
  await page.fill('#dtBulkValue', 'lonely');
  await page.click('#bBulk');
  await row(page, 1).click();
  await row(page, 5).click({ modifiers: ['Shift'] });
  await page.fill('#dtBulkValue', 'crowd');
  await page.click('#bBulk');
  await page.selectOption('#selColour', 'csv:odd');
  await page.click('[data-tab="groups"]');
  await expect(page.locator('#groupsWarn')).toContainText('lonely');
  await expect(page.locator('#groupsHint')).toContainText('without a group');
});

test('group means and ellipses in the morphospace', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.selectOption('#selColour', 'csv:form');
  await page.click('[data-tab="morpho"]');
  await page.check('#chkGroupMeans');
  await expect(page.locator('#plotScatter .group-centre')).toHaveCount(2);
  await page.check('#chkEllipses');
  await expect(page.locator('#plotScatter .ellipse')).toHaveCount(2);
});

test('group figures download, and the results include the group tables', async ({ page }) => {
  await openApp(page);
  await groupsTab(page);
  const [svg] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="svg"][data-plot="groupMeans"]')]);
  expect(svg.suggestedFilename()).toBe('group-means.svg');
  const [diff] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="svg"][data-plot="groupDiff"]')]);
  expect(diff.suggestedFilename()).toBe('group-difference.svg');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bDownload')]);
  const text = fs.readFileSync(await dl.path()).toString('latin1');
  for (const n of ['groups.csv', 'group-pairs.csv', 'group-means.csv']) expect(text).toContain(n);
});

test('changing groups in the table updates the Groups tab', async ({ page }) => {
  await openApp(page);
  await groupsTab(page, 'csv:site');
  await expect(page.locator('#tblGroups tbody tr')).toHaveCount(2);
  await expect(page.locator('#tblGroups')).toContainText('lake');
});

test('3D data: group means and their difference are drawn', async ({ page }) => {
  const errors = await openApp(page);
  await upload(page, 'skulls.tps', tps3d(8, 6));
  await page.click('#bFit');
  await page.click('[data-tab="data"]');
  await page.fill('#dtNewCol', 'half');
  await page.click('#bAddCol');
  await row(page, 0).click();
  await row(page, 3).click({ modifiers: ['Shift'] });
  await page.selectOption('#dtBulkCol', 'half');
  await page.fill('#dtBulkValue', 'first');
  await page.click('#bBulk');
  await page.selectOption('#selColour', 'csv:half');
  await page.click('[data-tab="groups"]');
  await expect(page.locator('#plotGroupMeans .group-mean')).toHaveCount(1);
  await expect(page.locator('#selGroupStyle')).toBeHidden();
  expect(errors).toEqual([]);
});

