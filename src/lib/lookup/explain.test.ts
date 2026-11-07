import { describe, expect, it, vi } from 'vitest';
import {
  createExplainClient,
  createProxyExplain,
  explainFailure,
  type ExplainInput,
} from './explain';

const INPUT: ExplainInput = {
  word: 'banks',
  cues: ['We sat by the river.', 'The banks were steep.'],
  current: 1,
  source: 'en',
  target: 'zh-TW',
};

function setup(status: number, body: unknown, token: string | null = 'token') {
  const fetchFn = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  const explain = createProxyExplain({
    accessToken: () => Promise.resolve(token),
    fetchFn,
    endpoint: 'https://api.test/v1/explain',
  });
  return { explain, fetchFn };
}

describe('createProxyExplain', () => {
  it('sends the sentence with the account, and returns what is left', async () => {
    const { explain, fetchFn } = setup(200, {
      explanation: 'River sides.',
      remaining: 19,
    });
    await expect(explain(INPUT)).resolves.toEqual({
      text: 'River sides.',
      remaining: 19,
    });
    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ authorization: 'Bearer token' });
    expect(JSON.parse(init?.body as string)).toEqual(INPUT);
  });

  it('asks nothing of the service without an account', async () => {
    const { explain, fetchFn } = setup(200, {}, null);
    await expect(explain(INPUT)).rejects.toThrow('explain-sign-in');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [401, { error: 'login_required' }, 'explain-sign-in'],
    [
      429,
      {
        error: 'explain_limit',
        limit: 20,
        resetAt: '2026-11-08T00:00:00.000Z',
      },
      'explain-limit|20|2026-11-08T00:00:00.000Z',
    ],
    [503, { error: 'service_busy' }, 'lookup-busy'],
    [502, { error: 'explain_failed' }, '502'],
    [200, { explanation: 1 }, '200'],
  ])('reports %i %j', async (status, body, message) => {
    const { explain } = setup(status, body);
    await expect(explain(INPUT)).rejects.toThrow(message);
  });
});

describe('explainFailure', () => {
  it('names the allowance and when it returns, with nothing to retry', () => {
    const failure = explainFailure(
      'Error: explain-limit|20|2026-11-08T00:00:00.000Z',
    );
    expect(failure.text).toContain("You've used today's 20 explanations.");
    expect(failure.text).toContain('More at ');
    expect(failure.canRetry).toBe(false);
  });

  it('offers another try only when it can help', () => {
    expect(explainFailure('Error: explain-sign-in').canRetry).toBe(false);
    expect(explainFailure('Error: lookup-busy').canRetry).toBe(false);
    expect(explainFailure(new Error('Down'))).toEqual({
      text: "Couldn't explain this sentence",
      canRetry: true,
    });
  });
});

describe('createExplainClient', () => {
  it('turns a failed answer back into an error', async () => {
    const client = createExplainClient(() =>
      Promise.resolve({ ok: false, error: 'Error: explain-sign-in' }),
    );
    await expect(client(INPUT)).rejects.toThrow('explain-sign-in');
  });
});
