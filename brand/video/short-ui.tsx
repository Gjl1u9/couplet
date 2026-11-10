// The real Popup and Dashboard, filled with a demo learner's words, for the Short.
// short.html loads this page in frames; `?scene=` picks what each frame shows.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/lib/dashboard/App';
import type { DashboardServices } from '../../src/lib/dashboard/services';
import { Popup } from '../../src/lib/dashboard/Popup';
import { defaultSettings } from '../../src/lib/settings/settings';
import type { VocabularyClient } from '../../src/lib/vocabulary/service';
import type {
  ContextCue,
  ReviewEvent,
  SavedWord,
} from '../../src/lib/vocabulary/vocabulary';

const NOW = Date.now();
const DAY = 86400000;
const ORIGIN = {
  site: 'youtube' as const,
  videoId: 'vlog',
  title: 'Two days in a hill town by the sea',
};

/** The vlog's lines, shared with short.html, so the saved sentences match the film. */
const VLOG: readonly ContextCue[] = [
  { original: 'Okay, we finally made it to the top.', startMs: 61000 },
  {
    original: 'The view up here is absolutely breathtaking.',
    startMs: 64000,
  },
  {
    original: "Let's grab a coffee and soak up the view.",
    startMs: 68000,
  },
  { original: 'The trams up here are older than my grandma.', startMs: 72000 },
];
const VLOG_TRANSLATION =
  '好，我們終於爬到山頂了。這裡的風景真的美得令人屏息。我們去喝杯咖啡，好好享受這片景色。這裡的電車比我奶奶還老。';

interface Seed {
  readonly lemma: string;
  readonly phonetic?: string;
  readonly meaning: string;
  readonly example: string;
  readonly translation: string;
  readonly cues: readonly ContextCue[];
  readonly current: number;
  readonly cueTranslation: string;
  readonly title: string;
  readonly level: number;
  readonly savedDaysAgo: number;
  readonly dueInDays: number;
  readonly reviews: number;
}

const OLDER: readonly Seed[] = [
  [
    'wander',
    'wɒndə',
    '閒逛',
    'We wandered around the old town.',
    '我們在老城區閒逛。',
    'We just wandered around all afternoon.',
    '我們整個下午都在閒逛。',
    'A weekend of street food',
    3,
    12,
    2,
    3,
  ],
  [
    'hidden gem',
    '',
    '鮮為人知的好地方',
    'This café is a hidden gem.',
    '這家咖啡店是個私房景點。',
    'This little bakery is a real hidden gem.',
    '這家小麵包店真的是私房好店。',
    'Two days in a hill town by the sea',
    2,
    9,
    0.5,
    2,
  ],
  [
    'itinerary',
    'aɪˈtɪnərəri',
    '行程',
    'Our itinerary was too full.',
    '我們的行程排得太滿了。',
    'Here is our itinerary for the next three days.',
    '這是我們接下來三天的行程。',
    'Planning a trip on a budget',
    4,
    20,
    5,
    4,
  ],
  [
    'on a whim',
    '',
    '一時興起',
    'We booked it on a whim.',
    '我們一時興起就訂了。',
    'We took the night train on a whim.',
    '我們一時興起搭了夜車。',
    'A weekend of street food',
    1,
    6,
    0.4,
    1,
  ],
  [
    'worth it',
    '',
    '值得',
    'The climb was worth it.',
    '這段爬坡很值得。',
    'Honestly, the long queue was worth it.',
    '說真的，排那麼久很值得。',
    'A weekend of street food',
    5,
    28,
    12,
    5,
  ],
  [
    'breeze',
    'briːz',
    '微風',
    'A cool breeze came in.',
    '吹來一陣涼風。',
    'There is such a nice breeze by the water.',
    '水邊的微風好舒服。',
    'Two days in a hill town by the sea',
    6,
    40,
    30,
    6,
  ],
  [
    'crowded',
    'ˈkraʊdɪd',
    '擁擠的',
    'The market was crowded.',
    '市場很擁擠。',
    'It gets really crowded after ten.',
    '十點以後就會非常擁擠。',
    'Planning a trip on a budget',
    3,
    15,
    1,
    3,
  ],
  [
    'authentic',
    'ɔːˈθentɪk',
    '道地的',
    'This is authentic street food.',
    '這是道地的街頭小吃。',
    'You want the most authentic version, go here.',
    '想吃最道地的，就來這裡。',
    'A weekend of street food',
    2,
    8,
    0.6,
    2,
  ],
].map(
  ([
    lemma,
    phonetic,
    meaning,
    example,
    translation,
    line,
    cueTranslation,
    title,
    level,
    savedDaysAgo,
    dueInDays,
    reviews,
  ]) => ({
    lemma: lemma as string,
    phonetic: phonetic as string,
    meaning: meaning as string,
    example: example as string,
    translation: translation as string,
    cues: [{ original: line as string, startMs: 125000 }],
    current: 0,
    cueTranslation: cueTranslation as string,
    title: title as string,
    level: level as number,
    savedDaysAgo: savedDaysAgo as number,
    dueInDays: dueInDays as number,
    reviews: reviews as number,
  }),
);

