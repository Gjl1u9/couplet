import { sameLanguage } from '../lib/language';
import {
  createCachedLookup,
  createPortLookup,
  LOOKUP_PORT,
} from '../lib/lookup/port';
import {
  createSettingsStore,
  defaultSettings,
  type Settings,
} from '../lib/settings/settings';
import { createSubtitleController } from '../lib/subtitles/controller';
import { createOverlay } from '../lib/subtitles/overlay';
import { createLookupPanel } from '../lib/ui/lookup-panel';
import { createSettingsPanel } from '../lib/ui/settings-panel';
import { createSaveSound } from '../lib/ui/sound';
import { createSpeaker } from '../lib/ui/speech';
import { OPEN_DASHBOARD_MESSAGE } from '../lib/dashboard/open';
import type { WordEntry, WordInCue } from '../lib/lookup/types';
import { createVocabularyClient } from '../lib/vocabulary/service';
import {
  markedForms,
  normalizeForm,
  type EncounterInput,
  type SavedWord,
} from '../lib/vocabulary/vocabulary';
import { currentVideoOrigin } from '../lib/youtube/origin';
import { createPortTranslate } from '../lib/translation/port';
import { TRANSLATE_PORT } from '../lib/translation/messages';
import { parseBridgeMessage, toBridgeCommand } from '../lib/youtube/bridge';
import { AUTH_STORAGE_KEY, createAuthClient } from '../lib/auth/messages';
import { VOCABULARY_REVISION_KEY } from '../lib/sync/messages';
import { createSignInToast } from '../lib/ui/sign-in-toast';

