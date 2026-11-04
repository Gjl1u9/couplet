import { describe, expect, it, vi } from 'vitest';
import { createPortTranslate, servePortTranslate, type PortLike } from './port';
import type { Translate } from './queue';

const languages = { source: 'en', target: 'zh-TW' };

/** 一對互相連接的 Port，行為和瀏覽器相同：自己斷線不會觸發自己的 onDisconnect。 */
function portPair(): [PortLike, PortLike] {
  const make = () => ({
    messages: [] as ((message: unknown) => void)[],
    disconnects: [] as (() => void)[],
  });
  const a = make();
  const b = make();
  const side = (self: typeof a, other: typeof a): PortLike => ({
    postMessage: (message) => {
      for (const listener of other.messages) listener(message);
    },
    disconnect: () => {
      for (const listener of other.disconnects) listener();
    },
    onMessage: {
      addListener: (listener) => {
        self.messages.push(listener);
      },
    },
    onDisconnect: {
      addListener: (listener) => {
        self.disconnects.push(listener);
      },
    },
  });
  return [side(a, b), side(b, a)];
}

function connected(translate: Translate) {
  const createTranslate = vi.fn(() => translate);
  const connect = () => {
    const [client, server] = portPair();
    servePortTranslate(server, createTranslate);
    return client;
  };
  return {
    createTranslate,
    translate: createPortTranslate(languages, connect),
  };
}

describe('Port 翻譯', () => {
  it('傳回翻譯結果，並使用正確的語言', async () => {
    const { translate, createTranslate } = connected(() =>
      Promise.resolve(['甲']),
    );
    await expect(
      translate(['a'], new AbortController().signal),
    ).resolves.toEqual(['甲']);
    expect(createTranslate).toHaveBeenCalledWith(languages);
  });

  it('翻譯失敗時傳回錯誤', async () => {
    const { translate } = connected(() => Promise.reject(new Error('429')));
    await expect(
      translate(['a'], new AbortController().signal),
    ).rejects.toThrow('429');
  });

  it('取消時會中止 service worker 裡的請求', async () => {
    let upstream: AbortSignal | undefined;
    const { translate } = connected((_texts, signal) => {
      upstream = signal;
      return new Promise(() => undefined);
    });
    const controller = new AbortController();
    const result = translate(['a'], controller.signal);
    await Promise.resolve();
    expect(upstream?.aborted).toBe(false);

    controller.abort();
    await expect(result).rejects.toThrow('取消');
    expect(upstream?.aborted).toBe(true);
  });

  it('已經取消時不會建立連線', async () => {
    const connect = vi.fn<() => PortLike>();
    await expect(
      createPortTranslate(languages, connect)(['a'], AbortSignal.abort()),
    ).rejects.toThrow('取消');
    expect(connect).not.toHaveBeenCalled();
  });

  it('連線中斷時回報錯誤，例如 service worker 被關閉', async () => {
    const [client, server] = portPair();
    const result = createPortTranslate(languages, () => client)(
      ['a'],
      new AbortController().signal,
    );
    server.disconnect();
    await expect(result).rejects.toThrow('中斷');
  });

  it('無法建立連線時回報錯誤，例如擴充功能已重新載入', async () => {
    await expect(
      createPortTranslate(languages, () => {
        throw new Error('Extension context invalidated');
      })(['a'], new AbortController().signal),
    ).rejects.toThrow('invalidated');
  });

  it('格式錯誤的回應會被拒絕', async () => {
    const [client, server] = portPair();
    const result = createPortTranslate(languages, () => client)(
      ['a'],
      new AbortController().signal,
    );
    server.postMessage({ ok: true, translations: [1] });
    await expect(result).rejects.toThrow('格式');
  });

  it('取消後晚到的結果不會再送回去', async () => {
    let finish: (value: readonly string[]) => void = () => undefined;
    const [client, server] = portPair();
    const post = vi.spyOn(server, 'postMessage');
    servePortTranslate(
      server,
      () => () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const result = createPortTranslate(languages, () => client)(
      ['a'],
      controller.signal,
    );
    controller.abort();
    await expect(result).rejects.toThrow();
    finish(['甲']);
    await Promise.resolve();
    await Promise.resolve();
    expect(post).not.toHaveBeenCalled();
  });

  it('service worker 拒絕格式錯誤的請求', () => {
    const [client, server] = portPair();
    const messages: unknown[] = [];
    client.onMessage.addListener((m) => messages.push(m));
    const createTranslate = vi.fn();
    servePortTranslate(server, createTranslate);
    client.postMessage({ type: 'other' });
    expect(messages).toEqual([{ ok: false, error: '翻譯請求格式錯誤' }]);
    expect(createTranslate).not.toHaveBeenCalled();
  });
});
