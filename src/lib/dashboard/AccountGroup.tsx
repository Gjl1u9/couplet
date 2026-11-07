import { useEffect, useState } from 'react';
import type { Account } from '../auth/auth';
import { GOOGLE_MARK_PATHS } from '../ui/google-mark';
import type { SyncStatus } from '../sync/account-sync';
import type { DashboardServices } from './services';

function GoogleMark() {
  return (
    <span className="google-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {GOOGLE_MARK_PATHS.map(({ fill, d }) => (
          <path key={d} fill={fill} d={d} />
        ))}
      </svg>
    </span>
  );
}

/** Waiting for the background, so nothing flashes the wrong state. */
export type AccountState = Account | null | 'loading';

export function useAccount(
  services: DashboardServices,
): readonly [AccountState, (account: Account | null) => void] {
  const [account, setAccount] = useState<AccountState>('loading');
  useEffect(() => {
    let active = true;
    const load = () => {
      services.auth.account().then(
        (loaded) => {
          if (active) setAccount(loaded);
        },
        () => {
          if (active) setAccount(null);
        },
      );
    };
    load();
    const stop = services.onAccountChange(load);
    return () => {
      active = false;
      stop();
    };
  }, [services]);
  return [account, setAccount];
}

export function GoogleSignInButton({
  busy,
  onClick,
}: {
  readonly busy: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      className="menu-action google-sign-in"
      type="button"
      disabled={busy}
      onClick={onClick}
    >
      <GoogleMark />
      {busy ? 'Signing in…' : 'Sign in with Google'}
    </button>
  );
}

const STATUS_TEXT: Partial<Record<SyncStatus['state'], string>> = {
  syncing: 'Syncing…',
  synced: 'All changes synced.',
  offline: 'Offline. Changes will sync later.',
  partial: "Couldn't sync some words.",
  'update-needed': 'Update the extension to keep syncing.',
};

function useSyncStatus(services: DashboardServices) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      services.syncStatus().then(
        (loaded) => {
          if (active) setStatus(loaded);
        },
        () => undefined,
      );
    };
    load();
    const stop = services.onSyncStatus(load);
    return () => {
      active = false;
      stop();
    };
  }, [services]);
  return status;
}

/** Shared by Settings and the popup. */
export function AccountGroup({
  services,
}: {
  readonly services: DashboardServices;
}) {
  const [account, setAccount] = useAccount(services);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const status = useSyncStatus(services);
  const statusText = account && status ? STATUS_TEXT[status.state] : undefined;

  const run = (action: () => Promise<Account | null>) => {
    setBusy(true);
    setFailed(false);
    action()
      .then(setAccount)
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <section className="menu-group">
      <h2 className="menu-title">Account</h2>
      {account === 'loading' ? (
        <div className="setting" aria-busy="true" />
      ) : account ? (
        <div className="setting">
          <span className="account-email" title={account.email ?? undefined}>
            {account.email ?? account.name ?? 'Signed in'}
          </span>
          <button
            className="menu-action"
            type="button"
            disabled={busy}
            onClick={() => {
              run(async () => {
                await services.auth.signOut();
                return null;
              });
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="setting">
          <span>Not signed in</span>
          <GoogleSignInButton
            busy={busy}
            onClick={() => {
              run(() => services.auth.signIn());
            }}
          />
        </div>
      )}
      {statusText ? (
        <p className="setting-note" role="status">
          {statusText}
        </p>
      ) : null}
      {failed ? (
        <p className="setting-note is-alert" role="alert">
          <span>Couldn&apos;t reach your account. Try again.</span>
        </p>
      ) : null}
    </section>
  );
}
