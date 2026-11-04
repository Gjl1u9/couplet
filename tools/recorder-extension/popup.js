const statusEl = document.querySelector('#status');

const load = async () => {
  const all = await chrome.storage.local.get(null);
  const sessions = Object.entries(all)
    .filter(([k]) => k.startsWith('session:'))
    .map(([id, events]) => ({ id, events }));
  sessions.sort((a, b) => a.id.localeCompare(b.id));
  return sessions;
};

const render = async () => {
  const sessions = await load();
  const events = sessions.flatMap((s) => s.events);
  const ads = events.filter((e) => e.type === 'ad-class' && e.ad).length;
  statusEl.textContent = `${String(sessions.length)} 次頁面載入，${String(events.length)} 個事件，${String(ads)} 次廣告`;
};

document.querySelector('#export').addEventListener('click', () => {
  void load().then((sessions) => {
    const data = JSON.stringify({ version: 1, sessions });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([data], { type: 'application/json' }),
    );
    link.download = `youtube-events-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.json`;
    link.click();
  });
});

document.querySelector('#clear').addEventListener('click', () => {
  void chrome.storage.local.clear().then(render);
});

void render();
