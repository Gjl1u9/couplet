// Renders a film in brand/video into a video, one exact frame at a time.
// Run with: node scripts/build-video.mjs [--film teaser|short] [--stills out-dir]
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const FPS = 30;
const FILMS = {
  // The 16:9 film for the store listing.
  teaser: {
    page: 'brand/video/teaser.html',
    output: 'brand/video/couplet-promo.mp4',
    size: { width: 1920, height: 1080 },
    stills: [
      0.9, 2.6, 4.2, 7.6, 12.8, 16.1, 16.9, 17.5, 18.5, 20.7, 21.15, 22.5, 23.4,
      24.8, 26.4, 27.6, 29.2, 30.8, 32.3, 35,
    ],
  },
  // The upright film for Shorts, Reels, and TikTok, with the real Popup and Dashboard.
  short: {
    page: 'brand/video/short.html',
    output: 'brand/video/couplet-short.mp4',
    size: { width: 1080, height: 1920 },
    stills: [
      0, 1.5, 3, 5.5, 6.1, 7.2, 9.8, 10.8, 11.8, 13.5, 14.3, 15.0, 15.7, 16.2,
      17.0, 18.0, 19.1, 20.5, 22.0, 23.2, 24.2, 25.4, 27.5, 28.8, 30.5,
    ],
  },
};

const argument = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const film = FILMS[argument('--film') ?? 'teaser'];
if (!film)
  throw new Error(
    `Unknown film. Choose one of: ${Object.keys(FILMS).join(', ')}`,
  );
const stillsFolder = argument('--stills');

// The short's pages load the real React components, bundled from short-ui.tsx.
await build({
  entryPoints: ['brand/video/short-ui.tsx'],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: 'dist/video/short-ui.js',
  logLevel: 'warning',
});

// Served over HTTP, so the film can reach into its frames, which file:// forbids.
const ROOT = resolve('.');
const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};
const server = createServer((request, response) => {
  const path = normalize(
    join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname)),
  );
  if (!path.startsWith(ROOT + sep)) {
    response.writeHead(403).end();
    return;
  }
  readFile(path).then(
    (body) => {
      response.writeHead(200, {
        'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      });
      response.end(body);
    },
    () => {
      response.writeHead(404).end();
    },
  );
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: film.size,
    deviceScaleFactor: 1,
  });
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('requestfailed', (request) => failures.push(request.url()));
  await page.goto(`http://127.0.0.1:${String(port)}/${film.page}`);
  await page.evaluate(() => window.ready);
  const duration = await page.evaluate(() => window.DURATION);

  const frameAt = async (time, options = {}) => {
    await page.evaluate((t) => {
      window.render(t);
    }, time);
    return page.screenshot({ type: 'jpeg', quality: 100, ...options });
  };

  if (stillsFolder) {
    await mkdir(stillsFolder, { recursive: true });
    for (const time of film.stills) {
      await frameAt(time, {
        path: join(stillsFolder, `t${time.toFixed(2)}.jpg`),
      });
    }
  } else {
    await mkdir(dirname(film.output), { recursive: true });
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
        film.output,
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
    console.log(`${film.output}: ${String(frames)} frames`);
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
} finally {
  await browser.close();
  server.close();
}
