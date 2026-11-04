// 在頁面環境執行，只記錄事件類型、時間和影片 ID，不讀取帳號資料。
(() => {
  const emit = (type, data = {}) => {
    window.postMessage(
      { __ytRecorder: true, event: { at: Date.now(), type, ...data } },
      location.origin,
    );
  };

  const player = () => document.querySelector('#movie_player');
  const video = () => document.querySelector('video');
  const round = (n) => Math.round(n * 100) / 100;

  const snapshot = () => {
    const v = video();
    const p = player();
    return {
      url: new URLSearchParams(location.search).get('v'),
      path: location.pathname,
      playerVideoId: p?.getVideoData?.().video_id ?? null,
      playerState: p?.getPlayerState?.() ?? null,
      ct: v ? round(v.currentTime) : null,
      dur: v && Number.isFinite(v.duration) ? round(v.duration) : null,
      paused: v?.paused ?? null,
      readyState: v?.readyState ?? null,
      ad: p?.classList.contains('ad-showing') ?? false,
      interrupting: p?.classList.contains('ad-interrupting') ?? false,
      playerError:
        document
          .querySelector('.ytp-error-content-wrap-reason')
          ?.textContent.trim()
          .slice(0, 120) ?? null,
    };
  };

  const ids = new WeakMap();
  let nextId = 0;
  const identify = (el) => {
    if (!el) return null;
    if (!ids.has(el)) ids.set(el, ++nextId);
    return ids.get(el);
  };

  for (const type of [
    'yt-navigate-start',
    'yt-navigate-finish',
    'yt-page-data-updated',
    'yt-player-updated',
  ]) {
    window.addEventListener(type, () => emit(type, snapshot()));
  }
  document.addEventListener('fullscreenchange', () =>
    emit('fullscreenchange', { fullscreen: !!document.fullscreenElement }),
  );
  document.addEventListener('visibilitychange', () =>
    emit('visibilitychange', { hidden: document.hidden }),
  );

  const VIDEO_EVENTS = [
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
    'error',
  ];

  let wiredVideo = null;
  let wiredPlayer = null;
  let classObserver = null;
  let lastAd = '';
  let lastControls = null;

  const wire = () => {
    const v = video();
    if (v && v !== wiredVideo) {
      wiredVideo = v;
      emit('video-element', { element: identify(v), ...snapshot() });
      for (const type of VIDEO_EVENTS) {
        v.addEventListener(type, () =>
          emit(`video:${type}`, { element: identify(v), ...snapshot() }),
        );
      }
    }
    const p = player();
    if (p && p !== wiredPlayer) {
      wiredPlayer = p;
      emit('player-element', { element: identify(p) });
      classObserver?.disconnect();
      classObserver = new MutationObserver(() => {
        const key = `${p.classList.contains('ad-showing')}|${p.classList.contains('ad-interrupting')}`;
        if (key === lastAd) return;
        lastAd = key;
        emit('ad-class', snapshot());
      });
      classObserver.observe(p, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    const controls = identify(document.querySelector('.ytp-right-controls'));
    if (controls !== null && controls !== lastControls) {
      lastControls = controls;
      emit('controls-element', { element: controls });
    }
  };

  // 字幕請求：只留語言、類型和內容大小，不留簽名或 token。
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.name.includes('/api/timedtext')) continue;
      const q = new URL(entry.name).searchParams;
      emit('timedtext', {
        v: q.get('v'),
        lang: q.get('lang'),
        tlang: q.get('tlang'),
        kind: q.get('kind'),
        fmt: q.get('fmt'),
        hasPot: q.has('pot'),
        status: entry.responseStatus,
        bytes: entry.decodedBodySize,
        startedAgoMs: Math.round(performance.now() - entry.startTime),
        pageVideoId: snapshot().url,
        playerVideoId: snapshot().playerVideoId,
        ad: snapshot().ad,
      });
    }
  }).observe({ type: 'resource', buffered: true });

  // 量測 DOM 變動和長任務，只記數量。
  let mutations = 0;
  let callbacks = 0;
  new MutationObserver((list) => {
    callbacks += 1;
    mutations += list.length;
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  let longTaskCount = 0;
  let longTaskMs = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTaskCount += 1;
      longTaskMs += entry.duration;
    }
  }).observe({ type: 'longtask', buffered: true });

  setInterval(wire, 250);
  setInterval(() => {
    emit('sample', {
      domMutations: mutations,
      domCallbacks: callbacks,
      longTaskCount,
      longTaskMs: Math.round(longTaskMs),
      domNodes: document.getElementsByTagName('*').length,
      webdriver: navigator.webdriver,
      ...snapshot(),
    });
    mutations = 0;
    callbacks = 0;
    longTaskCount = 0;
    longTaskMs = 0;
  }, 5000);

  emit('page-load', snapshot());
})();
