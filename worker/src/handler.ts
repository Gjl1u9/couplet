import { sameLanguage } from '../../src/lib/language';
import { MAX_WORD_LENGTH } from '../../src/lib/lookup/entry';
import type { ExplainInput } from '../../src/lib/lookup/explain';
import type { LookupService, WordEntry } from '../../src/lib/lookup/types';

export interface HandlerConfig {
  /** Far above what a person can look up, per install, account, or network. */
  readonly abuseLimit: number;
  /** The most the service can spend in a day. */
  readonly globalLimit: number;
  /** Explanations each account gets per day. */
  readonly explainLimit: number;
}

export interface QuotaClient {
  consume: (subject: string, day: string, limit: number) => Promise<boolean>;
  refund: (subject: string, day: string) => Promise<void>;
  used: (subject: string, day: string) => Promise<number>;
}

export interface EntryCache {
  get: (key: string) => Promise<WordEntry | null | undefined>;
  put: (key: string, entry: WordEntry) => Promise<void>;
}

export interface ExplanationCache {
  get: (key: string) => Promise<string | null | undefined>;
  put: (key: string, explanation: string) => Promise<void>;
}

export interface HandlerDeps {
  readonly config: HandlerConfig;
  readonly lookup: LookupService;
  readonly quota: QuotaClient;
  readonly cache: EntryCache;
  readonly explain: (
    input: ExplainInput,
    signal: AbortSignal,
  ) => Promise<string>;
  readonly explanations: ExplanationCache;
  readonly verifyUser: (token: string) => Promise<string | null>;
  /** Salted, so neither addresses nor sentences are stored as they are. */
  readonly hash: (text: string) => Promise<string>;
  readonly now: () => number;
}

/** Only our own pages, for the website later. The extension is not bound by CORS. */
const ALLOWED_ORIGINS = new Set([
  'https://coupletapp.com',
  'chrome-extension://pnjdidlglcbbnfhcnhmhndoakdphhckj',
]);

const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;
const INSTALL_ID = /^[0-9a-f-]{16,64}$/i;

const corsHeaders = (origin: string | null): Record<string, string> =>
  origin && ALLOWED_ORIGINS.has(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers':
          'authorization, content-type, x-install-id',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-max-age': '86400',
        vary: 'origin',
      }
    : { vary: 'origin' };

const nextUtcMidnight = (now: number) => {
  const date = new Date(now);
  date.setUTCHours(24, 0, 0, 0);
  return date.toISOString();
};

interface LookupBody {
  readonly word: string;
  readonly source: string;
  readonly target: string;
}

function parseBody(value: unknown): LookupBody | null {
  if (typeof value !== 'object' || value === null) return null;
  const { word, source, target } = value as Record<string, unknown>;
  if (
    typeof word !== 'string' ||
    typeof source !== 'string' ||
    typeof target !== 'string'
  ) {
    return null;
  }
  const trimmed = word.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_WORD_LENGTH ||
    !LANGUAGE_CODE.test(source) ||
    !LANGUAGE_CODE.test(target)
  ) {
    return null;
  }
  return { word: trimmed, source, target };
}

const MAX_CUES = 3;
const MAX_CUE_LENGTH = 300;

function parseExplainBody(value: unknown): ExplainInput | null {
  if (typeof value !== 'object' || value === null) return null;
  const { word, cues, current, source, target } = value as Record<
    string,
    unknown
  >;
  const lookup = parseBody({ word, source, target });
  if (
    !lookup ||
    !Array.isArray(cues) ||
    cues.length === 0 ||
    cues.length > MAX_CUES ||
    !cues.every(
      (cue) =>
        typeof cue === 'string' &&
        cue.trim() !== '' &&
        cue.length <= MAX_CUE_LENGTH,
    ) ||
    typeof current !== 'number' ||
    !Number.isInteger(current) ||
    current < 0 ||
    current >= cues.length
  ) {
    return null;
  }
  return { ...lookup, cues: cues as string[], current };
}