/** The two the film saves. Only these are due, oldest first, as the queue orders them. */
const SAVED_IN_FILM: readonly Seed[] = [
  {
    lemma: 'soak up',
    // What Google gives for the selection alone, as the Lookup Panel shows it.
    meaning: '吸收',
    example: '',
    translation: '',
    cues: VLOG.slice(1, 4),
    current: 1,
    cueTranslation: VLOG_TRANSLATION,
    title: ORIGIN.title,
    level: 0,
    savedDaysAgo: 0.0002,
    dueInDays: -0.0002,
    reviews: 0,
  },
  {
    lemma: 'breathtaking',
    phonetic: 'ˈbreθteɪkɪŋ',
    meaning: '令人驚嘆的',
    example: 'The view was breathtaking.',
    translation: '景色美得令人屏息。',
    cues: VLOG.slice(0, 3),
    current: 1,
    cueTranslation: VLOG_TRANSLATION,
    title: ORIGIN.title,
    level: 0,
    savedDaysAgo: 0.0003,
    dueInDays: -0.0003,
    reviews: 0,
  },
];

function toWord(seed: Seed): SavedWord {
  const savedAt = NOW - seed.savedDaysAgo * DAY;
  const line = seed.cues[seed.current]?.original ?? '';
  const offset = line.toLowerCase().indexOf(seed.lemma.split(' ')[0] ?? '');
  return {
    id: `en:${seed.lemma}`,
    lemma: seed.lemma,
    phonetic: seed.phonetic ? `/${seed.phonetic}/` : null,
    senses: [
      {
        meaning: seed.meaning,
        // A saved phrase has no example, as phraseEntry makes it.
        example: seed.lemma.includes(' ') ? '' : seed.example,
        translation: seed.lemma.includes(' ') ? '' : seed.translation,
      },
    ],
    source: 'en',
    target: 'zh-TW',
    forms: [seed.lemma],
    encounters: [
      {
        id: `${seed.lemma}-e`,
        cues: seed.cues,
        currentCue: seed.current,
        translation: seed.cueTranslation,
        form: seed.lemma,
        formOffset: offset >= 0 ? offset : null,
        origin: { ...ORIGIN, title: seed.title },
        meaning: null,
        savedAt,
      },
    ],
    review: {
      scheduler: 'ladder-v1',
      level: seed.level,
      dueAt: NOW + seed.dueInDays * DAY,
      lastReviewedAt: seed.reviews > 0 ? NOW - DAY : null,
      reviewCount: seed.reviews,
      retired: null,
    },
    savedAt,
    updatedAt: savedAt,
  };
}

const WORDS: readonly SavedWord[] = [...SAVED_IN_FILM, ...OLDER].map(toWord);

/** Six days in a row, plus a few earlier sessions, so Home and Progress have a habit to show. */
const LOG: readonly ReviewEvent[] = (() => {
  const events: ReviewEvent[] = [];
  const days = [1, 2, 3, 4, 5, 6, 9, 10, 13, 16, 17, 20, 23, 27, 30, 34, 38];
  days.forEach((ago, at) => {
    const count = 3 + ((at * 5) % 7);
    for (let n = 0; n < count; n += 1) {
      const word = OLDER[(at + n) % OLDER.length];
      if (!word) continue;
      events.push({
        wordId: `en:${word.lemma}`,
        encounterId: `${word.lemma}-e`,
        grade: n % 5 === 0 ? 'again' : 'good',
        levelBefore: 1,
        levelAfter: 2,
        at: NOW - ago * DAY + n * 60000,
      });
    }
  });
  return events;
})();

