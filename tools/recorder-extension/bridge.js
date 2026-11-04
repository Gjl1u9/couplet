// 把頁面事件存進擴充功能的本機儲存，每次頁面載入一筆。
(() => {
  const key = `session:${String(Date.now())}:${Math.random().toString(36).slice(2, 8)}`;
  let events = [];
  let dirty = false;

  window.addEventListener('message', (message) => {
    if (message.source !== window || !message.data?.__ytRecorder) return;
    events.push(message.data.event);
    dirty = true;
  });

  const flush = () => {
    if (!dirty) return;
    dirty = false;
    chrome.storage.local.set({ [key]: events });
  };

  setInterval(flush, 2000);
  window.addEventListener('pagehide', flush);
})();
