import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cue } from './batches';
import { createTranslationQueue, type QueueOptions } from './queue';

interface Call {
  texts: readonly string[];
  signal: AbortSignal;
  resolve: (translations: readonly string[]) => void;
  reject: (error: unknown) => void;
}

function fakeTranslator() {
  const calls: Call[] = [];
  const translate = (texts: readonly string[], signal: AbortSignal) =>
    new Promise<readonly string[]>((resolve, reject) => {
      calls.push({ texts, signal, resolve, reject });
    });
  return { calls, translate };
}

/** 每 10 秒一句，每批 2 句，共 6 批。 */
function cues(count = 12): Cue[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${String(i)}`,
    start: i * 10,
    end: (i + 1) * 10,
    text: `line ${String(i)}`,
  }));
}

const flush = () => vi.advanceTimersByTimeAsync(0);
const answer = (call: Call | undefined) => {
  if (!call) throw new Error('沒有進行中的請求');
  call.resolve(call.texts.map((t) => `zh ${t}`));
};

function setup(overrides: Partial<QueueOptions> = {}) {
  const translator = fakeTranslator();
  const onTranslated = vi.fn();
  const onBatchFailed = vi.fn();
  const onComplete = vi.fn();
  const queue = createTranslationQueue({
    cues: cues(),
    translate: translator.translate,
    onTranslated,
    onBatchFailed,
    onComplete,
    maxCuesPerBatch: 2,
    burst: 1000,
    refillIntervalMs: 2000,
    requestTimeoutMs: 10_000,
    maxAttempts: 3,
    backoffMs: 1000,
    ...overrides,
  });
  return { ...translator, queue, onTranslated, onBatchFailed, onComplete };
}

const firstLines = (calls: readonly Call[]) => calls.map((c) => c.texts[0]);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('發送順序', () => {
  it('一次只送一批，上一批回來才送下一批', async () => {
    const { calls, queue } = setup();
    queue.start(0);
    await flush();
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);

    answer(calls[0]);
    await flush();
    expect(calls).toHaveLength(2);
  });

  it('從播放位置翻到結尾，再繞回開頭', async () => {
    const { calls, queue, onComplete } = setup();
    queue.start(45);
    for (let i = 0; i < 6; i += 1) {
      await flush();
      answer(calls[i]);
    }
    await flush();
    expect(firstLines(calls)).toEqual([
      'line 4',
      'line 6',
      'line 8',
      'line 10',
      'line 0',
      'line 2',
    ]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('播放位置超過最後一句時，從頭開始', async () => {
    const { calls, queue } = setup();
    queue.start(9999);
    await flush();
    expect(firstLines(calls)).toEqual(['line 0']);
  });

  it('重複呼叫 start 不會多送', async () => {
    const { calls, queue } = setup();
    queue.start(0);
    queue.start(0);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('重複呼叫 start 不會改變播放位置，也不會重複完成', async () => {
    const { calls, queue, onComplete } = setup({ cues: cues(4) });
    queue.start(0);
    queue.start(25);
    await flush();
    answer(calls[0]);
    await flush();
    answer(calls[1]);
    await flush();
    expect(firstLines(calls)).toEqual(['line 0', 'line 2']);
    queue.start(0);
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('呼叫 start 之前不會送', async () => {
    const { calls, queue } = setup();
    queue.seek(50);
    await flush();
    expect(calls).toHaveLength(0);
  });
});

describe('跳轉', () => {
  it('下一批改從新位置開始，進行中的請求不取消也不重送', async () => {
    const { calls, queue, onTranslated } = setup();
    queue.start(0);
    await flush();

    queue.seek(85);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal.aborted).toBe(false);

    answer(calls[0]);
    await flush();
    expect(firstLines(calls)).toEqual(['line 0', 'line 8']);
    expect(onTranslated).toHaveBeenCalledTimes(1);
  });

  it('連續跳轉不會增加請求，只看最後的位置', async () => {
    const { calls, queue } = setup();
    queue.start(0);
    await flush();
    for (const t of [30, 60, 10, 90, 50]) queue.seek(t);
    await flush();
    expect(calls).toHaveLength(1);

    answer(calls[0]);
    await flush();
    expect(firstLines(calls)).toEqual(['line 0', 'line 4']);
  });

  it('跳回已翻好的位置不會重送', async () => {
    const { calls, queue } = setup();
    queue.start(0);
    await flush();
    answer(calls[0]);
    await flush();
    queue.seek(5);
    answer(calls[1]);
    await flush();
    expect(firstLines(calls)).toEqual(['line 0', 'line 2', 'line 4']);
  });
});

describe('切換影片（dispose）', () => {
  it('取消進行中的請求，之後不再送', async () => {
    const { calls, queue } = setup();
    queue.start(0);
    await flush();
    queue.dispose();
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });

  it('晚到的結果即使翻譯服務忽略 abort，也會被丟棄', async () => {
    const { calls, queue, onTranslated, onComplete } = setup();
    queue.start(0);
    await flush();
    queue.dispose();
    answer(calls[0]);
    await flush();
    expect(onTranslated).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3, 4, 5])(
    '結果回來後第 %i 個微任務才 dispose，只要回呼還沒執行就會被丟棄',
    async (microtasks) => {
      const { calls, queue, onTranslated, onComplete } = setup({
        cues: cues(2),
      });
      queue.start(0);
      await flush();

      answer(calls[0]);
      for (let i = 0; i < microtasks; i += 1) await Promise.resolve();
      const translatedCalls = onTranslated.mock.calls.length;
      const completeCalls = onComplete.mock.calls.length;
      queue.dispose();
      await flush();

      // dispose 之後不能再有任何新的回呼。
      expect(onTranslated).toHaveBeenCalledTimes(translatedCalls);
      expect(onComplete).toHaveBeenCalledTimes(completeCalls);
    },
  );

  it('dispose 不算失敗，即使這批已經用完重試次數', async () => {
    const { calls, queue, onBatchFailed } = setup({ maxAttempts: 1 });
    queue.start(0);
    await flush();
    queue.dispose();
    calls[0]?.reject(new Error('aborted'));
    await flush();
    expect(onBatchFailed).not.toHaveBeenCalled();
  });

  it('等待重試或節流時 dispose，計時器也不會再觸發請求', async () => {
    const { calls, queue } = setup();
    queue.start(0);
    await flush();
    calls[0]?.reject(new Error('network'));
    await flush();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    queue.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });

  it('dispose 之後呼叫 start 和 seek 都沒有作用', async () => {
    const { calls, queue } = setup();
    queue.dispose();
    queue.start(0);
    queue.seek(10);
    await flush();
    expect(calls).toHaveLength(0);
  });
});

describe('失敗處理', () => {
  it('失敗後退避重試，等待時間逐次加倍，期間不送其他批', async () => {
    const { calls, queue } = setup();
    queue.start(0);
    await flush();

    calls[0]?.reject(new Error('network'));
    await flush();
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(firstLines(calls)).toEqual(['line 0', 'line 0']);

    calls[1]?.reject(new Error('network'));
    await flush();
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
  });

  it('達到上限就放棄這批，繼續下一批，完成時回報數量', async () => {
    const { calls, queue, onBatchFailed, onComplete } = setup({
      cues: cues(4),
    });
    queue.start(0);
    await flush();
    for (let i = 0; i < 3; i += 1) {
      calls[i]?.reject(new Error('network'));
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(onBatchFailed).toHaveBeenCalledTimes(1);
    expect(onBatchFailed).toHaveBeenCalledWith(['c0', 'c1'], expect.any(Error));
    expect(firstLines(calls)).toEqual(['line 0', 'line 0', 'line 0', 'line 2']);

    answer(calls[3]);
    await flush();
    expect(onComplete).toHaveBeenCalledWith({ translated: 2, failed: 2 });
  });

  it('翻譯函式同步丟錯也視為失敗，不會卡住', async () => {
    const onBatchFailed = vi.fn();
    const queue = createTranslationQueue({
      cues: cues(2),
      translate: () => {
        throw new Error('sync');
      },
      onTranslated: vi.fn(),
      onBatchFailed,
      onComplete: vi.fn(),
      maxAttempts: 1,
    });
    queue.start(0);
    await flush();
    expect(onBatchFailed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('逾時會取消並重試，舊請求晚到的結果不採用', async () => {
    const { calls, queue, onTranslated } = setup();
    queue.start(0);
    await flush();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls[0]?.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2);

    answer(calls[0]);
    await flush();
    expect(onTranslated).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);

    answer(calls[1]);
    await flush();
    expect(onTranslated).toHaveBeenCalledTimes(1);
  });

  it('回傳行數不符時把這批對半拆開重送', async () => {
    const { calls, queue, onTranslated } = setup({
      cues: cues(4),
      maxCuesPerBatch: 4,
    });
    queue.start(0);
    await flush();
    calls[0]?.resolve(['只有一行']);
    await flush();
    expect(calls[1]?.texts).toEqual(['line 0', 'line 1']);
    answer(calls[1]);
    await flush();
    expect(calls[2]?.texts).toEqual(['line 2', 'line 3']);
    expect(onTranslated).toHaveBeenCalledTimes(1);
  });

  it('只剩一句還是行數不符就算失敗，不會無限重試', async () => {
    const { calls, queue, onBatchFailed } = setup({
      cues: cues(1),
      maxCuesPerBatch: 1,
    });
    queue.start(0);
    for (let i = 0; i < 3; i += 1) {
      await flush();
      calls[i]?.resolve([]);
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(calls).toHaveLength(3);
    expect(onBatchFailed).toHaveBeenCalledTimes(1);
  });

  it('回呼丟錯不會讓佇列停住', async () => {
    const { calls, queue } = setup({
      onTranslated: () => {
        throw new Error('consumer');
      },
    });
    queue.start(0);
    await flush();
    answer(calls[0]);
    await flush();
    expect(calls).toHaveLength(2);
  });
});

describe('結果與節流', () => {
  it('結果對應到正確的字幕 ID', async () => {
    const { calls, queue, onTranslated } = setup();
    queue.start(0);
    await flush();
    answer(calls[0]);
    await flush();
    expect(onTranslated).toHaveBeenCalledWith([
      { id: 'c0', translation: 'zh line 0' },
      { id: 'c1', translation: 'zh line 1' },
    ]);
  });

  it('前面幾批連續送，用完額度後依間隔送', async () => {
    const { calls, queue } = setup({ burst: 2, refillIntervalMs: 2000 });
    queue.start(0);
    await flush();
    answer(calls[0]);
    await flush();
    expect(calls).toHaveLength(2);

    answer(calls[1]);
    await flush();
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
  });

  it('沒有可翻的字幕時直接完成', async () => {
    const { calls, queue, onComplete } = setup({ cues: [] });
    queue.start(0);
    await flush();
    expect(calls).toHaveLength(0);
    expect(onComplete).toHaveBeenCalledWith({ translated: 0, failed: 0 });
  });

  it('全部完成後沒有殘留的計時器，再跳轉也不會送', async () => {
    const { calls, queue, onComplete } = setup({ cues: cues(2) });
    queue.start(0);
    await flush();
    answer(calls[0]);
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    queue.seek(0);
    await flush();
    expect(calls).toHaveLength(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
