import { describe, expect, it } from 'vitest';
import { verifyToken } from './jwt';

const ISSUER = 'https://project.supabase.co/auth/v1';
const NOW = 1_800_000_000;

const b64url = (bytes: Uint8Array | string) => {
  const raw =
    typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...raw))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

async function keyPair(kid = 'k1') {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey(
    'jwk',
    pair.publicKey,
  )) as JsonWebKey;
  return { privateKey: pair.privateKey, jwk: { ...jwk, kid } };
}

async function sign(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'ES256', kid: 'k1' },
) {
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${b64url(new Uint8Array(signature))}`;
}

const claims = {
  sub: 'user-1',
  exp: NOW + 100,
  iss: ISSUER,
  aud: 'authenticated',
};

describe('verifyToken', () => {
  const check = async (token: string, jwk: JsonWebKey & { kid: string }) =>
    verifyToken(token, {
      keys: () => Promise.resolve([jwk]),
      issuer: ISSUER,
      nowSeconds: NOW,
    });

  it('accepts a token signed by the project', async () => {
    const { privateKey, jwk } = await keyPair();
    await expect(check(await sign(privateKey, claims), jwk)).resolves.toEqual({
      userId: 'user-1',
    });
  });

  it('refuses a token signed by anyone else', async () => {
    const ours = await keyPair();
    const theirs = await keyPair();
    await expect(
      check(await sign(theirs.privateKey, claims), ours.jwk),
    ).resolves.toBeNull();
  });

  it('refuses a changed payload', async () => {
    const { privateKey, jwk } = await keyPair();
    const [head, , signature] = (await sign(privateKey, claims)).split('.');
    const forged = `${String(head)}.${b64url(JSON.stringify({ ...claims, sub: 'other' }))}.${String(signature)}`;
    await expect(check(forged, jwk)).resolves.toBeNull();
  });

  it.each([
    ['expired', { exp: NOW - 1 }],
    ['from another project', { iss: 'https://other.supabase.co/auth/v1' }],
    ['for another audience', { aud: 'anon' }],
    ['without a subject', { sub: undefined }],
  ])('refuses a token %s', async (_name, change) => {
    const { privateKey, jwk } = await keyPair();
    await expect(
      check(await sign(privateKey, { ...claims, ...change }), jwk),
    ).resolves.toBeNull();
  });

  it('refuses another algorithm, or an unknown key', async () => {
    const { privateKey, jwk } = await keyPair();
    await expect(
      check(await sign(privateKey, claims, { alg: 'none', kid: 'k1' }), jwk),
    ).resolves.toBeNull();
    await expect(
      check(await sign(privateKey, claims, { alg: 'ES256', kid: 'x' }), jwk),
    ).resolves.toBeNull();
  });

  it('refuses nonsense, and survives a key server failure', async () => {
    const { jwk } = await keyPair();
    await expect(check('not-a-token', jwk)).resolves.toBeNull();
    await expect(check('a.b.c', jwk)).resolves.toBeNull();
    await expect(
      verifyToken('a.b.c', {
        keys: () => Promise.reject(new Error('Down')),
        issuer: ISSUER,
        nowSeconds: NOW,
      }),
    ).resolves.toBeNull();
  });
});