/** Needs an account: unlike lookups, each person has a visible daily allowance. */
async function handleExplain(
  parsed: unknown,
  request: Request,
  deps: HandlerDeps,
  json: (status: number, body: unknown) => Response,
): Promise<Response> {
  const body = parseExplainBody(parsed);
  if (!body) return json(400, { error: 'bad_request' });
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  const userId = token ? await deps.verifyUser(token) : null;
  if (!userId) return json(401, { error: 'login_required' });

  const now = deps.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const resetAt = nextUtcMidnight(now);
  const subject = `explain:${userId}`;
  const limit = deps.config.explainLimit;
  const answer = async (explanation: string) =>
    json(200, {
      explanation,
      remaining: Math.max(limit - (await deps.quota.used(subject, day)), 0),
    });

  // The same sentence reads the same for everyone, so asking again costs nothing.
  const key = await deps.hash(
    JSON.stringify([
      body.word.toLocaleLowerCase(),
      body.cues,
      body.current,
      body.source,
      body.target,
    ]),
  );
  const cached = await deps.explanations.get(key);
  if (cached) return answer(cached);

  if (!(await deps.quota.consume(subject, day, limit))) {
    return json(429, { error: 'explain_limit', limit, resetAt });
  }
  if (!(await deps.quota.consume('global', day, deps.config.globalLimit))) {
    await deps.quota.refund(subject, day);
    return json(503, { error: 'service_busy', resetAt });
  }
  try {
    const explanation = await deps.explain(body, request.signal);
    await deps.explanations.put(key, explanation);
    return await answer(explanation);
  } catch {
    await deps.quota.refund(subject, day);
    await deps.quota.refund('global', day);
    return json(502, { error: 'explain_failed' });
  }
}

export async function handleRequest(
  request: Request,
  deps: HandlerDeps,
): Promise<Response> {
  const origin = request.headers.get('origin');
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        ...corsHeaders(origin),
      },
    });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  const { pathname } = new URL(request.url);
  if (pathname !== '/v1/lookup' && pathname !== '/v1/explain') {
    return json(404, { error: 'not_found' });
  }
  if (request.method !== 'POST')
    return json(405, { error: 'method_not_allowed' });

  let parsed: unknown = null;
  try {
    parsed = await request.json();
  } catch {
    // Same answer as a body of the wrong shape.
  }
  if (pathname === '/v1/explain') {
    return handleExplain(parsed, request, deps, json);
  }
  const body = parseBody(parsed);
  if (!body) return json(400, { error: 'bad_request' });
  if (sameLanguage(body.source, body.target)) return json(200, { entry: null });

  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  const userId = token ? await deps.verifyUser(token) : null;
  const installId = request.headers.get('x-install-id');
  if (!userId && !(installId && INSTALL_ID.test(installId))) {
    return json(400, { error: 'bad_request' });
  }

  // A cached word costs nothing, so it costs the user nothing either.
  const cacheKey = JSON.stringify([
    body.word.toLocaleLowerCase(),
    body.source,
    body.target,
  ]);
  const cached = await deps.cache.get(cacheKey);
  if (cached) return json(200, { entry: cached });

  const now = deps.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const resetAt = nextUtcMidnight(now);
  const taken: string[] = [];
  const giveBack = () =>
    Promise.all(taken.map((subject) => deps.quota.refund(subject, day)));

  const subject = userId ? `user:${userId}` : `install:${String(installId)}`;
  // Only the kind of account, so use can be watched without logging who asked.
  console.info('lookup', userId ? 'user' : 'anonymous');
  const limit = deps.config.abuseLimit;
  // People have no daily allowance to run out of, so every ceiling reads as busy.
  const busy = () => json(503, { error: 'service_busy', resetAt });
  if (!(await deps.quota.consume(subject, day, limit))) return busy();
  taken.push(subject);

  // Reinstalling gives a new install ID, so anonymous lookups also count by network.
  if (!userId) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipSubject = `ip:${await deps.hash(ip)}`;
    if (!(await deps.quota.consume(ipSubject, day, limit))) {
      await giveBack();
      return busy();
    }
    taken.push(ipSubject);
  }

  // The most this service can spend in a day, whatever happens above.
  if (!(await deps.quota.consume('global', day, deps.config.globalLimit))) {
    await giveBack();
    return busy();
  }
  taken.push('global');

  try {
    const entry = await deps.lookup.lookUp(
      body.word,
      { source: body.source, target: body.target },
      request.signal,
    );
    if (entry) await deps.cache.put(cacheKey, entry);
    return json(200, { entry });
  } catch {
    await giveBack();
    return json(502, { error: 'lookup_failed' });
  }
}
