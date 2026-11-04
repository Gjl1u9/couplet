/**
 * 錄製真實 YouTube 的事件序列，產生可回放的測試資料。
 *
 * 用已安裝的 Chrome 和全新的臨時 profile 執行，不載入擴充功能、不登入。
 *
 *   node tools/record-youtube.ts <scenario> <videoId> [seconds]
 *
 * scenario: watch | seeks | switch | midroll
 *
 * 已知限制：由 Playwright 啟動的瀏覽器會被 YouTube 判定為異常，約 50 秒後播放器報錯，
 * 字幕回應也是空的。錄到的資料不能當回放基準，也不要用隱藏自動化特徵的方式繞過。
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

type Payload = Record<string, unknown>;
interface RecordedEvent extends Payload {
  t: number;
  type: string;
}

const SAFE_CAPTION_PARAMS = ['lang', 'tlang', 'kind', 'fmt', 'hl', 'c'];
const SCENARIOS = ['watch', 'seeks', 'switch', 'midroll'] as const;
type Scenario = (typeof SCENARIOS)[number];

/** 在頁面內執行，只回傳事件類型和時間，不讀取任何帳號資料。 */
function installProbe(): void {
  if (window !== window.top) return;
  const emit = (window as unknown as Record<string, (e: Payload) => void>)
    .__record;
  if (!emit) return;

  interface Player extends Element {
    getVideoData?: () => { video_id?: string };
    getPlayerState?: () => number;
  }
  const player = () => document.querySelector<Player>('#movie_player');
  const video = () => document.querySelector('video');
  const adClass = () => {
    const c = player()?.classList;
    return {
      ad: c?.contains('ad-showing') ?? false,
      interrupting: c?.contains('ad-interrupting') ?? false,
    };
  };
  const snapshot = (): Payload => {
    const v = video();
    return {
      url: new URLSearchParams(location.search).get('v'),
      playerVideoId: player()?.getVideoData?.().video_id ?? null,
      ct: v ? Math.round(v.currentTime * 100) / 100 : null,
      dur:
        v && Number.isFinite(v.duration)
          ? Math.round(v.duration * 100) / 100
          : null,
      paused: v?.paused ?? null,
      readyState: v?.readyState ?? null,
      playerState: player()?.getPlayerState?.() ?? null,
      playerError:
        document
          .querySelector('.ytp-error-content-wrap-reason')
          ?.textContent.trim()
          .slice(0, 120) ?? null,
      ...adClass(),
    };
  };

  for (const type of [
    'yt-navigate-start',
    'yt-navigate-finish',
    'yt-page-data-updated',
    'yt-player-updated',
  ]) {
    window.addEventListener(type, () => {
      emit({ type, ...snapshot() });
    });
  }
  for (const type of ['pagehide', 'visibilitychange']) {
    window.addEventListener(type, () => {
      emit({ type, hidden: document.hidden });
    });
  }

  const videoEvents = [
    'loadstart',
    'loadedmetadata',
    'durationchange',
    'playing',
    'pause',
    'seeking',
    'seeked',
    'ended',
    'waiting',
    'emptied',
  ];
  const ids = new WeakMap<Element, number>();
  let nextId = 0;
  const identify = (el: Element | null) => {
    if (!el) return null;
    let id = ids.get(el);
    if (id === undefined) {
      id = ++nextId;
      ids.set(el, id);
    }
    return id;
  };
  let wiredVideo: HTMLVideoElement | null = null;
  let wiredPlayer: Element | null = null;
  let playerObserver: MutationObserver | null = null;
  let lastAd = '';
  let lastControls: number | null = null;

  const wire = () => {
    const v = video();
    if (v && v !== wiredVideo) {
      wiredVideo = v;
      emit({ type: 'video-element', videoElement: identify(v), ...snapshot() });
      for (const type of videoEvents) {
        v.addEventListener(type, () => {
          emit({
            type: `video:${type}`,
            videoElement: identify(v),
            ...snapshot(),
          });
        });
      }
    }
    const p = player();
    if (p && p !== wiredPlayer) {
      wiredPlayer = p;
      emit({ type: 'player-element', playerElement: identify(p) });
      playerObserver?.disconnect();
      playerObserver = new MutationObserver(() => {
        const state = adClass();
        const key = `${String(state.ad)}|${String(state.interrupting)}`;
        if (key === lastAd) return;
        lastAd = key;
        emit({ type: 'ad-class', ...snapshot() });
      });
      playerObserver.observe(p, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    const controls = identify(document.querySelector('.ytp-right-controls'));
    if (controls !== null && controls !== lastControls) {
      lastControls = controls;
      emit({ type: 'controls-element', controlsElement: controls });
    }
  };

  // 量測用：統計整頁 DOM 變動量，只記數量。
  let mutations = 0;
  let records = 0;
  new MutationObserver((list) => {
    records += 1;
    mutations += list.length;
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  let longTaskCount = 0;
  let longTaskMs = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount += 1;
        longTaskMs += entry.duration;
      }
    }).observe({ type: 'longtask' });
  } catch {
    // 瀏覽器不支援時略過。
  }

  setInterval(wire, 250);
  setInterval(() => {
    emit({
      type: 'sample',
      domMutations: mutations,
      domCallbacks: records,
      longTaskCount,
      longTaskMs: Math.round(longTaskMs),
      domNodes: document.getElementsByTagName('*').length,
      captionBytes: performance
        .getEntriesByType('resource')
        .filter((r) => r.name.includes('/api/timedtext'))
        .map((r) => (r as PerformanceResourceTiming).decodedBodySize),
      webdriver: navigator.webdriver,
      ...snapshot(),
    });
    mutations = 0;
    records = 0;
    longTaskCount = 0;
    longTaskMs = 0;
  }, 5000);
}

