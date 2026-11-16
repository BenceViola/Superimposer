'use strict';
// When shape change is animated or scrubbed, the drawing keeps its frame: the mean shape doesn't move.
const { test } = require('@playwright/test');
const { openApp, loadExample, expect } = require('./helpers.js');

const pixels = (page, id, cls) => page.evaluate(([sel, c]) => [...document.querySelectorAll(`${sel} .${c}`)]
  .map(e => `${e.getAttribute('cx')},${e.getAttribute('cy')}`).join(' '), [`#${id}`, cls]);

for (const [label, tab, input, plot, values, before] of [
  ['along a PC', 'morpho', 'rngShape', 'plotShape', ['-1', '-0.4', '0.3', '1'], null],
  ['between group means', 'groups', 'rngGroupT', 'plotGroupDiff', ['0', '0.4', '1'], page => page.selectOption('#selColour', 'csv:form')],
  ['with size', 'size', 'rngAllo', 'plotAllo', ['-1', '0', '0.6', '1'], null],
]) {
  for (const style of ['arrows', 'grid']) {
    test(`the mean stays in place ${label} (${style})`, async ({ page }) => {
      await openApp(page);
      await loadExample(page);
      if (before) await before(page);
      await page.click(`[data-tab="${tab}"]`);
      const sel = { morpho: '#selShapeStyle', groups: '#selGroupStyle', size: '#selAlloStyle' }[tab];
      if (style === 'grid') await page.selectOption(sel, 'grid');
      const seen = [];
      for (const v of values) {
        await page.locator(`#${input}`).fill(v);
        // The fitted frame (offset and scale) of the drawing, and in arrow mode the drawn mean too.
        const frame = await page.locator(`#${plot} .frame-info`).getAttribute('data-frame');
        seen.push(style === 'grid' ? frame : `${frame}|${await pixels(page, plot, 'mean')}`);
      }
      expect(new Set(seen).size).toBe(1);
    });
  }
}
