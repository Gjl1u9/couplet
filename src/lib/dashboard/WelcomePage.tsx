import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  LEARNING_LANGUAGES,
  NATIVE_LANGUAGES,
  type NativeLanguage,
  type Settings,
} from '../settings/settings';
import type { DashboardServices } from './services';
import { Select } from './SettingsPage';
import { usePageTheme } from './theme';

function Scene({
  label,
  kind,
  children,
}: {
  readonly label: string;
  readonly kind: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={`demo-scene ${kind}`} role="img" aria-label={label}>
      <svg
        className="demo-backdrop"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
      >
        <rect width="400" height="300" fill="#39424a" />
        <circle cx="318" cy="62" r="26" fill="#6d7471" />
        <path d="M0 190 92 112l76 62 74-82 158 112v96H0z" fill="#2b343b" />
        <path d="M0 240 118 168l96 62 72-38 114 62v46H0z" fill="#1f272d" />
      </svg>
      <div className="demo-stage">{children}</div>
    </div>
  );
}

function Pointer() {
  return (
    <svg className="demo-pointer" viewBox="0 0 24 24">
      <path d="M5 2.5v17l4.6-4.3 3 6.8 3.1-1.4-3-6.7 6.3-.4z" />
    </svg>
  );
}

function Step({
  number,
  title,
  note,
  label,
  kind = '',
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly note: string;
  readonly label: string;
  readonly kind?: string;
  readonly children: ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  return (
    <section className={`card welcome-step${paused ? ' is-paused' : ''}`}>
      <Scene label={label} kind={kind}>
        {children}
      </Scene>
      <div className="welcome-step-text">
        <div>
          <h2>
            <span className="welcome-number">{number}</span>
            {title}
          </h2>
          <p className="muted">{note}</p>
        </div>
        <button
          className="text-button welcome-pause"
          type="button"
          aria-pressed={paused}
          aria-label={`${paused ? 'Play' : 'Pause'} the ${title.toLowerCase()} animation`}
          onClick={() => {
            setPaused(!paused);
          }}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>
    </section>
  );
}

/**
 * The drag runs along the first line and then to the end of the second. Those places depend on
 * the font, so they are measured rather than written into the animation.
 */
function NearbyLinesDemo() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = root.current;
    const from = strip?.querySelector('.demo-mark-a');
    const to = strip?.querySelector('.demo-mark-b');
    if (!strip || !from || !to) return;
    const start = from.getBoundingClientRect();
    strip.style.setProperty('--drag-line-end', `${String(start.width)}px`);
    strip.style.setProperty(
      '--drag-end',
      `${String(to.getBoundingClientRect().right - start.left)}px`,
    );
  }, []);
  return (
    <div className="demo-strip" ref={root}>
      <span className="panel lookup-panel demo-panel is-lines">
        <span className="lookup-head">
          <span className="lookup-title">
            <span className="lookup-phrase">
              see you here, so far from home
            </span>
          </span>
        </span>
        <span className="lookup-senses">
          <span className="lookup-meaning">
            <span className="meaning-chip">離家這麼遠還能見到你</span>
          </span>
        </span>
      </span>
      <span className="demo-toggle">
        <svg className="demo-toggle-off" viewBox="0 0 24 24">
          <path d="M4 12h16M12 5v.01M12 19v.01" />
        </svg>
        <svg className="demo-toggle-on" viewBox="0 0 24 24">
          <path d="M8 6h8M4 12h16M8 18h8" />
        </svg>
        <span className="demo-toggle-pointer">
          <Pointer />
        </span>
      </span>
      <p className="demo-context">
        <span>
          I never thought I'd{' '}
          <span className="demo-mark-a">
            see you here,
            <span className="demo-panel-anchor" />
            <Pointer />
          </span>
        </span>
      </p>
      <p className="demo-original">
        <span className="demo-mark-b">so far from home.</span>
      </p>
      <p className="demo-translation">離家這麼遠。</p>
      <p className="demo-context">
        <span>It's been too long.</span>
      </p>
    </div>
  );
}

function ReviewDemo({ iconUrl }: { readonly iconUrl: string }) {
  return (
    <>
      <div className="demo-toolbar">
        <span className="demo-address" />
        <img src={iconUrl} alt="" />
      </div>
      <div className="demo-popup">
        <div className="popup-head">
          <img src={iconUrl} alt="" />
          <span>Couplet</span>
        </div>
        <div className="demo-popup-row">
          <span>
            <b>3</b> words ready for review
          </span>
          <span className="demo-start">Start review</span>
        </div>
      </div>
      <div className="demo-dashboard">
        <div className="demo-card">
          <span className="demo-card-word">observing</span>
          <span className="demo-card-line">We sat very still,</span>
          <span className="demo-card-cue">
            <mark>observing</mark> the birds
          </span>
          <span className="demo-card-line">until the sun went down.</span>
        </div>
        <div className="demo-grades">
          <span>Forgot</span>
          <span>Unsure</span>
          <span>Got it</span>
        </div>
      </div>
      <span className="demo-review-pointer">
        <Pointer />
      </span>
    </>
  );
}

