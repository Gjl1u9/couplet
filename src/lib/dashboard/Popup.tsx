import { useEffect, useState } from 'react';
import { sameLanguage } from '../language';
import type { Settings } from '../settings/settings';
import { dueWords } from '../vocabulary/vocabulary';
import { AccountGroup, useAccount } from './AccountGroup';
import { Icon, ICONS } from './Icon';
import type { DashboardServices } from './services';
import { usePageTheme } from './theme';

const PRODUCT_PAGE = 'https://coupletapp.com';

/** Opens from the toolbar: what's due, the subtitles switch, and the account. */
export function Popup({
  services,
  productName,
  iconUrl,
  openDashboard,
}: {
  readonly services: DashboardServices;
  readonly productName: string;
  readonly iconUrl: string;
  readonly openDashboard: (path: string) => void;
}) {
  const [account] = useAccount(services);
  const signedIn = account !== 'loading' && account !== null;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [due, setDue] = useState<number | null>(null);
  usePageTheme(settings?.pageTheme ?? 'system');

  useEffect(() => {
    let active = true;
    const load = () => {
      void services.settings().then((loaded) => {
        if (active) setSettings(loaded);
        return services.vocabulary.list().then((words) => {
          if (!active) return;
          const own = words.filter((word) =>
            sameLanguage(word.source, loaded.learningLanguage),
          );
          setDue(dueWords(own, Date.now()).length);
        });
      });
    };
    load();
    const stop = services.onVocabularyChange(load);
    return () => {
      active = false;
      stop();
    };
  }, [services]);

  const setEnabled = (enabled: boolean) => {
    if (!settings) return;
    const next = { ...settings, enabled };
    setSettings(next);
    services.saveSettings(next).catch(() => {
      setSettings(settings);
    });
  };

  return (
    <main className="popup" aria-busy={settings === null}>
      <header className="popup-head">
        <img src={iconUrl} alt="" />
        <a href={PRODUCT_PAGE} target="_blank" rel="noreferrer">
          {productName}
        </a>
      </header>
      {signedIn ? (
        <section className="popup-review">
          {due === null ? null : due > 0 ? (
            <>
              <p>
                <b>{due}</b> {due === 1 ? 'word' : 'words'} ready for review
              </p>
              <button
                className="button is-primary"
                type="button"
                onClick={() => {
                  openDashboard('/review');
                }}
              >
                Start review <Icon paths={ICONS.right} />
              </button>
            </>
          ) : (
            <p className="muted">Nothing to review right now.</p>
          )}
        </section>
      ) : null}
      <div className="settings-menu">
        {settings ? (
          <section className="menu-group">
            <label className="setting">
              Dual subtitles
              <input
                className="switch"
                type="checkbox"
                role="switch"
                checked={settings.enabled}
                onChange={(event) => {
                  setEnabled(event.target.checked);
                }}
              />
            </label>
          </section>
        ) : null}
        <AccountGroup services={services} />
      </div>
      {signedIn ? (
        <footer className="popup-foot">
          <button
            className="text-button"
            type="button"
            onClick={() => {
              openDashboard('/');
            }}
          >
            Open Dashboard
          </button>
        </footer>
      ) : null}
    </main>
  );
}
