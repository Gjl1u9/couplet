import { languageBase, sameLanguage } from '../lib/language';
import {
  FREQUENCY_MESSAGE_TYPE,
  frequencyLanguage,
  parseFrequencyList,
  rankLookup,
  type RankOf,
} from '../lib/hints/frequency';
import { createHintPicker, hintForm, hintZone } from '../lib/hints/hints';
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
import { LOOKUP_WARM } from '../lib/lookup/proxy';
import { createSubtitleController } from '../lib/subtitles/controller';
import { createOverlay } from '../lib/subtitles/overlay';
import { createLookupPanel } from '../lib/ui/lookup-panel';
import {
  createSettingsPanel,
  type TrackStatus,
} from '../lib/ui/settings-panel';
import { createSaveSound } from '../lib/ui/sound';
import { createSpeaker } from '../lib/ui/speech';
import { OPEN_DASHBOARD_MESSAGE } from '../lib/dashboard/open';
import type { WordEntry, WordInCue } from '../lib/lookup/types';
import { createVocabularyClient } from '../lib/vocabulary/service';
import {
  markedForms,
  normalizeForm,
  wordIdOf,
  type EncounterInput,
  type SavedWord,
} from '../lib/vocabulary/vocabulary';
import { currentVideoOrigin } from '../lib/youtube/origin';
import { createPortTranslate } from '../lib/translation/port';
import { TRANSLATE_PORT } from '../lib/translation/messages';
import { parseBridgeMessage, toBridgeCommand } from '../lib/youtube/bridge';
import {
  DEV_DUMP_REQUEST,
  DEV_DUMP_RESULT,
  describeCaptions,
} from '../lib/youtube/dev-dump';
import { AUTH_STORAGE_KEY, createAuthClient } from '../lib/auth/messages';
import { VOCABULARY_REVISION_KEY } from '../lib/sync/messages';
import { createSignInToast } from '../lib/ui/sign-in-toast';
import { createTrackNotice } from '../lib/ui/track-notice';