const EXPLANATION =
  '「soak up」是片語動詞，在這裡指「好好享受、盡情感受」眼前的景色，不是字面上的「吸收」。句型是 soak up + 名詞，這句的受詞是 the view。';

const services: DashboardServices = {
  vocabulary: {
    list: () => Promise.resolve(WORDS),
    reviewLog: () => Promise.resolve(LOG),
    grade: (wordId: string) =>
      Promise.resolve(WORDS.find((word) => word.id === wordId) ?? null),
    fillTranslation: () => Promise.resolve(null),
  } as unknown as VocabularyClient,
  auth: {
    account: () =>
      Promise.resolve({ email: 'mia.learns@gmail.com', name: 'Mia' }),
    signIn: () => Promise.resolve(null),
    signOut: () => Promise.resolve(),
  },
  onAccountChange: () => () => undefined,
  sync: {
    ready: () => Promise.resolve('ready'),
    syncNow: () => Promise.resolve(),
  },
  syncStatus: () =>
    Promise.resolve({ state: 'synced', pending: 0, lastSyncAt: NOW - 60000 }),
  onSyncStatus: () => () => undefined,
  speaker: { speak: () => undefined, stop: () => undefined },
  settings: () =>
    Promise.resolve({
      ...defaultSettings('zh-TW'),
      learningLanguage: 'en',
      nativeLanguage: 'zh-TW',
      pageTheme: 'light',
    }),
  saveSettings: () => Promise.resolve(),
  onSettingsChange: () => () => undefined,
  previewSaveSound: () => undefined,
  playGradeSound: () => undefined,
  explain: () => Promise.resolve({ text: EXPLANATION, remaining: 49 }),
  onVocabularyChange: () => () => undefined,
};

const until = async (find: () => Element | null | undefined) => {
  for (let tries = 0; tries < 200; tries += 1) {
    const found = find();
    if (found) return found as HTMLElement;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('The scene never finished loading');
};
const button = (text: string) => () =>
  [...document.querySelectorAll<HTMLElement>('button')].find((node) =>
    node.textContent.includes(text),
  );

const SCENES: Record<string, { hash?: string; then?: () => Promise<void> }> = {
  popup: {},
  home: { hash: '#/' },
  review: { hash: '#/review' },
  'review-translated': {
    hash: '#/review',
    then: async () => {
      (await until(button('Show translation'))).click();
      await until(() =>
        document.querySelector('.review-translation:not([hidden])'),
      );
    },
  },
  progress: { hash: '#/progress' },
  'words-open': { hash: '#/words?word=en%3Asoak%20up' },
  words: {
    hash: '#/words?word=en%3Asoak%20up',
    then: async () => {
      (await until(button('Explain with AI'))).click();
      await until(() => document.querySelector('.sentence-explanation p'));
    },
  },
};

const scene = new URLSearchParams(location.search).get('scene') ?? 'home';
const chosen = SCENES[scene];
if (!chosen) throw new Error(`Unknown scene: ${scene}`);
if (chosen.hash) history.replaceState(null, '', chosen.hash);
const root = document.getElementById('root');
if (!root) throw new Error('missing root');
createRoot(root).render(
  scene === 'popup' ? (
    <Popup
      services={services}
      productName="Couplet"
      openDashboard={() => undefined}
    />
  ) : (
    <App services={services} />
  ),
);

(window as { ready?: Promise<void> }).ready = (async () => {
  await until(() =>
    document.querySelector(
      scene === 'popup' ? '.popup-review button' : '.app main:not([aria-busy])',
    ),
  );
  await chosen.then?.();
  await document.fonts.ready;
  // Frames are exact moments, so nothing may run on the clock.
  const still = document.createElement('style');
  still.textContent =
    '* { transition: none !important; animation: none !important; caret-color: transparent; }';
  document.head.append(still);
})();
