import type { Account, Auth } from './auth';

export const AUTH_STORAGE_KEY = 'auth-session';

const AUTH_MESSAGE_TYPE = 'auth';

type AuthCommand = 'account' | 'sign-in' | 'sign-out';

export interface AuthMessage {
  readonly type: typeof AUTH_MESSAGE_TYPE;
  readonly command: AuthCommand;
}

type AuthResponse =
  | { readonly ok: true; readonly value: Account | null }
  | { readonly ok: false; readonly error: string };

export function isAuthMessage(message: unknown): message is AuthMessage {
  return (message as { type?: unknown } | null)?.type === AUTH_MESSAGE_TYPE;
}

/** The background script owns the session, so pages and video tabs ask it. */
export function answerAuthMessage(
  message: AuthMessage,
  auth: Auth,
  respond: (response: AuthResponse) => void,
): void {
  const run = async (): Promise<Account | null> => {
    if (message.command === 'sign-in') return auth.signIn();
    if (message.command === 'sign-out') {
      await auth.signOut();
      return null;
    }
    return auth.account();
  };
  run().then(
    (value) => {
      respond({ ok: true, value });
    },
    (error: unknown) => {
      respond({ ok: false, error: String(error) });
    },
  );
}

export interface AuthClient {
  account: () => Promise<Account | null>;
  /** Resolves with null when the user closes the window or declines. */
  signIn: () => Promise<Account | null>;
  signOut: () => Promise<void>;
}

export function createAuthClient(
  send: (message: AuthMessage) => Promise<unknown>,
): AuthClient {
  const call = async (command: AuthCommand) => {
    const response = (await send({
      type: AUTH_MESSAGE_TYPE,
      command,
    })) as AuthResponse;
    if (!response.ok) throw new Error(response.error);
    return response.value;
  };
  return {
    account: () => call('account'),
    signIn: () => call('sign-in'),
    signOut: async () => {
      await call('sign-out');
    },
  };
}