/** Idle connections stay open about this long, so warming more often does nothing. */
const WARM_EVERY_MS = 30_000;

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
    // Wakes the background script and opens the connection before the click.
    let warmedAt = -Infinity;
    const warmLookup = () => {
      if (performance.now() - warmedAt < WARM_EVERY_MS) return;
      warmedAt = performance.now();
      browser.runtime.sendMessage({ type: LOOKUP_WARM }).catch(() => undefined);
    };
    const overlay = createOverlay({
      sourceLanguage: () => controller.sourceLanguage(),
      // A video shown only for its translation has no lookups.
      canLookUp: () => trackStatus?.mode !== 'translation',
      expectsTranslation: () => controller.expectsTranslation(),
      isMarked: (token) => isSavedForm(token),
      pickHint: (tokens) => hints.pick(tokens),
      isHintable: (token) => !vocabularyIndex().forms.has(hintForm(token)),
      onApproach: warmLookup,
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
    /** Every word in the Vocabulary as lists spell it, and the ranks of those on review. */
    let vocabularyForms: {
      language: string;
      forms: ReadonlySet<string>;
      savedRanks: readonly number[];
    } | null = null;
    const vocabularyIndex = () => {
      const language = languageBase(sourceLanguage());
      if (vocabularyForms?.language === language) return vocabularyForms;
      const forms = new Set<string>();
      const savedRanks: number[] = [];
      for (const word of savedWords) {
        if (languageBase(word.source) !== language) continue;
        const lemma = hintForm(word.lemma);
        forms.add(lemma);
        for (const form of word.forms) forms.add(hintForm(form));
        const rank =
          ranks?.language === language ? ranks.rankOf(lemma) : undefined;
        if (!word.review.retired && rank !== undefined) savedRanks.push(rank);
      }
      vocabularyForms = { language, forms, savedRanks };
      return vocabularyForms;
    };

    /** New-word hints read the learning language's frequency list, loaded once. */
    const lists = new Map<string, Promise<RankOf | null>>();
    let ranks: { language: string; rankOf: RankOf } | null = null;
    const loadRanks = (language: string) => {
      if (lists.has(language)) return;
      const loading = browser.runtime
        .sendMessage({ type: FREQUENCY_MESSAGE_TYPE, language })
        .then(
          (text: unknown) =>
            typeof text === 'string'
              ? rankLookup(parseFrequencyList(text))
              : null,
          () => null,
        );
      lists.set(language, loading);
      void loading.then((rankOf) => {
        if (!rankOf) return;
        ranks = { language, rankOf };
        vocabularyForms = null;
      });
    };
    const hints = createHintPicker({
      rankOf: (form) => ranks?.rankOf(form),
      zone: () => {
        const { newWordHints, vocabularyLevels } = settings.get();
        const language = frequencyLanguage(sourceLanguage());
        if (!newWordHints || !language) return null;
        if (ranks?.language !== language) {
          loadRanks(language);
          return null;
        }
        const level = vocabularyLevels[language] ?? null;
        return hintZone(level, vocabularyIndex().savedRanks);
      },
      inVocabulary: (form) => vocabularyIndex().forms.has(form),
    });

    const reloadMarks = () => {
      vocabulary.list().then(
        (words) => {
          savedWords = words;
          marks = null;
          vocabularyForms = null;
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
      wordStatus: (entry) => vocabulary.status(entry.lemma, sourceLanguage()),
      beforeSave: () => signInToast.require(),
      keepsOpen: (path) =>
        path.some(
          (target) =>
            target instanceof Element &&
            target.classList.contains('sign-in-toast'),
        ),
      setWordStatus: async (entry, cue, next, previous) => {
        const id = wordIdOf(entry.lemma, sourceLanguage());
        try {
          if (next === 'none') {
            await vocabulary.removeByLemma(entry.lemma, sourceLanguage());
          } else if (next === 'saved') {
            if (previous === 'known') await vocabulary.restore(id);
            else await vocabulary.save(encounterInput(entry, cue));
          } else {
            // I know this keeps the word, with this line, but off the schedule.
            if (previous === 'none') {
              await vocabulary.save(encounterInput(entry, cue));
            }
            await vocabulary.retire(id);
          }
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

    let trackStatus: TrackStatus | null = null;
    /** The video `trackStatus` describes. */
    let trackVideoId: string | null = null;
    const settingsPanel = createSettingsPanel({
      layer: () => overlay.panelLayer(),
      getSettings: () => settings.get(),
      update: (patch) => {
        settings.update(patch);
      },
      trackStatus: () => trackStatus,
      previewSaveSound: () => {
        saveSound.play();
      },
      openDashboard: () => {
        void browser.runtime.sendMessage(OPEN_DASHBOARD_MESSAGE);
      },
      onOpen: () => {
        lookupPanel.close();
        trackNotice.close();
      },
    });

    const trackNotice = createTrackNotice({
      layer: () => overlay.panelLayer(),
    });
    /** Each video is announced once, so the notice never nags. */
    const announcedMissing = new Set<string>();
    const announceMissingTrack = () => {
      if (!settings.get().enabled || trackStatus?.mode !== 'none') return;
      if (trackVideoId === null || settingsPanel.isOpen()) return;
      if (announcedMissing.has(trackVideoId)) return;
      announcedMissing.add(trackVideoId);
      trackNotice.show();
    };

    /** The page agent loads no track while the extension is off. */
    let postedLanguages: string | null = null;
    const syncLanguages = () => {
      const { enabled, learningLanguage, nativeLanguage } = settings.get();
      if (!enabled) return;
      // Either language can change which track a video shows.
      const key = `${learningLanguage}|${nativeLanguage}`;
      if (key !== postedLanguages) {
        if (postedLanguages !== null) {
          lookupPanel.close();
          controller.resetCaptions();
          trackStatus = null;
          trackNotice.close();
        }
        postedLanguages = key;
      }
      window.postMessage(
        toBridgeCommand({
          type: 'set-languages',
          learningLanguage,
          nativeLanguage,
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
      if (!next.enabled) {
        lookupPanel.close();
        trackNotice.close();
      }
      controller.setTargetLanguage(next.nativeLanguage);
      controller.setEnabled(next.enabled);
      overlay.setDisplay(next);
      overlay.setContextVisible(next.showContext);
      syncLanguages();
      settingsPanel.refresh();
      announceMissingTrack();
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
      trackNotice.close();
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

    /** Kept only for the development dump below. */
    let lastCaptions: Parameters<typeof describeCaptions>[0] | null = null;

    window.addEventListener('message', (message) => {
      if (message.source !== window) return;
      if (import.meta.env.MODE === 'development') {
        const data = message.data as Record<string, unknown> | null;
        if (data?.__dualSubtitlesDevReload) {
          void browser.runtime.sendMessage({ type: 'dev-reload' });
          return;
        }
        if (data?.[DEV_DUMP_REQUEST]) {
          const { enabled, learningLanguage } = settings.get();
          window.postMessage(
            {
              [DEV_DUMP_RESULT]: {
                enabled,
                learningLanguage,
                trackStatus,
                captions:
                  lastCaptions &&
                  describeCaptions(
                    lastCaptions,
                    data[DEV_DUMP_REQUEST] === 'body',
                  ),
              },
            },
            location.origin,
          );
          return;
        }
      }
      const event = parseBridgeMessage(message.data);
      if (!event || stopIfDisconnected()) return;
      if (import.meta.env.MODE === 'development' && event.type === 'captions') {
        lastCaptions = event;
      }
      settingsPanel.ensureButton();
      if (event.type === 'agent-ready') {
        syncLanguages();
        return;
      }
      if (event.type === 'track-status') {
        trackStatus = { mode: event.mode, language: event.language };
        trackVideoId = event.videoId;
        if (event.mode !== 'none') trackNotice.close();
        settingsPanel.refresh();
        announceMissingTrack();
        return;
      }
      if (event.type === 'player') {
        lookupPanel.close();
        // The player reports null while loading, which is not a new video.
        if (event.videoId !== null && event.videoId !== trackVideoId) {
          trackStatus = null;
          trackVideoId = null;
          trackNotice.close();
          hints.reset();
        }
      }
      controller.handle(event);
      refresh();
    });
  },
});
