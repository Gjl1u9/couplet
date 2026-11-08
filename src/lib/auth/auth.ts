export interface Account {
  readonly email: string | null;
  readonly name: string | null;
}

interface AuthUser {
  readonly id?: string;
  readonly email?: string;
  readonly user_metadata?: { readonly full_name?: unknown };
}

interface AuthSession {
  readonly access_token: string;
  readonly user: AuthUser;
}

interface AuthError {
  readonly message: string;
}

/** The part of Supabase's client this uses, so tests need no network. */
export interface AuthBackend {
  getSession: () => Promise<{
    data: { session: AuthSession | null };
    error: AuthError | null;
  }>;
  signInWithOAuth: (credentials: {
    provider: 'google';
    options: {
      redirectTo: string;
      skipBrowserRedirect: boolean;
      queryParams: Record<string, string>;
    };
  }) => Promise<{
    data: { url: string | null };
    error: AuthError | null;
  }>;
  exchangeCodeForSession: (code: string) => Promise<{
    data: { session: AuthSession | null };
    error: AuthError | null;
  }>;
  signOut: (options: { scope: 'local' }) => Promise<{
    error: AuthError | null;
  }>;
}

export interface AuthOptions {
  readonly backend: AuthBackend;
  /** Opens Google's sign-in window and resolves with the address it returns to. */
  readonly launch: (url: string) => Promise<string | undefined>;
  readonly redirectUrl: () => string;
}

export interface Auth {
  account: () => Promise<Account | null>;
  /** Resolves with null when the user closes the window or declines. */
  signIn: () => Promise<Account | null>;
  signOut: () => Promise<void>;
  /** For our own server. Refreshes the token first when it has expired. */
  accessToken: () => Promise<string | null>;
  /** Picks whose words the device shows. */
  userId: () => Promise<string | null>;
}

/** A token with less than this left is about to expire on the way to the server. */
const TOKEN_MARGIN_MS = 60_000;

/**
 * The stored session's token while it has time left, read without the network or
 * Supabase's lock. Null when signed out, or when the token needs a refresh first.
 */
export function unexpiredToken(stored: unknown, nowMs: number): string | null {
  if (typeof stored !== 'string') return null;
  let session: unknown;
  try {
    session = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof session !== 'object' || session === null) return null;
  const { access_token: token, expires_at: expiresAt } = session as Record<
    string,
    unknown
  >;
  return typeof token === 'string' &&
    typeof expiresAt === 'number' &&
    expiresAt * 1000 - nowMs > TOKEN_MARGIN_MS
    ? token
    : null;
}

const toAccount = (user: AuthUser): Account => {
  const name = user.user_metadata?.full_name;
  return {
    email: user.email ?? null,
    name: typeof name === 'string' ? name : null,
  };
};

const isCancelled = (error: unknown) =>
  error instanceof Error && /did not approve|cancel/i.test(error.message);

export function createAuth(options: AuthOptions): Auth {
  const { backend, launch, redirectUrl } = options;

  const currentSession = async () => {
    const { data, error } = await backend.getSession();
    if (error) throw new Error(error.message);
    return data.session;
  };

  return {
    async account() {
      const session = await currentSession();
      return session ? toAccount(session.user) : null;
    },
    async signIn() {
      const { data, error } = await backend.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl(),
          // The extension opens the window itself, because it has no page to redirect.
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw new Error(error.message);
      if (!data.url) throw new Error('No sign-in address');

      let returned: string | undefined;
      try {
        returned = await launch(data.url);
      } catch (launchError) {
        if (isCancelled(launchError)) return null;
        throw launchError;
      }
      if (!returned) return null;

      const params = new URL(returned).searchParams;
      if (params.get('error') === 'access_denied') return null;
      const code = params.get('code');
      if (!code) {
        throw new Error(params.get('error_description') ?? 'No sign-in code');
      }
      const exchanged = await backend.exchangeCodeForSession(code);
      if (exchanged.error) throw new Error(exchanged.error.message);
      return exchanged.data.session
        ? toAccount(exchanged.data.session.user)
        : null;
    },
    async signOut() {
      // Words stay on this device, and other devices stay signed in.
      const { error } = await backend.signOut({ scope: 'local' });
      if (error) throw new Error(error.message);
    },
    async accessToken() {
      return (await currentSession())?.access_token ?? null;
    },
    async userId() {
      return (await currentSession())?.user.id ?? null;
    },
  };
}
