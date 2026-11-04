import { createBatches, type Batch, type BatchItem, type Cue } from './batches';

/**
 * 單一 session 的翻譯佇列。換影片時 dispose，再為新影片建立一個。
 *
 * 只允許一個請求進行中，下一批在發送當下才決定，所以跳轉不需要取消或重排：
 * 從最後的播放位置翻到結尾，再繞回開頭。dispose 之後，所有晚到的結果都會被丟棄。
 */

export type Translate = (
  texts: readonly string[],
  signal: AbortSignal,
) => Promise<readonly string[]>;

export interface TranslatedCue {
  readonly id: string;
  readonly translation: string;
}

export interface QueueSummary {
  readonly translated: number;
  readonly failed: number;
}

export interface QueueOptions {
  readonly cues: readonly Cue[];
  readonly translate: Translate;
  readonly onTranslated: (results: readonly TranslatedCue[]) => void;
  readonly onBatchFailed: (cueIds: readonly string[], error: unknown) => void;
  readonly onComplete: (summary: QueueSummary) => void;
  readonly maxCuesPerBatch?: number;
  readonly maxCharsPerBatch?: number;
  /** 一開始可以連續送的批數。 */
  readonly burst?: number;
  /** 額度用完後，每隔多久可以再送一批。 */
  readonly refillIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly maxAttempts?: number;
  /** 第一次失敗後的等待時間，之後逐次加倍。 */
  readonly backoffMs?: number;
}

export interface TranslationQueue {
  start: (playhead: number) => void;
  seek: (playhead: number) => void;
  dispose: () => void;
}

interface PendingBatch extends Batch {
  attempts: number;
}

class LineCountMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`預期 ${String(expected)} 行翻譯，收到 ${String(actual)} 行`);
    this.name = 'LineCountMismatchError';
  }
}

export function createTranslationQueue(
  options: QueueOptions,
): TranslationQueue {
  const {
    translate,
    onTranslated,
    onBatchFailed,
    onComplete,
    maxCuesPerBatch = 150,
    maxCharsPerBatch = 6500,
    burst = 10,
    refillIntervalMs = 2000,
    requestTimeoutMs = 10_000,
    maxAttempts = 3,
    backoffMs = 1000,
  } = options;

  const pending: PendingBatch[] = createBatches(options.cues, {
    maxCues: maxCuesPerBatch,
    maxChars: maxCharsPerBatch,
  }).map((batch) => ({ ...batch, attempts: 0 }));

  let started = false;
  let disposed = false;
  let playhead = 0;
  let active: AbortController | null = null;
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;
  let blockedUntil = 0;
  let tokens = burst;
  let tokensAt = Date.now();
  let translated = 0;
  let failed = 0;

  const refill = (now: number) => {
    tokens = Math.min(burst, tokens + (now - tokensAt) / refillIntervalMs);
    tokensAt = now;
  };

  const pickNext = (): PendingBatch | undefined =>
    pending.find((batch) => batch.end > playhead) ?? pending[0];

  const wakeAt = (time: number, now: number) => {
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      pump();
    }, time - now);
  };

  const notify = (callback: () => void) => {
    try {
      callback();
    } catch (error) {
      console.error('翻譯佇列的回呼發生錯誤', error);
    }
  };

  const pump = () => {
    if (disposed) return;
    if (active !== null || wakeTimer !== null) return;

    const batch = pickNext();
    if (!batch) {
      notify(() => {
        onComplete({ translated, failed });
      });
      return;
    }

    const now = Date.now();
    if (now < blockedUntil) {
      wakeAt(blockedUntil, now);
      return;
    }

    refill(now);
    if (tokens < 1) {
      wakeAt(now + Math.ceil((1 - tokens) * refillIntervalMs), now);
      return;
    }
    tokens -= 1;

    void run(batch);
  };

  const remove = (batch: PendingBatch) => {
    pending.splice(pending.indexOf(batch), 1);
  };

  const handleSuccess = (
    batch: PendingBatch,
    translations: readonly string[],
  ) => {
    const results: TranslatedCue[] = [];
    const blank: BatchItem[] = [];
    batch.items.forEach((item, index) => {
      const translation = translations[index] ?? '';
      if (translation.trim() === '') blank.push(item);
      else results.push({ id: item.id, translation });
    });

    translated += results.length;
    if (results.length > 0) {
      notify(() => {
        onTranslated(results);
      });
    }

    // Google 偶爾對部分句子回傳空字串，這些句子單獨重送。
    const attempts = batch.attempts + 1;
    if (blank.length === 0) {
      remove(batch);
    } else if (attempts < maxAttempts) {
      pending.splice(pending.indexOf(batch), 1, {
        start: batch.start,
        end: batch.end,
        items: blank,
        attempts,
      });
    } else {
      remove(batch);
      failed += blank.length;
      notify(() => {
        onBatchFailed(
          blank.map((item) => item.id),
          new Error('翻譯服務回傳空白結果'),
        );
      });
    }
  };

  /** 行數對不上時拆開，通常可以找出造成錯位的那一句。 */
  const split = (batch: PendingBatch) => {
    const middle = Math.ceil(batch.items.length / 2);
    const toPending = (items: readonly BatchItem[]): PendingBatch => ({
      start: batch.start,
      end: batch.end,
      items,
      attempts: 0,
    });
    pending.splice(
      pending.indexOf(batch),
      1,
      toPending(batch.items.slice(0, middle)),
      toPending(batch.items.slice(middle)),
    );
  };

  const handleFailure = (batch: PendingBatch, error: unknown) => {
    batch.attempts += 1;
    blockedUntil = Date.now() + backoffMs * 2 ** (batch.attempts - 1);
    if (batch.attempts < maxAttempts) return;

    remove(batch);
    failed += batch.items.length;
    notify(() => {
      onBatchFailed(
        batch.items.map((item) => item.id),
        error,
      );
    });
  };

  const request = (
    batch: PendingBatch,
    controller: AbortController,
  ): Promise<readonly string[]> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
      }, requestTimeoutMs);
      const clear = () => {
        clearTimeout(timer);
      };

      // 翻譯服務可能忽略 signal，所以這裡自己結束等待，晚到的結果不會再被採用。
      controller.signal.addEventListener(
        'abort',
        () => {
          clear();
          reject(new Error('翻譯請求已取消或逾時'));
        },
        { once: true },
      );

      try {
        translate(
          batch.items.map((item) => item.text),
          controller.signal,
        ).then(
          (result) => {
            clear();
            resolve(result);
          },
          (error: unknown) => {
            clear();
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      } catch (error) {
        clear();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

  const run = async (batch: PendingBatch) => {
    const controller = new AbortController();
    active = controller;
    try {
      const translations = await request(batch, controller);
      if (disposed) return;
      active = null;
      if (translations.length === batch.items.length) {
        handleSuccess(batch, translations);
      } else if (batch.items.length > 1) {
        split(batch);
      } else {
        handleFailure(
          batch,
          new LineCountMismatchError(batch.items.length, translations.length),
        );
      }
    } catch (error) {
      if (disposed) return;
      active = null;
      handleFailure(batch, error);
    }
    pump();
  };

  return {
    start(position) {
      if (started) return;
      started = true;
      playhead = position;
      tokensAt = Date.now();
      pump();
    },
    seek(position) {
      playhead = position;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active?.abort();
      active = null;
      if (wakeTimer !== null) clearTimeout(wakeTimer);
      wakeTimer = null;
    },
  };
}
