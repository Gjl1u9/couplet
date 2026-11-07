// Renders brand/video/teaser.html into a video, one exact frame at a time.
// Run with: node scripts/build-video.mjs [--stills out-dir]
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const FPS = 30;
const OUTPUT = 'brand/video/couplet-promo.mp4';
const stillsAt = process.argv.indexOf('--stills');
const STILL_TIMES = [
  0.9, 2.6, 4.2, 7.6, 12.8, 16.1, 16.9, 17.5, 18.5, 20.7, 21.15, 22.5, 23.4,
  24.8, 26.4, 27.6, 29.2, 30.8, 32.3, 35,
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('requestfailed', (request) => failures.push(request.url()));
  await page.goto(pathToFileURL(resolve('brand/video/teaser.html')).href);
  await page.evaluate(() => window.ready);
  const duration = await page.evaluate(() => window.DURATION);

  const frameAt = async (time, options = {}) => {
    await page.evaluate((t) => {
      window.render(t);
    }, time);
    return page.screenshot({ type: 'jpeg', quality: 100, ...options });
  };

  if (stillsAt >= 0) {
    const folder = process.argv[stillsAt + 1];
    await mkdir(folder, { recursive: true });
    for (const time of STILL_TIMES) {
      await frameAt(time, { path: join(folder, `t${time.toFixed(2)}.jpg`) });
    }
  } else {
    await mkdir(dirname(OUTPUT), { recursive: true });
    const encoder = spawn(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-framerate',
        String(FPS),
        '-c:v',
        'mjpeg',
        '-i',
        '-',
        // Screenshots are full range; players expect video range, or colours shift.
        '-vf',
        'scale=in_range=pc:out_range=tv,format=yuv420p',
        '-color_range',
        'tv',
        '-colorspace',
        'bt709',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '16',
        '-movflags',
        '+faststart',
        OUTPUT,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const frames = Math.round(duration * FPS);
    for (let frame = 0; frame < frames; frame += 1) {
      const image = await frameAt(frame / FPS);
      if (!encoder.stdin.write(image)) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end();
    const [code] = await once(encoder, 'close');
    if (code !== 0) throw new Error(`ffmpeg exited with ${String(code)}`);
    console.log(`${OUTPUT}: ${String(frames)} frames`);
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
} finally {
  await browser.close();
}
