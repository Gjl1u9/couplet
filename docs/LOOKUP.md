# Lookup service

Word lookups go through our Cloudflare Worker, [`worker/`](../worker), at `api.coupletapp.com`. It holds the AI key. Lookups are free and unlimited for people, and need no account. See [`AUTH.md`](AUTH.md).

## Request

`POST /v1/lookup` with `{ word, source, target }`, an `x-install-id` header, and a Supabase access token when signed in. Word length and language codes are checked, and the prompt lives on the server, so the service can only look up words.

## Explanations

`POST /v1/explain` with `{ word, cues, current, source, target }` and a Supabase access token. It needs an account, and sends up to three lines of at most 300 characters to the model, which writes two or three sentences on the word's meaning, part of speech, and grammar.

Each account gets 50 a day, set by `EXPLAIN_DAILY_LIMIT`, resetting at midnight UTC. Unlike lookups, this allowance is shown, as 「48 left today」. The same word in the same lines is cached by a salted hash, for everyone, and costs nothing to ask again, even past the allowance. Failures are refunded.

## Ceilings

People have no daily allowance and see no counter. Two ceilings exist only to stop scripts and cap the bill. Reaching either reads as 「Lookups are busy right now. Try again later.」, never as a used-up allowance. Each resets at midnight UTC, and is set in [`wrangler.toml`](../worker/wrangler.toml).

| Ceiling     | Per day | Counts by                                                          |
| ----------- | ------- | ------------------------------------------------------------------ |
| One source  | 2,000   | Verified account, or install ID and the salted hash of the address |
| The service | 20,000  | Everyone. Caps the daily cost                                      |

- A cached word costs nothing and counts for nothing. Entries are shared by word and languages, because they do not depend on the sentence, and contain nothing about who asked.
- A failed lookup is refunded.
- A bad or expired token is treated as no account.
- Addresses are never stored, only their salted hash, and counters from earlier days are removed.

## Model

Lookups use `qwen3.7-flash` through Alibaba Cloud's international endpoint in Singapore. It was compared with DeepSeek Flash, GLM, and other Qwen models on 2026-11-07, using 21 words across seven languages.

| Model            | Cost per 1,000 lookups | Result                                                                               |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `qwen3.7-flash`  | $0.022                 | Chosen. Finds dictionary forms well. Slightly less consistent, and misses some slang |
| `deepseek-flash` | $0.062 to $0.125       | Slightly better, at three to six times the cost                                      |
| `qwen-flash`     | $0.042                 | Wrong script and invented meanings                                                   |
| `qwen3.5-flash`  | $0.061                 | Rarely finds dictionary forms                                                        |
| `glm-4.7-flash`  | Free                   | Refused 15 of 21 as overloaded, with weaker answers                                  |

Occasional Mainland terms such as 自行車 or 地鐵 are an accepted tradeoff, because Taiwanese readers understand them. Prices come from each provider's page on that date, at about 412 input and 72 output tokens per lookup.

## Accounts and secrets

| Worker secret  | Purpose            |
| -------------- | ------------------ |
| `QWEN_API_KEY` | Calls the AI model |
| `IP_HASH_SALT` | Hashes addresses   |

The Worker checks tokens against Supabase's public keys, so it holds no Supabase secret.

```bash
npx wrangler deploy --config worker/wrangler.toml
```

The website deploys the same way, with [`site/wrangler.toml`](../site/wrangler.toml).
