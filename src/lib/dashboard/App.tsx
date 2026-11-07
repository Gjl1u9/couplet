import { useEffect, useMemo, useState } from 'react';
import { sameLanguage } from '../language';
import { LEARNING_LANGUAGES, type Settings } from '../settings/settings';
import { NoWordsHere } from './NoWordsHere';
import { SettingsPage } from './SettingsPage';
import { SignInPage } from './SignInPage';
import { languageSummaries } from './stats';
import {
  dueWords,
  type ReviewEvent,
  type SavedWord,
} from '../vocabulary/vocabulary';
import { useAccount } from './AccountGroup';
import { Icon, ICONS } from './Icon';
import { usePageTheme } from './theme';
import { HomePage } from './HomePage';
import { ProgressPage } from './ProgressPage';
import { ReviewPage } from './ReviewPage';
import type { DashboardServices } from './services';
import { WordsPage } from './WordsPage';

interface Route {
  readonly path: string;
  readonly params: URLSearchParams;
}

function useHashRoute(): Route {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash);
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  const [path = '/', query = ''] = hash.replace(/^#/, '').split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

export interface VocabularyData {
  readonly words: readonly SavedWord[];
  readonly log: readonly ReviewEvent[];
}

/** Every language's data, so switching language shows the new list at once. */
function useVocabularyData(
  services: DashboardServices,
): VocabularyData | 'failed' | null {
  const [data, setData] = useState<VocabularyData | 'failed' | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      Promise.all([
        services.vocabulary.list(),
        services.vocabulary.reviewLog(),
      ]).then(
        ([words, log]) => {
          if (active) setData({ words, log });
        },
        () => {
          if (active) setData('failed');
        },
      );
    };
    load();
    const stop = services.onVocabularyChange(load);
    return () => {
      active = false;
      stop();
    };
  }, [services]);
  return data;
}

/** The Learning Language selects the list. */
function useLanguageData(
  data: VocabularyData | 'failed' | null,
  language: string | null,
): VocabularyData | null {
  return useMemo(() => {
    if (data === null || data === 'failed' || language === null) return null;
    const words = data.words.filter((word) =>
      sameLanguage(word.source, language),
    );
    const ids = new Set(words.map((word) => word.id));
    return { words, log: data.log.filter((event) => ids.has(event.wordId)) };
  }, [data, language]);
}

function RailLink({
  href,
  icon,
  current,
  badge,
  children,
}: {
  readonly href: string;
  readonly icon: readonly string[];
  readonly current: boolean;
  readonly badge?: number;
  readonly children: string;
}) {
  return (
    <a
      className="rail-item"
      href={href}
      aria-current={current ? 'page' : undefined}
    >
      <Icon paths={icon} />
      {children}
      {badge ? <span className="rail-badge">{badge}</span> : null}
    </a>
  );
}

export function App({ services }: { readonly services: DashboardServices }) {
  const { path, params } = useHashRoute();
  const [account, setAccount] = useAccount(services);
  const signedIn = account !== 'loading' && account !== null;
  const [sync, setSync] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) {
      setSync('loading');
      return undefined;
    }
    let active = true;
    setSync('loading');
    services.sync.ready().then(
      (result) => {
        if (!active) return;
        if (result !== 'failed') {
          setSync('ready');
          return;
        }
        void services.syncStatus().then((status) => {
          if (!active) return;
          setFailure(status?.lastError ?? null);
          setSync('failed');
        });
      },
      (error: unknown) => {
        if (!active) return;
        setFailure(String(error));
        setSync('failed');
      },
    );
    return () => {
      active = false;
    };
  }, [services, signedIn, attempt]);
  const [saveFailed, setSaveFailed] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      void services.settings().then((loaded) => {
        if (active) setSettings(loaded);
      });
    };
    load();
    const stop = services.onSettingsChange(load);
    return () => {
      active = false;
      stop();
    };
  }, [services]);
  const all = useVocabularyData(services);
  const data = useLanguageData(all, settings?.learningLanguage ?? null);
  const theme = usePageTheme(settings?.pageTheme ?? 'system');

  if (account === 'loading') return <main className="page" aria-busy="true" />;
  if (!account) {
    return <SignInPage services={services} onSignedIn={setAccount} />;
  }
  if (sync === 'loading') {
    return (
      <main className="sign-in-page" aria-busy="true">
        <p className="muted" role="status">
          Loading your words…
        </p>
      </main>
    );
  }
  if (sync === 'failed') {
    return (
      <main className="sign-in-page">
        <section className="card sign-in-card">
          <p role="alert">Couldn&apos;t load your words.</p>
          {failure ? <p className="muted sign-in-detail">{failure}</p> : null}
          <button
            className="button"
            type="button"
            onClick={() => {
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }
  if (all === 'failed') {
    return (
      <main className="page">
        <p className="page-note is-alert" role="alert">
          Couldn&apos;t load your words. Reload this page.
        </p>
      </main>
    );
  }
  if (!settings || !all || !data)
    return <main className="page" aria-busy="true" />;
  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaveFailed(false);
    services.saveSettings(next).catch(() => {
      setSaveFailed(true);
    });
  };
  const now = Date.now();
  const due = dueWords(data.words, now).length;
  const languages = languageSummaries(LEARNING_LANGUAGES, all.words, now);
  const languageName = (code: string) =>
    LEARNING_LANGUAGES.find((language) => language.code === code)?.name ?? code;
  const other = languages[0];
  const page = () => {
    if (
      data.words.length === 0 &&
      path !== '/settings' &&
      other &&
      other.words > 0
    ) {
      return (
        <NoWordsHere
          language={languageName(settings.learningLanguage)}
          other={other}
          onSwitch={() => {
            updateSettings({ learningLanguage: other.code });
          }}
        />
      );
    }
    if (path === '/review') {
      return (
        <ReviewPage
          key={settings.learningLanguage}
          services={services}
          learningLanguage={settings.learningLanguage}
        />
      );
    }
    if (path === '/words') {
      return (
        <WordsPage
          key={settings.learningLanguage}
          services={services}
          words={data.words}
          focusWordId={params.get('word')}
          focusStage={params.get('stage')}
        />
      );
    }
    if (path === '/progress') {
      return (
        <ProgressPage words={data.words} log={data.log} streakLog={all.log} />
      );
    }
    if (path === '/settings') {
      return (
        <SettingsPage
          services={services}
          settings={settings}
          failed={saveFailed}
          onChange={updateSettings}
        />
      );
    }
    return <HomePage words={data.words} log={data.log} streakLog={all.log} />;
  };
  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <RailLink href="#/" icon={ICONS.home} current={path === '/'}>
          Home
        </RailLink>
        <RailLink
          href="#/review"
          icon={ICONS.review}
          current={path === '/review'}
          badge={due}
        >
          Review
        </RailLink>
        <RailLink href="#/words" icon={ICONS.words} current={path === '/words'}>
          Words
        </RailLink>
        <RailLink
          href="#/progress"
          icon={ICONS.progress}
          current={path === '/progress'}
        >
          Progress
        </RailLink>
        <div className="rail-end">
          <button
            className="rail-item"
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => {
              updateSettings({
                pageTheme: theme === 'dark' ? 'light' : 'dark',
              });
            }}
          >
            <Icon paths={theme === 'dark' ? ICONS.sun : ICONS.moon} />
            Theme
          </button>
          <RailLink
            href="#/settings"
            icon={ICONS.settings}
            current={path === '/settings'}
          >
            Settings
          </RailLink>
        </div>
      </nav>
      <main>{page()}</main>
    </div>
  );
}
