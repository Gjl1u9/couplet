import { describe, expect, it, vi } from 'vitest';
import type { Auth } from './auth';
import {
  answerAuthMessage,
  createAuthClient,
  isAuthMessage,
  type AuthMessage,
} from './messages';

const account = { email: 'a@example.com', name: 'A' };

function connect(overrides: Partial<Auth> = {}) {
  const auth: Auth = {
    account: () => Promise.resolve(account),
    signIn: () => Promise.resolve(account),
    signOut: vi.fn(() => Promise.resolve()),
    accessToken: () => Promise.resolve('token'),
    userId: () => Promise.resolve('u'),
    ...overrides,
  };
  const client = createAuthClient(
    (message: AuthMessage) =>
      new Promise((resolve) => {
        answerAuthMessage(message, auth, resolve);
      }),
  );
  return { auth, client };
}

describe('auth messages', () => {
  it('recognizes its own messages', () => {
    expect(isAuthMessage({ type: 'auth', command: 'account' })).toBe(true);
    expect(isAuthMessage({ type: 'other' })).toBe(false);
    expect(isAuthMessage(null)).toBe(false);
  });

  it('carries each command to the background and back', async () => {
    const { auth, client } = connect();
    await expect(client.account()).resolves.toEqual(account);
    await expect(client.signIn()).resolves.toEqual(account);
    await client.signOut();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it('turns a background failure into a rejection', async () => {
    const { client } = connect({
      signIn: () => Promise.reject(new Error('Nope')),
    });
    await expect(client.signIn()).rejects.toThrow('Nope');
  });
});
