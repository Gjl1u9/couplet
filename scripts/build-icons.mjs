// Renders brand/*.svg into the PNG sizes the manifest needs.
// Run with: node scripts/build-icons.mjs
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const OUT = 'public/icon';

const jobs = [
  { source: 'brand/toolbar.svg', sizes: [16, 32, 48] },
  { source: 'brand/store.svg', sizes: [128] },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { source, sizes } of jobs) {
    const svg = await readFile(source, 'utf8');
    for (const size of sizes) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      await page.screenshot({
        path: `${OUT}/${size}.png`,
        omitBackground: true,
        clip: { x: 0, y: 0, width: size, height: size },
      });
      await page.close();
      console.log(`${OUT}/${size}.png`);
    }
  }
} finally {
  await browser.close();
}
