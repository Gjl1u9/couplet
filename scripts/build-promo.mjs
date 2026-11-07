// Renders brand/promo.html into the Chrome Web Store promo images.
// Run with: node scripts/build-promo.mjs
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const jobs = [
  { selector: '#small', file: 'store/promo-small.jpg', size: [440, 280] },
  { selector: '#marquee', file: 'store/promo-marquee.jpg', size: [1400, 560] },
];

await mkdir('store', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(resolve('brand/promo.html')).href);
  await page.evaluate(() => document.fonts.ready);
  for (const { selector, file, size } of jobs) {
    const box = await page.locator(selector).boundingBox();
    if (
      !box ||
      Math.round(box.width) !== size[0] ||
      Math.round(box.height) !== size[1]
    ) {
      throw new Error(`${selector} is not ${size.join('x')}`);
    }
    await page.locator(selector).screenshot({
      path: file,
      type: 'jpeg',
      quality: 92,
    });
    console.log(file);
  }
} finally {
  await browser.close();
}
