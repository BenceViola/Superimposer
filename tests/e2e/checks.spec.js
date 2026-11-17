'use strict';
// Only a checkbox and its words switch an option: a click in the empty space beside them does nothing.
// (A click just below the Replicates menu used to switch on the size correction.)
const { test } = require('@playwright/test');
const { openApp, loadExample, loadRaw, expect } = require('./helpers.js');

test('the empty end of a checkbox row is not clickable', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  const ids = await page.$$eval('label.check input[type=checkbox]', els => els.filter(e => e.offsetParent && e.id).map(e => e.id));
  expect(ids).toContain('chkSizeCorrect');
  for (const id of ids) {
    const row = page.locator(`label.check:has(#${id})`);
    const card = await row.evaluate(l => { const p = l.parentElement.getBoundingClientRect(), r = l.getBoundingClientRect(); return { right: p.right, top: r.top, height: r.height, labelRight: r.right }; });
    expect(card.labelRight, `${id}: the label ends where its words end`).toBeLessThan(card.right - 20);
    const before = await page.locator(`#${id}`).isChecked();
    await page.mouse.click(card.right - 8, card.top + card.height / 2);
    expect(await page.locator(`#${id}`).isChecked(), id).toBe(before);
  }
});

test('the words of a checkbox still switch it', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.getByText('Remove allometry from the PCA').click();
  await expect(page.locator('#chkSizeCorrect')).toBeChecked();
  await expect.poll(() => page.evaluate(() => window.__sup.S.sizeCorrect)).toBe(true);
});

test('the size-correction box shows the setting even before the fit', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { window.__sup.S.sizeCorrect = true; });
  await loadRaw(page); // loads, does not fit
  await expect(page.locator('#chkSizeCorrect')).toBeChecked();
});
