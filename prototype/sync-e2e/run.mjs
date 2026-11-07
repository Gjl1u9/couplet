import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { createBackend, attach } from './mock-backend.mjs';
// Two real browser profiles against a stand-in for the API. Run `npx wxt build` first, then:
// PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node prototype/sync-e2e/run.mjs
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const S = tmpdir();
const ext = resolve('dist/chrome-mv3');
const backend = createBackend();
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : ''));
  if (!cond) fails++;
};
const dev = async (user) => {
  const ctx = await chromium.launchPersistentContext(
    mkdtempSync(join(S, 'sync-e2e-')),
    {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
      viewport: { width: 1100, height: 600 },
    },
  );
  const box = { user };
  await attach(ctx, backend, () => box.user);
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  const url = `chrome-extension://${id}/dashboard.html`;
  await p.goto(url);
  const send = (m) => p.evaluate((m) => chrome.runtime.sendMessage(m), m);
  const voc = async (command) => {
    const r = await send({ type: 'vocabulary', command });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const signIn = async (u) => {
    box.user = u;
    await p.evaluate(async (u) => {
      const b = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const access_token = `${b({ alg: 'HS256' })}.${b({ exp, sub: u })}.sig`;
      await chrome.storage.local.set({
        'auth-session': JSON.stringify({
          access_token,
          refresh_token: 'r',
          expires_at: exp,
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: u,
            email: u + '@example.com',
            aud: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-01-01',
          },
        }),
      });
    }, u);
  };
  return {
    ctx,
    p,
    sw,
    id,
    url,
    send,
    voc,
    signIn,
    errs,
    sync: () => send({ type: 'sync', command: 'sync-now' }),
    box,
  };
};
const input = (lemma, line = 'line') => ({
  entry: {
    lemma,
    phonetic: null,
    senses: [{ meaning: 'm', example: 'e', translation: 't' }],
  },
  source: 'en',
  target: 'zh-TW',
  cues: [{ original: line, startMs: 0 }],
  currentCue: 0,
  form: lemma,
  formOffset: 0,
  origin: { site: 'youtube', videoId: 'v', title: 'T' },
});
const lemmas = async (d) =>
  (await d.voc({ op: 'list' })).map((w) => w.lemma).sort();
