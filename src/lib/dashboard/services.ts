import {
  AUTH_STORAGE_KEY,
  createAuthClient,
  type AuthClient,
} from '../auth/messages';
import {
  createSyncClient,
  SYNC_STATUS_KEY,
  VOCABULARY_REVISION_KEY,
  type SyncClient,
} from '../sync/messages';
import {
  createExplainClient,
  type ExplainInput,
  type Explanation,
} from '../lookup/explain';
import type { SyncStatus } from '../sync/account-sync';
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type Settings,
} from '../settings/settings';
import {
  createGradeSounds,
  createSaveSound,
  type GradeSoundName,
} from '../ui/sound';
import { createSpeaker, type Speaker } from '../ui/speech';
import {
  createVocabularyClient,
  type VocabularyClient,
} from '../vocabulary/service';

/** What the pages need from the extension, so tests can replace it. */
export interface DashboardServices {
  readonly vocabulary: VocabularyClient;
  readonly auth: AuthClient;
  readonly sync: SyncClient;
  readonly syncStatus: () => Promise<SyncStatus | null>;
  readonly onSyncStatus: (listener: () => void) => () => void;
  /** Calls back when another page signs in or out. Returns how to stop. */
  readonly onAccountChange: (listener: () => void) => () => void;
  readonly speaker: Speaker;
  readonly settings: () => Promise<Settings>;
  readonly saveSettings: (settings: Settings) => Promise<void>;
  /** Calls back when a video tab changes the settings. Returns how to stop. */
  readonly onSettingsChange: (listener: () => void) => () => void;
  readonly previewSaveSound: () => void;
  /** A Review answer's sound. The page checks the Sounds setting. */
  readonly playGradeSound: (grade: GradeSoundName) => void;
  readonly explain: (input: ExplainInput) => Promise<Explanation>;
  /** Calls back when another page changes the Vocabulary. Returns how to stop. */
  readonly onVocabularyChange: (listener: () => void) => () => void;
}

export function createDashboardServices(): DashboardServices {
  const saveSound = createSaveSound();
  const gradeSounds = createGradeSounds();
  return {
    vocabulary: createVocabularyClient((message) =>
      browser.runtime.sendMessage(message),
    ),
    auth: createAuthClient((message) => browser.runtime.sendMessage(message)),
    sync: createSyncClient((message) => browser.runtime.sendMessage(message)),
    syncStatus: async () =>
      ((await browser.storage.local.get(SYNC_STATUS_KEY))[SYNC_STATUS_KEY] as
        SyncStatus | undefined) ?? null,
    onSyncStatus: (listener) => {
      const onChanged = (changes: Record<string, unknown>) => {
        if (SYNC_STATUS_KEY in changes) listener();
      };
      browser.storage.local.onChanged.addListener(onChanged);
      return () => {
        browser.storage.local.onChanged.removeListener(onChanged);
      };
    },
    onAccountChange: (listener) => {
      const onChanged = (changes: Record<string, unknown>) => {
        if (AUTH_STORAGE_KEY in changes) listener();
      };
      browser.storage.local.onChanged.addListener(onChanged);
      return () => {
        browser.storage.local.onChanged.removeListener(onChanged);
      };
    },
    speaker: createSpeaker(),
    settings: () =>
      loadSettings(browser.storage.local, defaultSettings(navigator.language)),
    saveSettings: (settings) => saveSettings(browser.storage.local, settings),
    onSettingsChange: (listener) => {
      const onChanged = (changes: Record<string, unknown>) => {
        if ('settings' in changes) listener();
      };
      browser.storage.local.onChanged.addListener(onChanged);
      return () => {
        browser.storage.local.onChanged.removeListener(onChanged);
      };
    },
    explain: createExplainClient((message) =>
      browser.runtime.sendMessage(message),
    ),
    previewSaveSound: () => {
      saveSound.play();
    },
    playGradeSound: (grade) => {
      gradeSounds.play(grade);
    },
    onVocabularyChange: (listener) => {
      const onChanged = (changes: Record<string, unknown>) => {
        if (VOCABULARY_REVISION_KEY in changes) listener();
      };
      browser.storage.local.onChanged.addListener(onChanged);
      return () => {
        browser.storage.local.onChanged.removeListener(onChanged);
      };
    },
  };
}