async function seek(page: Page, fraction: number): Promise<void> {
  await page.evaluate((f) => {
    interface SeekablePlayer extends Element {
      seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
    }
    const v = document.querySelector('video');
    const p = document.querySelector<SeekablePlayer>('#movie_player');
    if (v && Number.isFinite(v.duration)) p?.seekTo?.(v.duration * f, true);
  }, fraction);
}

async function waitForVideo(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const v = document.querySelector('video');
      return !!v && v.readyState > 0;
    },
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => {
    const v = document.querySelector('video');
    if (v) {
      v.muted = true;
      void v.play().catch(() => undefined);
    }
  });
}

async function clickNextVideo(
  page: Page,
  mark: (type: string, extra?: Payload) => void,
): Promise<void> {
  const link = page.locator('#secondary a[href*="/watch?v="]:visible').first();
  const href = await link.getAttribute('href', { timeout: 20_000 });
  const next = href
    ? new URL(href, 'https://www.youtube.com').searchParams.get('v')
    : null;
  mark('action:click-next', { target: next });
  await link.click({ timeout: 20_000 });
}

async function main(): Promise<void> {
  const [scenarioArg, videoId, secondsArg] = process.argv.slice(2);
  if (!SCENARIOS.includes(scenarioArg as Scenario) || !videoId) {
    throw new Error(
      '用法：node tools/record-youtube.ts <watch|seeks|switch|midroll> <videoId> [seconds]',
    );
  }
  const scenario = scenarioArg as Scenario;
  const seconds = Number(secondsArg ?? 90);

  const profile = await mkdtemp(join(tmpdir(), 'yt-recorder-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });

  const start = Date.now();
  const events: RecordedEvent[] = [];
  const mark = (type: string, extra: Payload = {}) => {
    events.push({ t: Date.now() - start, type, ...extra });
  };

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.exposeFunction('__record', (e: Payload) => {
      const { type, ...rest } = e;
      mark(typeof type === 'string' ? type : 'unknown', rest);
    });
    await page.addInitScript(installProbe);

    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname !== '/api/timedtext') return;
      const params: Payload = {};
      for (const key of SAFE_CAPTION_PARAMS) {
        const value = url.searchParams.get(key);
        if (value !== null) params[key] = value;
      }
      mark('timedtext:request', {
        ...params,
        hasPot: url.searchParams.has('pot'),
        v: url.searchParams.get('v'),
      });
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname !== '/api/timedtext') return;
      const status = response.status();
      const lang = url.searchParams.get('lang');
      void response
        .body()
        .then((body) => {
          mark('timedtext:response', {
            lang,
            status,
            bytes: body.length,
            contentLength: response.headers()['content-length'] ?? null,
          });
        })
        .catch(() => {
          mark('timedtext:response', { lang, status, bytes: null });
        });
    });

    mark('action:goto', { videoId });
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await waitForVideo(page);

    if (scenario === 'seeks') {
      await page.waitForTimeout(25_000);
      for (const f of [0.3, 0.6, 0.1, 0.9, 0.5]) {
        mark('action:seek', { fraction: f });
        await seek(page, f);
        await page.waitForTimeout(300);
      }
    } else if (scenario === 'midroll') {
      await page.waitForTimeout(25_000);
      mark('action:seek', { fraction: 0.5 });
      await seek(page, 0.5);
    } else if (scenario === 'switch') {
      await page.waitForTimeout(30_000);
      await clickNextVideo(page, mark);
      await page.waitForTimeout(30_000);
      await clickNextVideo(page, mark);
    }
    await page.waitForTimeout(seconds * 1000);
    mark('action:end');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }

  const adWindows = events.filter(
    (e) => e.type === 'ad-class' && e.ad === true,
  ).length;
  const stamp = new Date(start).toISOString().slice(0, 10);
  await mkdir('fixtures/youtube', { recursive: true });
  const file = `fixtures/youtube/${scenario}-${videoId}-${stamp}.json`;
  await writeFile(
    file,
    `${JSON.stringify({ scenario, videoId, recordedAt: stamp, durationMs: Date.now() - start, adWindows, events }, null, 1)}\n`,
  );
  console.log(
    `${file}: ${String(events.length)} events, ${String(adWindows)} ad windows`,
  );
}

await main();
