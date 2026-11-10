import {
  answerFrequencyMessage,
  isFrequencyMessage,
} from '../lib/hints/frequency';
import { createAuth, unexpiredToken } from '../lib/auth/auth';
import {
  answerAuthMessage,
  AUTH_STORAGE_KEY,
  isAuthMessage,
} from '../lib/auth/messages';
import { createSupabase } from '../lib/auth/supabase';
import { LOOKUP_PORT, servePortLookup } from '../lib/lookup/port';
import {
  createProxyLookup,
  isLookupWarmMessage,
  warmLookup,
} from '../lib/lookup/proxy';
import { createGoogleTranslate } from '../lib/translation/google';
import { TRANSLATE_PORT } from '../lib/translation/messages';
import { servePortTranslate } from '../lib/translation/port';
import {
  answerVocabularyMessage,
  createVocabularyService,
  isVocabularyMessage,
} from '../lib/vocabulary/service';
import {
  answerExplainMessage,
  createProxyExplain,
  isExplainMessage,
} from '../lib/lookup/explain';
import { createAccountSync } from '../lib/sync/account-sync';
import { LEGACY_LOG_KEY, LEGACY_WORDS_KEY } from '../lib/sync/legacy';
import {
  answerSyncMessage,
  isSyncMessage,
  SYNC_STATUS_KEY,
  VOCABULARY_REVISION_KEY,
} from '../lib/sync/messages';
import { createSupabaseRemote } from '../lib/sync/remote';
import { openIndexedDbStore } from '../lib/sync/store';
import { DASHBOARD_PATH, isOpenDashboardMessage } from '../lib/dashboard/open';

const SYNC_ALARM = 'sync';

export default defineBackground(() => {
  const { local } = browser.storage;
  const supabase = createSupabase();
  const auth = createAuth({
    backend: supabase.auth,
    launch: (url) =>
      browser.identity.launchWebAuthFlow({ url, interactive: true }),
    redirectUrl: () => browser.identity.getRedirectURL(),
  });
  const deviceId = async () => {
    const stored = (await local.get('deviceId')).deviceId;
    if (typeof stored === 'string') return stored;
    const created = crypto.randomUUID();
    await local.set({ deviceId: created });
    return created;
  };
  let revision = Date.now();
  const sync = createAccountSync({
    userId: () => auth.userId(),
    openStore: openIndexedDbStore,
    remote: createSupabaseRemote(supabase),
    deviceId,
    legacy: {
      read: async () => {
        const items = await local.get([LEGACY_WORDS_KEY, LEGACY_LOG_KEY]);
        return { words: items[LEGACY_WORDS_KEY], log: items[LEGACY_LOG_KEY] };
      },
      remove: () =>
        local.remove([LEGACY_WORDS_KEY, LEGACY_LOG_KEY, 'vocabularySchema']),
    },
    notify: () => {
      revision += 1;
      void local.set({ [VOCABULARY_REVISION_KEY]: revision });
    },
    onStatus: (status) => {
      void local.set({ [SYNC_STATUS_KEY]: status });
    },
    onError: (error) => {
      console.warn('[dual-subtitles] 同步失敗', error);
    },
  });
  // What pages ask for: sync follows sign-in, and gets a last chance before sign-out.
  const accountAuth: typeof auth = {
    ...auth,
    signIn: async () => {
      const account = await auth.signIn();
      if (account) await sync.signedIn();
      return account;
    },
    signOut: async () => {
      await sync.signingOut();
      await auth.signOut();
      sync.signedOut();
    },
  };
  const handleVocabulary = createVocabularyService({
    vocabulary: sync.vocabulary,
    createTranslate: (languages) => createGoogleTranslate(languages),
    onError: (message, error) => {
      console.warn(`[dual-subtitles] ${message}`, error);
    },
  });
  const openDashboard = () => {
    void browser.tabs.create({ url: browser.runtime.getURL(DASHBOARD_PATH) });
  };

  // Lookups need no account, so one never waits for a token refresh. It goes out without
  // the account, and the refresh runs for the next one.
  const lookupToken = async () => {
    const stored = (await local.get(AUTH_STORAGE_KEY))[AUTH_STORAGE_KEY];
    const token = unexpiredToken(stored, Date.now());
    if (!token && stored !== undefined)
      void auth.accessToken().catch(() => null);
    return token;
  };

  const explain = createProxyExplain({
    accessToken: () => auth.accessToken(),
  });

  // Only a new install: an update or a browser restart must not open a tab.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== 'install') return;
    void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
  });

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse: (response: unknown) => void) => {
      if (sender.id !== browser.runtime.id) return undefined;
      if (isLookupWarmMessage(message)) {
        void warmLookup();
        void lookupToken();
        return undefined;
      }
      if (isOpenDashboardMessage(message)) {
        openDashboard();
        return undefined;
      }
      if (isAuthMessage(message)) {
        answerAuthMessage(message, accountAuth, sendResponse);
        return true;
      }
      if (isExplainMessage(message)) {
        answerExplainMessage(message, explain, sendResponse);
        return true;
      }
      if (isSyncMessage(message)) {
        answerSyncMessage(message, sync, sendResponse);
        return true;
      }
      if (isFrequencyMessage(message)) {
        answerFrequencyMessage(
          message,
          async (path) =>
            (await fetch(browser.runtime.getURL(path as '/'))).text(),
          sendResponse,
        );
        return true;
      }
      if (!isVocabularyMessage(message)) return undefined;
      answerVocabularyMessage(message, handleVocabulary, sendResponse);
      // Tells the browser the answer comes later.
      return true;
    },
  );

  void browser.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) void sync.syncNow();
  });
  void sync.syncNow();

  browser.runtime.onConnect.addListener((port) => {
    if (port.sender?.id !== browser.runtime.id) return;
    if (port.name === TRANSLATE_PORT) {
      servePortTranslate(port, (languages) => createGoogleTranslate(languages));
    } else if (port.name === LOOKUP_PORT) {
      servePortLookup(
        port,
        createProxyLookup({
          accessToken: lookupToken,
          installId: deviceId,
        }),
      );
    }
  });

  if (import.meta.env.MODE === 'development') {
    browser.runtime.onMessage.addListener((message: unknown, sender) => {
      if (
        sender.id === browser.runtime.id &&
        (message as { type?: string } | null)?.type === 'dev-reload'
      ) {
        browser.runtime.reload();
      }
    });
  }
});