const canon = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canon).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => k + ':' + canon(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const A = await dev('u1'),
  B = await dev('u1');
await A.signIn('u1');
await A.send({ type: 'sync', command: 'ready' });
const saved = await A.voc({ op: 'save', input: input('bank', 'one') });
await A.sync();
ok('word reaches the cloud', backend.u('u1').words.has('en:bank'));
await A.voc({
  op: 'grade',
  wordId: 'en:bank',
  encounterId: saved.encounters[0].id,
  grade: 'good',
});
await A.sync();
ok('review reaches the cloud', backend.u('u1').events.size === 1);
await B.signIn('u1');
await B.p.reload();
await B.p.waitForTimeout(1500);
ok(
  'second device shows the word after sign-in',
  (await B.p.locator('body').innerText()).includes('bank'),
);
ok(
  'second device has the review',
  (await B.voc({ op: 'reviewLog' })).length === 1,
);
// Offline on both, conflicting writes, real IndexedDB.
backend.setDown(true);
await A.voc({ op: 'save', input: input('bank', 'two') });
await B.voc({ op: 'save', input: input('bank', 'three') });
await A.voc({ op: 'save', input: input('send', 'x') });
await A.sync();
ok('offline keeps working', (await lemmas(A)).join() === 'bank,send');
ok(
  'offline status shown',
  (await A.p.evaluate(
    async () => (await chrome.storage.local.get('syncStatus')).syncStatus.state,
  )) === 'offline',
);
backend.setDown(false);
for (const d of [A, B, A, B]) await d.sync();
await A.p.waitForTimeout(6000);
for (const d of [A, B, A, B]) await d.sync();
const wa = (await A.voc({ op: 'list' })).find((w) => w.lemma === 'bank'),
  wb = (await B.voc({ op: 'list' })).find((w) => w.lemma === 'bank');
ok(
  'both devices merge offline sentences',
  wa.encounters.length === 3 && canon(wa.encounters) === canon(wb.encounters),
  canon(wa.encounters) === canon(wb.encounters)
    ? 'translations ' +
        wa.encounters
          .map((e) => (e.translation === null ? 'none' : 'set'))
          .join()
    : 'A ' +
        wa.encounters
          .map((e) => e.cues[0].original + '=' + e.translation)
          .join('|') +
        ' B ' +
        wb.encounters
          .map((e) => e.cues[0].original + '=' + e.translation)
          .join('|'),
);
const rev = backend.u('u1').words.get('en:bank').rev;
for (const d of [A, B]) await d.sync();
ok(
  'no endless resend (jsonb key order)',
  backend.u('u1').words.get('en:bank').rev === rev,
  'rev ' + rev,
);
// Delete vs offline grade.
await B.voc({ op: 'remove', wordId: 'en:send' });
await B.sync();
backend.setDown(true);
await A.voc({
  op: 'grade',
  wordId: 'en:send',
  encounterId: (await A.voc({ op: 'list' })).find((w) => w.lemma === 'send')
    .encounters[0].id,
  grade: 'good',
});
backend.setDown(false);
for (const d of [A, B, A]) await d.sync();
ok(
  'delete beats an offline grade',
  !(await lemmas(A)).includes('send') && !(await lemmas(B)).includes('send'),
);
ok(
  'deleted word has no review in the cloud',
  ![...backend.u('u1').events.values()].some((e) => e.word_id === 'en:send'),
);
// Re-save after seeing the delete.
await A.voc({ op: 'save', input: input('send', 'again') });
await A.sync();
await B.sync();
ok(
  're-save survives, from level 0',
  (await B.voc({ op: 'list' })).find((w) => w.lemma === 'send')?.review
    .level === 0,
);
// Background killed with unsent work: IndexedDB must keep the outbox.
backend.setDown(true);
await A.voc({ op: 'save', input: input('kept', 'k') });
const cdp = await A.ctx
  .browser()
  ?.newBrowserCDPSession?.()
  .catch(() => null);
const page = await A.ctx.newCDPSession(A.p);
await page.send('ServiceWorker.enable').catch(() => {});
await page.send('ServiceWorker.stopAllWorkers').catch(() => {});
await A.p.waitForTimeout(800);
backend.setDown(false);
ok('word survives the background stopping', (await lemmas(A)).includes('kept'));
await A.sync();
ok('unsent word sends after a restart', backend.u('u1').words.has('en:kept'));
// Accounts.
await A.signIn('u2');
await A.p.waitForTimeout(300);
ok('another account sees none of these words', (await lemmas(A)).length === 0);
await A.voc({ op: 'save', input: input('other') });
await A.sync();
ok(
  'accounts stay apart in the cloud',
  !backend.u('u1').words.has('en:other') &&
    backend.u('u2').words.has('en:other'),
);
await A.signIn('u1');
await A.p.waitForTimeout(300);
ok(
  'first account returns intact',
  (await lemmas(A)).includes('bank') && !(await lemmas(A)).includes('other'),
);
// Sign out with unsent work.
backend.setDown(true);
await A.voc({ op: 'save', input: input('late') });
await A.send({ type: 'auth', command: 'sign-out' }).catch(() => {});
await A.p.goto(A.url);
await A.p.waitForTimeout(700);
ok(
  'sign-out shows the sign-in page and the unsent note',
  (await A.p.locator('body').innerText()).includes(
    "Some changes haven't synced",
  ),
);
backend.setDown(false);
await A.signIn('u1');
await A.p.reload();
await A.p.waitForTimeout(1500);
await A.sync();
ok(
  'unsent work sends after signing back in',
  backend.u('u1').words.has('en:late'),
);
ok(
  'no page errors',
  A.errs.length + B.errs.length === 0,
  JSON.stringify([...A.errs, ...B.errs]).slice(0, 200),
);
await A.ctx.close();
await B.ctx.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASSED');
