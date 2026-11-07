interface Jwk extends JsonWebKey {
  readonly kid?: string;
}

export type KeyFetcher = () => Promise<readonly Jwk[]>;

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;

const fromBase64Url = (text: string) =>
  Uint8Array.from(
    atob(text.replaceAll('-', '+').replaceAll('_', '/')),
    (char) => char.charCodeAt(0),
  );

const decodeJson = (text: string): unknown =>
  JSON.parse(new TextDecoder().decode(fromBase64Url(text)));

export interface VerifiedToken {
  readonly userId: string;
}

/**
 * Checks a Supabase access token against the project's public keys. Anything wrong with it
 * resolves to null, so a bad token is simply treated as no account.
 */
export async function verifyToken(
  token: string,
  options: {
    readonly keys: KeyFetcher;
    readonly issuer: string;
    readonly nowSeconds: number;
  },
): Promise<VerifiedToken | null> {
  try {
    const [head, body, signature] = token.split('.');
    if (!head || !body || !signature) return null;
    const header = decodeJson(head) as { alg?: unknown; kid?: unknown };
    if (header.alg !== 'ES256') return null;
    const jwk = (await options.keys()).find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, [
      'verify',
    ]);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    if (!valid) return null;
    const claims = decodeJson(body) as {
      sub?: unknown;
      exp?: unknown;
      iss?: unknown;
      aud?: unknown;
    };
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.exp !== 'number' ||
      claims.exp <= options.nowSeconds ||
      claims.iss !== options.issuer ||
      claims.aud !== 'authenticated'
    ) {
      return null;
    }
    return { userId: claims.sub };
  } catch {
    return null;
  }
}