/** Filled in from the browser's language, so most people only need to check them. */
function LanguagePicker({
  services,
  settings,
  onChange,
}: {
  readonly services: Pick<DashboardServices, 'saveSettings'>;
  readonly settings: Settings | null;
  readonly onChange: (settings: Settings) => void;
}) {
  const [failed, setFailed] = useState(false);
  const save = (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    onChange(next);
    setFailed(false);
    services.saveSettings(next).catch(() => {
      onChange(settings);
      setFailed(true);
    });
  };
  return (
    <section
      className="card settings-card settings-menu welcome-languages"
      aria-busy={settings === null}
    >
      <div className="menu-group">
        <h2 className="menu-title">Your languages</h2>
        {settings ? (
          <>
            <div className="setting">
              <span>Native language</span>
              <Select
                label="Native language"
                choices={NATIVE_LANGUAGES}
                value={settings.nativeLanguage}
                onChange={(code) => {
                  save({ nativeLanguage: code as NativeLanguage });
                }}
              />
            </div>
            <div className="setting">
              <span>Learning language</span>
              <Select
                label="Learning language"
                choices={LEARNING_LANGUAGES}
                value={settings.learningLanguage}
                onChange={(learningLanguage) => {
                  save({ learningLanguage });
                }}
              />
            </div>
          </>
        ) : (
          <div className="welcome-languages-loading" />
        )}
      </div>
      <p className="muted" role={failed ? 'alert' : undefined}>
        {failed
          ? "Couldn't save that change. Try again."
          : 'You can change these any time in the subtitle settings.'}
      </p>
    </section>
  );
}

/** Opens once after install: languages first, then what to try. */
export function WelcomePage({
  iconUrl,
  services,
}: {
  readonly iconUrl: string;
  readonly services: Pick<DashboardServices, 'settings' | 'saveSettings'>;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  usePageTheme(settings?.pageTheme ?? 'system');
  useEffect(() => {
    let active = true;
    void services.settings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    return () => {
      active = false;
    };
  }, [services]);
  return (
    <main className="welcome">
      <header className="welcome-head">
        <img src={iconUrl} alt="" />
        <span>Couplet</span>
      </header>
      <div className="welcome-intro">
        <div>
          <h1>Welcome to Couplet</h1>
          <p className="welcome-lead">
            Choose your languages, then try these on your next YouTube video. It
            works on videos that have subtitles.
          </p>
        </div>
        <a className="button is-primary" href="https://www.youtube.com">
          Open YouTube
        </a>
      </div>
      <LanguagePicker
        services={services}
        settings={settings}
        onChange={setSettings}
      />
      <div className="welcome-steps">
        <Step
          number={1}
          title="Click a word"
          note="See its meaning and how it's said."
          label="A pointer clicks the word bank in a subtitle, and a panel shows its meaning."
        >
          <div className="demo-strip">
            <p className="demo-original">
              We sat on the{' '}
              <span className="demo-word">
                bank
                <span className="demo-panel-anchor">
                  <span className="panel lookup-panel demo-panel is-word">
                    <span className="lookup-head">
                      <span className="lookup-title">
                        <span className="lookup-word">bank</span>
                        <span className="phonetic">/bæŋk/</span>
                      </span>
                    </span>
                    <span className="lookup-senses">
                      <span className="lookup-sense">
                        <span className="lookup-meaning">
                          <span className="meaning-chip">河岸</span>
                        </span>
                        <span className="couplet-original">
                          They walked along the bank.
                        </span>
                        <span className="couplet-translation">
                          他們沿著河岸散步。
                        </span>
                      </span>
                    </span>
                  </span>
                </span>
                <Pointer />
              </span>{' '}
              of the river.
            </p>
            <p className="demo-translation">我們坐在河岸上。</p>
          </div>
        </Step>
        <Step
          number={2}
          title="Drag across a phrase"
          note="See the whole phrase translated. The video pauses while you do."
          label="A pointer drags across the last thing I expected in a subtitle, and a panel shows its translation."
        >
          <div className="demo-strip">
            <p className="demo-original">
              It was{' '}
              <span className="demo-range">
                the last thing I expected
                <span className="demo-panel-anchor">
                  <span className="panel lookup-panel demo-panel is-phrase">
                    <span className="lookup-head">
                      <span className="lookup-title">
                        <span className="lookup-phrase">
                          the last thing I expected
                        </span>
                      </span>
                    </span>
                    <span className="lookup-senses">
                      <span className="lookup-meaning">
                        <span className="meaning-chip">我最沒料到的事</span>
                      </span>
                    </span>
                  </span>
                </span>
                <Pointer />
              </span>
              .
            </p>
            <p className="demo-translation">那是我最沒料到的事。</p>
          </div>
        </Step>
        <Step
          number={3}
          title="Show nearby lines"
          note="See the lines before and after, and drag across them. The button appears when you point at the subtitle."
          label="A pointer turns on the lines before and after a subtitle, then drags across two lines, and a panel shows the translation."
        >
          <NearbyLinesDemo />
        </Step>
        <Step
          number={4}
          title="Review your words"
          note="Open Couplet from the toolbar when words are due. Saving words needs a Google sign-in."
          label="A pointer opens Couplet from the browser toolbar and clicks Start review, and the Dashboard opens on a Review Card."
          kind="is-review"
        >
          <ReviewDemo iconUrl={iconUrl} />
        </Step>
      </div>
    </main>
  );
}
