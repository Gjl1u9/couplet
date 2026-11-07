import { DurableObject } from 'cloudflare:workers';
import { createQwenExplain, createQwenLookup } from '../../src/lib/lookup/qwen';
import type { WordEntry } from '../../src/lib/lookup/types';
import {
  handleRequest,
  type EntryCache,
  type ExplanationCache,
} from './handler';
import { verifyToken } from './jwt';
import { consume, refund, type CounterStorage } from './quota';

interface Env {
  readonly QWEN_API_KEY: string;
  readonly IP_HASH_SALT: string;
  readonly SUPABASE_URL: string;
  readonly ABUSE_DAILY_LIMIT: string;
  readonly GLOBAL_DAILY_LIMIT: string;
  readonly EXPLAIN_DAILY_LIMIT: string;
  readonly QUOTA: DurableObjectNamespace<Quota>;
}

const FORGET_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/** One per subject. A Durable Object runs one request at a time, so counts are exact. */
export class Quota extends DurableObject {
  private counters(): CounterStorage {
    const { storage } = this.ctx;
    return {
      get: (key) => storage.get<number>(key),
      put: (key, value) => storage.put(key, value),
      delete: (key) => storage.delete(key),
      list: () => storage.list<number>(),
    };
  }

  async consume(day: string, limit: number): Promise<boolean> {
    const allowed = await consume(this.counters(), day, limit);
    // Pushed forward by each use, so it fires only once this subject's latest day is over.
    if (allowed) await this.ctx.storage.setAlarm(Date.now() + FORGET_AFTER_MS);
    return allowed;
  }

  refund(day: string): Promise<void> {
    return refund(this.counters(), day);
  }

  async used(day: string): Promise<number> {
    return (await this.ctx.storage.get<number>(day)) ?? 0;
  }

  /** Someone who stops coming back leaves nothing behind, as the privacy policy promises. */
  alarm(): Promise<void> {
    return this.ctx.storage.deleteAll();
  }
}

const CACHE_SECONDS = 30 * 24 * 60 * 60;
const KEYS_CACHE_SECONDS = 60 * 60;

const entryCache = (): EntryCache => {
  const url = (key: string) =>
    `https://cache.couplet.internal/entry/${encodeURIComponent(key)}`;
  return {
    get: async (key) => {
      const hit = await caches.default.match(url(key));
      return hit ? await hit.json<WordEntry>() : undefined;
    },
    put: (key, entry) =>
      caches.default.put(
        url(key),
        new Response(JSON.stringify(entry), {
          headers: { 'cache-control': `max-age=${String(CACHE_SECONDS)}` },
        }),
      ),
  };
};

const explanationCache = (): ExplanationCache => {
  const url = (key: string) =>
    `https://cache.couplet.internal/explanation/${key}`;
  return {
    get: async (key) => {
      const hit = await caches.default.match(url(key));
      return hit ? await hit.text() : undefined;
    },
    put: (key, explanation) =>
      caches.default.put(
        url(key),
        new Response(explanation, {
          headers: { 'cache-control': `max-age=${String(CACHE_SECONDS)}` },
        }),
      ),
  };
};

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const issuer = `${env.SUPABASE_URL}/auth/v1`;
    const keys = async () => {
      const response = await fetch(`${issuer}/.well-known/jwks.json`, {
        cf: { cacheTtl: KEYS_CACHE_SECONDS, cacheEverything: true },
      });
      const body = await response.json<{ keys?: JsonWebKey[] }>();
      return body.keys ?? [];
    };
    const quota = (subject: string) =>
      env.QUOTA.get(env.QUOTA.idFromName(subject));
    return handleRequest(request, {
      config: {
        abuseLimit: Number(env.ABUSE_DAILY_LIMIT),
        globalLimit: Number(env.GLOBAL_DAILY_LIMIT),
        explainLimit: Number(env.EXPLAIN_DAILY_LIMIT),
      },
      lookup: createQwenLookup(env.QWEN_API_KEY),
      explain: createQwenExplain(env.QWEN_API_KEY),
      explanations: explanationCache(),
      quota: {
        consume: (subject, day, limit) => quota(subject).consume(day, limit),
        refund: (subject, day) => quota(subject).refund(day),
        used: (subject, day) => quota(subject).used(day),
      },
      cache: entryCache(),
      verifyUser: async (token) =>
        (
          await verifyToken(token, {
            keys,
            issuer,
            nowSeconds: Date.now() / 1000,
          })
        )?.userId ?? null,
      hash: async (text) =>
        hex(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`${env.IP_HASH_SALT}:${text}`),
          ),
        ),
      now: Date.now,
    });
  },
} satisfies ExportedHandler<Env>;