const PLAYBACK_EVENTS = [
  'timeupdate',
  'seeked',
  'playing',
  'pause',
  'ratechange',
];

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  main() {
    const mainVideo = () =>
      document.querySelector<HTMLVideoElement>(
        '#movie_player video.html5-main-video',
      );
    const warn = (message: string, error: unknown) => {
      console.warn(`[dual-subtitles] ${message}`, error);
    };
    const settings = createSettingsStore(
      browser.storage.local,
      defaultSettings(navigator.language),
      (error) => {
        warn('設定讀寫失敗', error);
      },
    );
    const overlay = createOverlay({
      sourceLanguage: () => controller.sourceLanguage(),
      expectsTranslation: () => controller.expectsTranslation(),
      isMarked: (token) => isSavedForm(token),
      onToken: (cue, element) => {
        // Selecting first moves the strip, so the panel is placed against its final spot.
        overlay.selectToken(element);
        lookupPanel.toggle(cue, element);
      },
      // The cue must not change under the pointer while a selection is being dragged.
      onSelectionStart: () => {
        const video = mainVideo();
        if (video && !video.paused) {
          pausedByLookup = true;
          video.pause();
        }
      },
      onSelection: (cue, anchor) => {
        overlay.selectToken(anchor);
        lookupPanel.showSelection(cue, anchor);
      },
      onSelectionCancel: () => {
        if (!lookupPanel.isOpen()) resumeIfPausedByLookup();
      },
      onMoveStart: () => {
        lookupPanel.close();
        settingsPanel.close();
      },
      onMove: (subtitlePosition) => {
        settings.update({ subtitlePosition });
      },
      onContextToggle: (showContext) => {
        lookupPanel.close();
        settings.update({ showContext });
      },
    });
    /** Only playback we paused ourselves resumes when the panel closes. */
    let pausedByLookup = false;
    const resumeIfPausedByLookup = () => {
      const video = mainVideo();
      if (pausedByLookup && video?.paused) {
        video.play().catch((error: unknown) => {
          warn('無法繼續播放', error);
        });
      }
      pausedByLookup = false;
    };
    let boundaryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const controller = createSubtitleController({
      targetLanguage: settings.get().nativeLanguage,
      createTranslate: (source) =>
        createPortTranslate(
          { source, target: settings.get().nativeLanguage },
          () => browser.runtime.connect({ name: TRANSLATE_PORT }),
        ),
      getTime: () => mainVideo()?.currentTime ?? 0,
      render: overlay.render,
      setNativeCaptionsHidden: overlay.setNativeCaptionsHidden,
      onError: warn,
    });

    const lookup = createCachedLookup(
      createPortLookup(() => browser.runtime.connect({ name: LOOKUP_PORT })),
    );
    const sourceLanguage = () =>
      controller.sourceLanguage() ?? settings.get().learningLanguage;
    const lookupLanguages = () => ({
      source: sourceLanguage(),
      target: settings.get().nativeLanguage,
    });
    const neverAborted = new AbortController().signal;
    const vocabulary = createVocabularyClient((message) =>
      browser.runtime.sendMessage(message),
    );

    /** What a save records: the cue, its neighbours, and where to find it again. */
    const encounterInput = (
      entry: WordEntry,
      cue: WordInCue,
    ): EncounterInput => {
      const { source, target } = lookupLanguages();
      const context = controller.contextOf(cue.sentence);
      return {
        entry,
        source,
        target,
        cues: context?.cues ?? [{ original: cue.sentence, startMs: null }],
        currentCue: context?.currentCue ?? 0,
        form: cue.word,
        formOffset: cue.offset,
        origin: currentVideoOrigin(location.href, document),
      };
    };

    let savedWords: readonly SavedWord[] = [];
    let marks: { language: string; forms: ReadonlySet<string> } | null = null;
    const isSavedForm = (token: string) => {
      const language = sourceLanguage();
      if (marks?.language !== language) {
        marks = { language, forms: markedForms(savedWords, language) };
      }
      return marks.forms.has(normalizeForm(token));
    };
    const reloadMarks = () => {
      vocabulary.list().then(
        (words) => {
          savedWords = words;
          marks = null;
          overlay.refreshMarks();
        },
        (error: unknown) => {
          warn('單字庫讀取失敗', error);
        },
      );
    };
    reloadMarks();
    browser.storage.local.onChanged.addListener((changes) => {
      if (VOCABULARY_REVISION_KEY in changes) reloadMarks();
    });

    const auth = createAuthClient((message) =>
      browser.runtime.sendMessage(message),
    );
    const signInToast = createSignInToast({
      layer: () => overlay.panelLayer(),
      isSignedIn: async () => (await auth.account()) !== null,
      signIn: async () => (await auth.signIn()) !== null,
    });
    browser.storage.local.onChanged.addListener((changes) => {
      if (AUTH_STORAGE_KEY in changes) signInToast.recheck();
    });

    const saveSound = createSaveSound();
    const lookupPanel = createLookupPanel({
      layer: () => overlay.panelLayer(),
      lookUp: (word) => lookup.lookUp(word, lookupLanguages(), neverAborted),
      translateSelection: async (text) => {
        const languages = lookupLanguages();
        if (sameLanguage(languages.source, languages.target)) return null;
        const translate = createPortTranslate(languages, () =>
          browser.runtime.connect({ name: TRANSLATE_PORT }),
        );
        const [translation] = await translate([text], neverAborted);
        return translation ?? null;
      },
      isSaved: (entry) => vocabulary.has(entry.lemma, sourceLanguage()),
      beforeSave: () => signInToast.require(),
      keepsOpen: (path) =>
        path.some(
          (target) =>
            target instanceof Element &&
            target.classList.contains('sign-in-toast'),
        ),
      setSaved: async (entry, cue, saved) => {
        try {
          if (saved) await vocabulary.save(encounterInput(entry, cue));
          else await vocabulary.removeByLemma(entry.lemma, sourceLanguage());
        } catch (error) {
          warn('收藏失敗', error);
          throw error;
        }
      },
      sourceLanguage,
      theme: () => settings.get().panelTheme,
      speaker: createSpeaker(),
      onSaved: () => {
        if (settings.get().saveSound) saveSound.play();
      },
      onSeenAgain: (entry, cue) => {
        vocabulary
          .addEncounter(encounterInput(entry, cue))
          .catch((error: unknown) => {
            warn('新句子記錄失敗', error);
          });
      },
      onOpen: () => {
        settingsPanel.close();
        const video = mainVideo();
        if (settings.get().pauseOnLookup && video && !video.paused) {
          pausedByLookup = true;
          video.pause();
        }
      },
      onClose: () => {
        overlay.selectToken(null);
        resumeIfPausedByLookup();
      },
    });

    let trackAvailable: boolean | null = null;
    const settingsPanel = createSettingsPanel({
      layer: () => overlay.panelLayer(),
      getSettings: () => settings.get(),
      update: (patch) => {
        settings.update(patch);
      },
      trackAvailable: () => trackAvailable,
      previewSaveSound: () => {
        saveSound.play();
      },
      openDashboard: () => {
        void browser.runtime.sendMessage(OPEN_DASHBOARD_MESSAGE);
      },
      onOpen: () => {
        lookupPanel.close();
      },
    });

    /** The page agent loads no track while the extension is off. */
    let postedLanguage: string | null = null;
    const syncLearningLanguage = () => {
      const { enabled, learningLanguage } = settings.get();
      if (!enabled) return;
      if (learningLanguage !== postedLanguage) {
        if (postedLanguage !== null) {
          lookupPanel.close();
          controller.resetCaptions();
          trackAvailable = null;
        }
        postedLanguage = learningLanguage;
      }
      window.postMessage(
        toBridgeCommand({
          type: 'set-learning-language',
          language: learningLanguage,
        }),
        location.origin,
      );
    };

    let appliedNative = settings.get().nativeLanguage;
    const applySettings = (next: Settings) => {
      if (next.nativeLanguage !== appliedNative) {
        appliedNative = next.nativeLanguage;
        lookupPanel.close();
      }
      if (!next.enabled) lookupPanel.close();
      controller.setTargetLanguage(next.nativeLanguage);
      controller.setEnabled(next.enabled);
      overlay.setDisplay(next);
      overlay.setContextVisible(next.showContext);
      syncLearningLanguage();
      settingsPanel.refresh();
    };
    settings.subscribe(applySettings);
    overlay.setDisplay(settings.get());

    window.addEventListener('resize', () => {
      lookupPanel.close();
    });

    /**
     * 擴充功能更新或重新載入後，頁面上的舊腳本會和它斷線，也沒辦法再翻譯。
     * 這時要自己收尾，把字幕交還給 YouTube。
     */
    const stopIfDisconnected = (): boolean => {
      if (stopped) return true;
      if (browser.runtime.id) return false;
      stopped = true;
      if (boundaryTimer !== null) clearTimeout(boundaryTimer);
      boundaryTimer = null;
      lookupPanel.close();
      settingsPanel.dispose();
      signInToast.dispose();
      controller.dispose();
      overlay.dispose();
      return true;
    };

    /** timeupdate 每秒只有約 4 次，所以另外對準下一句的時間。 */
    const refresh = () => {
      if (boundaryTimer !== null) clearTimeout(boundaryTimer);
      boundaryTimer = null;
      if (stopIfDisconnected()) return;
      const next = controller.update();
      const video = mainVideo();
      if (next === null || !video || video.paused) return;
      const delay = (next - video.currentTime) / (video.playbackRate || 1);
      boundaryTimer = setTimeout(refresh, Math.max(0, delay * 1000) + 10);
    };

    const isMainVideo = (event: Event) => event.target === mainVideo();
    for (const type of PLAYBACK_EVENTS) {
      document.addEventListener(
        type,
        (event) => {
          if (isMainVideo(event)) refresh();
        },
        { capture: true },
      );
    }
    document.addEventListener(
      'seeking',
      (event) => {
        if (isMainVideo(event) && !stopIfDisconnected()) controller.seek();
      },
      { capture: true },
    );

    window.addEventListener('message', (message) => {
      if (message.source !== window) return;
      if (import.meta.env.MODE === 'development') {
        if (
          (message.data as { __dualSubtitlesDevReload?: boolean } | null)
            ?.__dualSubtitlesDevReload
        ) {
          void browser.runtime.sendMessage({ type: 'dev-reload' });
          return;
        }
      }
      const event = parseBridgeMessage(message.data);
      if (!event || stopIfDisconnected()) return;
      settingsPanel.ensureButton();
      if (event.type === 'agent-ready') {
        syncLearningLanguage();
        return;
      }
      if (event.type === 'track-status') {
        trackAvailable = event.available;
        settingsPanel.refresh();
        return;
      }
      if (event.type === 'player') lookupPanel.close();
      controller.handle(event);
      refresh();
    });
  },
});
