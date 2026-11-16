'use strict';
const { test } = require('@playwright/test');
const { openApp, loadExample, expect } = require('./helpers.js');

const value = (page, key) => page.evaluate(k => window.__sup.S[k], key);
const targets = (page, id) => page.evaluate(sel => [...document.querySelectorAll(`${sel} .target`)].map(c => `${c.getAttribute('cx')},${c.getAttribute('cy')}`).join(' '), `#${id}`);

for (const [label, tab, button, input, key, plot, before] of [
  ['along a PC', 'morpho', 'bPlayShape', 'rngShape', 'shapeT', 'plotShape', null],
  ['between group means', 'groups', 'bPlayGroup', 'rngGroupT', 'groupT', 'plotGroupDiff', async page => page.selectOption('#selColour', 'csv:form')],
  ['from small to large', 'size', 'bPlayAllo', 'rngAllo', 'alloT', 'plotAllo', null],
]) {
  test(`shape change ${label} plays and pauses`, async ({ page }) => {
    const errors = await openApp(page);
    await loadExample(page);
    if (before) await before(page);
    await page.click(`[data-tab="${tab}"]`);
    const start = await value(page, key), shape0 = await targets(page, plot);
    await page.click(`#${button}`);
    await expect(page.locator(`#${button}`)).toHaveText('Pause');
    await expect.poll(() => value(page, key)).not.toBe(start);
    await expect.poll(() => targets(page, plot)).not.toBe(shape0);
    expect(Number(await page.locator(`#${input}`).inputValue())).not.toBe(start);
    await page.click(`#${button}`);
    await expect(page.locator(`#${button}`)).toHaveText('Play');
    const stopped = await value(page, key);
    await page.waitForTimeout(300);
    expect(await value(page, key)).toBe(stopped);
    expect(errors).toEqual([]);
  });
}

test('changing tab or moving the slider stops the animation', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.click('[data-tab="morpho"]');
  await page.click('#bPlayShape');
  await page.click('[data-tab="super"]');
  await page.click('[data-tab="morpho"]');
  await expect(page.locator('#bPlayShape')).toHaveText('Play');
  await page.click('#bPlayShape');
  await page.locator('#rngShape').fill('0.5');
  await expect(page.locator('#bPlayShape')).toHaveText('Play');
  expect(await value(page, 'shapeT')).toBe(0.5);
});

test('the group comparison can be scrubbed from one mean to the other', async ({ page }) => {
  await openApp(page);
  await loadExample(page);
  await page.selectOption('#selColour', 'csv:form');
  await page.click('[data-tab="groups"]');
  await page.locator('#rngGroupT').fill('0');
  const same = await page.evaluate(() => {
    const t = [...document.querySelectorAll('#plotGroupDiff .target')].map(c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
    const m = [...document.querySelectorAll('#plotGroupDiff .mean')].map(c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
    return t.every((p, i) => Math.hypot(p[0] - m[i][0], p[1] - m[i][1]) < 0.5);
  });
  expect(same).toBe(true);
});
