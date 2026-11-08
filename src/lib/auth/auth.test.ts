import { describe, expect, it, vi } from 'vitest';
import { createAuth, unexpiredToken, type AuthBackend } from './auth';

const session = {
  access_token: 'token',
  user: {
    id: 'u1',
    email: 'a@example.com',
    user_metadata: { full_name: 'A' },
  },
};

function setup(returned: string | undefined | Error = 'https://x/?code=abc') {
  const signInWithOAuth = vi.fn<AuthBackend['signInWithOAuth']>(() =>
    Promise.resolve({ data: { url: 'https://auth/start' }, error: null }),
  );
  const exchangeCodeForSession = vi.fn<AuthBackend['exchangeCodeForSession']>(
    () => Promise.resolve({ data: { session }, error: null }),
  );
  const signOut = vi.fn<AuthBackend['signOut']>(() =>
    Promise.resolve({ error: null }),
  );
  const getSession = vi.fn<AuthBackend['getSession']>(() =>
    Promise.resolve({ data: { session: null }, error: null }),
  );
  const launch = vi.fn<(url: string) => Promise<string | undefined>>(() =>
    returned instanceof Error
      ? Promise.reject(returned)
      : Promise.resolve(returned),
  );
  const auth = createAuth({
    backend: { getSession, signInWithOAuth, exchangeCodeForSession, signOut },
    launch,
    redirectUrl: () => 'https://id.chromiumapp.org/',
  });
  return {
    auth,
    getSession,
    signInWithOAuth,
    exchangeCodeForSession,
    signOut,
    launch,
  };
}

describe('createAuth', () => {
  it('opens Google, exchanges the code, and returns the account', async () => {
    const { auth, signInWithOAuth, exchangeCodeForSession, launch } = setup();
    await expect(auth.signIn()).resolves.toEqual({
      email: 'a@example.com',
      name: 'A',
    });
    expect(signInWithOAuth.mock.calls[0]?.[0].options).toMatchObject({
      redirectTo: 'https://id.chromiumapp.org/',
      skipBrowserRedirect: true,
    });
    expect(launch).toHaveBeenCalledWith('https://auth/start');
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('treats a closed window as no sign-in, not a failure', async () => {
    const { auth, exchangeCodeForSession } = setup(
      new Error('The user did not approve access.'),
    );
    await expect(auth.signIn()).resolves.toBeNull();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('treats a declined consent as no sign-in', async () => {
    const { auth } = setup('https://x/?error=access_denied');
    await expect(auth.signIn()).resolves.toBeNull();
  });

  it('reports other failures', async () => {
    await expect(
      setup(new Error('Authorization page could not be loaded.')).auth.signIn(),
    ).rejects.toThrow('could not be loaded');
    await expect(
      setup(
        'https://x/?error=server_error&error_description=Nope',
      ).auth.signIn(),
    ).rejects.toThrow('Nope');
  });

  it('reports a failed code exchange', async () => {
    const { auth, exchangeCodeForSession } = setup();
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Bad code' },
    });
    await expect(auth.signIn()).rejects.toThrow('Bad code');
  });

  it('reads the account and token from the session', async () => {
    const { auth, getSession } = setup();
    await expect(auth.account()).resolves.toBeNull();
    await expect(auth.accessToken()).resolves.toBeNull();
    getSession.mockResolvedValue({ data: { session }, error: null });
    await expect(auth.account()).resolves.toMatchObject({
      email: 'a@example.com',
    });
    await expect(auth.accessToken()).resolves.toBe('token');
    await expect(auth.userId()).resolves.toBe('u1');
  });

  it('reads a stored token only while it has time left', () => {
    const now = 1_800_000_000_000;
    const stored = (expiresAt: unknown) =>
      JSON.stringify({ access_token: 'token', expires_at: expiresAt });
    expect(unexpiredToken(stored(now / 1000 + 3600), now)).toBe('token');
    expect(unexpiredToken(stored(now / 1000 + 30), now)).toBeNull();
    expect(unexpiredToken(stored(now / 1000 - 10), now)).toBeNull();
    expect(unexpiredToken(stored('soon'), now)).toBeNull();
    expect(unexpiredToken('{', now)).toBeNull();
    expect(unexpiredToken(undefined, now)).toBeNull();
  });

  it('signs out only this device', async () => {
    const { auth, signOut } = setup();
    await auth.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
