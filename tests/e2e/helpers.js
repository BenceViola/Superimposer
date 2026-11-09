'use strict';
const { expect } = require('@playwright/test');

/** Open the app and collect page errors. */
async function openApp(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const isFont = m => /fonts\.(googleapis|gstatic)\.com/.test(`${m.text()} ${m.location().url || ''}`);
  page.on('console', m => { if (m.type() === 'error' && !isFont(m)) errors.push(`${m.text()} ${m.location().url || ''}`.trim()); });
  await page.goto('/index.html');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  return errors;
}
async function loadExample(page) {
  await page.click('#bExample');
  await expect(page.locator('#plotSuper svg')).toBeVisible();
}
const upload = (page, name, text, input = '#fData') => page.setInputFiles(input, { name, mimeType: 'text/plain', buffer: Buffer.from(text) });

function tps2d(n = 6, p = 5) {
  const L = [];
  for (let s = 0; s < n; s++) {
    L.push(`LM=${p}`);
    for (let i = 0; i < p; i++) L.push(`${10 * Math.cos(i * 1.3) + s * 0.3 * Math.sin(i * 7) + 50} ${10 * Math.sin(i * 1.9) + s * 0.4 * Math.cos(i * 3) + 50}`);
    L.push(`ID=T${s}`);
  }
  return L.join('\n') + '\n';
}
function tps3d(n = 6, p = 5) {
  const L = [];
  for (let s = 0; s < n; s++) {
    L.push(`LM3=${p}`);
    for (let i = 0; i < p; i++) L.push(`${10 * Math.cos(i * 1.3) + s * 0.3} ${10 * Math.sin(i * 1.9) + s * 0.2 * i} ${(i * i) / 2 + s * 0.4 * Math.sin(i)}`);
    L.push(`ID=T${s}`);
  }
  return L.join('\n') + '\n';
}
module.exports = { openApp, loadExample, upload, tps2d, tps3d, expect };
