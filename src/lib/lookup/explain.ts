import { LOOKUP_BUSY } from './proxy';

export const EXPLAIN_ENDPOINT = 'https://api.coupletapp.com/v1/explain';

export interface ExplainInput {
  /** The word as written in the subtitle. */
  readonly word: string;
  /** The line holding the word, with the lines around it. */
  readonly cues: readonly string[];
  readonly current: number;
  readonly source: string;
  readonly target: string;
}

export interface Explanation {
  readonly text: string;
  /** Explanations left today. */
  readonly remaining: number;
}

export interface ProxyExplainOptions {
  readonly accessToken: () => Promise<string | null>;
  readonly fetchFn?: typeof fetch;
  readonly endpoint?: string;
}

const REQUEST_TIMEOUT_MS = 30_000;
/** These survive being sent between the page and the background script as text. */
const EXPLAIN_SIGN_IN = 'explain-sign-in';
const EXPLAIN_LIMIT = 'explain-limit';

interface ExplainBody {
  readonly explanation?: unknown;
  readonly remaining?: unknown;
  readonly error?: unknown;
  readonly limit?: unknown;
  readonly resetAt?: unknown;
}

/** Explanations need an account, because each person has a daily allowance. */
export function createProxyExplain(options: ProxyExplainOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  return async (input: ExplainInput): Promise<Explanation> => {
    const token = await options.accessToken().catch(() => null);
    if (!token) throw new Error(EXPLAIN_SIGN_IN);
    const response = await fetchFn(options.endpoint ?? EXPLAIN_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as ExplainBody;
    if (response.status === 401) throw new Error(EXPLAIN_SIGN_IN);
    if (body.error === 'explain_limit') {
      throw new Error(
        `${EXPLAIN_LIMIT}|${String(body.limit)}|${String(body.resetAt)}`,
      );
    }
    if (body.error === 'service_busy') throw new Error(LOOKUP_BUSY);
    if (
      !response.ok ||
      typeof body.explanation !== 'string' ||
      typeof body.remaining !== 'number'
    ) {
      throw new Error(`Explain answered ${String(response.status)}`);
    }
    return { text: body.explanation, remaining: body.remaining };
  };
}

/** What the page says when an explanation fails, and whether trying again can help. */
export function explainFailure(error: unknown): {
  readonly text: string;
  readonly canRetry: boolean;
} {
  const message = String(error);
  const limit = new RegExp(`${EXPLAIN_LIMIT}\\|(\\d+)\\|([^\\s|]+)`).exec(
    message,
  );
  if (limit) {
    // In English, like the sentence around it, whatever the system's language.
    const time = new Date(limit[2] ?? '').toLocaleTimeString('en', {
      hour: 'numeric',
      minute: '2-digit',
    });
    return {
      text: `You've used today's ${String(limit[1])} explanations. More at ${time}.`,
      canRetry: false,
    };
  }
  if (message.includes(EXPLAIN_SIGN_IN)) {
    return { text: 'Sign in again to use explanations.', canRetry: false };
  }
  if (message.includes(LOOKUP_BUSY)) {
    return {
      text: 'Explanations are busy right now. Try again later.',
      canRetry: false,
    };
  }
  return { text: "Couldn't explain this sentence", canRetry: true };
}

const EXPLAIN_MESSAGE_TYPE = 'explain';

export interface ExplainMessage {
  readonly type: typeof EXPLAIN_MESSAGE_TYPE;
  readonly input: ExplainInput;
}

type ExplainResponse =
  | { readonly ok: true; readonly value: Explanation }
  | { readonly ok: false; readonly error: string };

export function isExplainMessage(message: unknown): message is ExplainMessage {
  return (message as { type?: unknown } | null)?.type === EXPLAIN_MESSAGE_TYPE;
}

/** The background script holds the session, so pages ask it. */
export function answerExplainMessage(
  message: ExplainMessage,
  explain: (input: ExplainInput) => Promise<Explanation>,
  respond: (response: ExplainResponse) => void,
): void {
  explain(message.input).then(
    (value) => {
      respond({ ok: true, value });
    },
    (error: unknown) => {
      respond({ ok: false, error: String(error) });
    },
  );
}

export function createExplainClient(
  send: (message: ExplainMessage) => Promise<unknown>,
) {
  return async (input: ExplainInput): Promise<Explanation> => {
    const response = (await send({
      type: EXPLAIN_MESSAGE_TYPE,
      input,
    })) as ExplainResponse;
    if (!response.ok) throw new Error(response.error);
    return response.value;
  };
}
