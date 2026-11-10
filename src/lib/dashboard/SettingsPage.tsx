import { frequencyLanguage } from '../hints/frequency';
import { WordCheck } from './WordCheck';
import { useEffect, useRef } from 'react';
import {
  LEARNING_LANGUAGES,
  NATIVE_LANGUAGES,
  type NativeLanguage,
  type PageTheme,
  type PanelTheme,
  type Settings,
} from '../settings/settings';
import {
  createSelectMenu,
  type SelectChoice,
  type SelectMenu,
} from '../ui/select-menu';
import { AccountGroup } from './AccountGroup';
import type { DashboardServices } from './services';

/** The same control as the Settings Panel, which has no React to share. */
export function Select({
  label,
  choices,
  value,
  onChange,
}: {
  readonly label: string;
  readonly choices: readonly SelectChoice[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const menu = useRef<SelectMenu | null>(null);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
    menu.current?.setValue(value);
  }, [value, onChange]);
  useEffect(() => {
    const created = createSelectMenu({
      label,
      choices,
      value: latest.current.value,
      onChange: (next) => {
        latest.current.onChange(next);
      },
    });
    menu.current = created;
    host.current?.append(created.element);
    return () => {
      created.dispose();
      created.element.remove();
      menu.current = null;
    };
  }, [label, choices]);
  return <div ref={host} />;
}

function Segmented<T extends string>({
  name,
  label,
  choices,
  value,
  onChange,
}: {
  readonly name: string;
  readonly label: string;
  readonly choices: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <label key={choice.value}>
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => {
                onChange(choice.value);
              }}
            />
            {choice.label}
          </label>
        ))}
      </div>
    </div>
  );
}

const PAGE_THEMES: readonly {
  readonly value: PageTheme;
  readonly label: string;
}[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const PANEL_THEMES: readonly {
  readonly value: PanelTheme;
  readonly label: string;
}[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function SettingsPage({
  services,
  settings,
  failed,
  onChange,
}: {
  readonly services: DashboardServices;
  readonly settings: Settings;
  readonly failed: boolean;
  readonly onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <div className="page settings-page">
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      {failed ? (
        <p className="page-note is-alert" role="alert">
          Couldn&apos;t save that change. Try again.
        </p>
      ) : null}
      <section className="card settings-card settings-menu">
        <AccountGroup services={services} />
        <section className="menu-group">
          <h2 className="menu-title">Language</h2>
          <div className="setting">
            <span>Learning language</span>
            <Select
              label="Learning language"
              choices={LEARNING_LANGUAGES}
              value={settings.learningLanguage}
              onChange={(learningLanguage) => {
                onChange({ learningLanguage });
              }}
            />
          </div>
          <div className="setting">
            <span>Native language</span>
            <Select
              label="Native language"
              choices={NATIVE_LANGUAGES}
              value={settings.nativeLanguage}
              onChange={(code) => {
                onChange({ nativeLanguage: code as NativeLanguage });
              }}
            />
          </div>
        </section>
        <WordCheck
          language={settings.learningLanguage}
          levels={settings.vocabularyLevels}
          onSave={(vocabularyLevels) => {
            onChange({ vocabularyLevels });
          }}
        />
        <section className="menu-group">
          <h2 className="menu-title">Appearance</h2>
          <Segmented
            name="page-theme"
            label="Theme"
            choices={PAGE_THEMES}
            value={settings.pageTheme}
            onChange={(pageTheme) => {
              onChange({ pageTheme });
            }}
          />
        </section>
        <section className="menu-group">
          <h2 className="menu-title">Lookup</h2>
          <Segmented
            name="panel-theme"
            label="Lookup panel"
            choices={PANEL_THEMES}
            value={settings.panelTheme}
            onChange={(panelTheme) => {
              onChange({ panelTheme });
            }}
          />
          <label className="setting">
            Save sound
            <input
              className="switch"
              type="checkbox"
              role="switch"
              checked={settings.saveSound}
              onChange={(event) => {
                onChange({ saveSound: event.target.checked });
                if (event.target.checked) services.previewSaveSound();
              }}
            />
          </label>
          <label className="setting">
            New word hints
            <input
              className="switch"
              type="checkbox"
              role="switch"
              checked={settings.newWordHints}
              onChange={(event) => {
                onChange({ newWordHints: event.target.checked });
              }}
            />
          </label>
          {frequencyLanguage(settings.learningLanguage) ? null : (
            <p className="muted">New word hints are English only for now.</p>
          )}
          <p className="muted">
            Hints use word lists from{' '}
            <a
              href="https://github.com/rspeer/wordfreq"
              target="_blank"
              rel="noreferrer"
            >
              wordfreq
            </a>{' '}
            by Robyn Speer, under{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-SA 4.0
            </a>
            .
          </p>
        </section>
      </section>
    </div>
  );
}
