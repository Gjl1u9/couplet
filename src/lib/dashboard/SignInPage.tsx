import { useEffect, useState } from 'react';
import type { Account } from '../auth/auth';
import { GoogleSignInButton } from './AccountGroup';
import type { DashboardServices } from './services';

/** Stands in for the Dashboard until the user signs in. */
export function SignInPage({
  services,
  onSignedIn,
}: {
  readonly services: DashboardServices;
  readonly onSignedIn: (account: Account) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unsent, setUnsent] = useState(false);
  useEffect(() => {
    let active = true;
    services.syncStatus().then(
      (status) => {
        if (active) setUnsent((status?.pending ?? 0) > 0);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [services]);
  return (
    <main className="sign-in-page">
      <section className="card sign-in-card">
        <h1>Sign in to open your Dashboard</h1>
        <p className="muted">
          See the words you saved, review them, and track your progress.
        </p>
        <GoogleSignInButton
          busy={busy}
          onClick={() => {
            setBusy(true);
            setFailed(false);
            services.auth
              .signIn()
              .then((account) => {
                if (account) onSignedIn(account);
              })
              .catch(() => {
                setFailed(true);
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        />
        {unsent ? (
          <p className="muted">
            Some changes haven&apos;t synced. They&apos;ll sync when you sign in
            here again.
          </p>
        ) : null}
        {failed ? (
          <p className="page-note is-alert" role="alert">
            Couldn&apos;t sign in. Try again.
          </p>
        ) : null}
      </section>
    </main>
  );
}
