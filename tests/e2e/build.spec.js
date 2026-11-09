'use strict';
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

test('the single-file build works when opened from disk', async ({ page }) => {
  const file = path.resolve(__dirname, '../../dist/superimposer.html');
  expect(fs.statSync(file).size).toBeGreaterThan(10000);
  expect(fs.readFileSync(file, 'utf8')).not.toMatch(/src="src\//);
  await page.goto(`file://${file}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await page.click('#bExample');
  await expect(page.locator('#plotSuper svg')).toBeVisible();
});
