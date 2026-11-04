import { beforeEach, describe, expect, it, vi } from 'vitest';
import { observeClass } from './observers';

class FakeObserver {
  static instances: FakeObserver[] = [];
  options: MutationObserverInit | undefined;
  disconnected = false;
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }

  observe(_target: Node, options: MutationObserverInit): void {
    this.options = options;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  fire(): void {
    this.callback();
  }
}

function latest(): FakeObserver {
  const observer = FakeObserver.instances.at(-1);
  if (!observer) throw new Error('observer was not created');
  return observer;
}

beforeEach(() => {
  FakeObserver.instances = [];
  vi.stubGlobal('MutationObserver', FakeObserver);
});

describe('observeClass', () => {
  it('只監聽 class，不使用 subtree', () => {
    observeClass(
      { className: 'a' } as Element,
      new AbortController().signal,
      vi.fn(),
    );
    expect(latest().options).toEqual({
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  it('class 沒變時不通知', () => {
    const target = { className: 'a' } as Element;
    const onChange = vi.fn();
    observeClass(target, new AbortController().signal, onChange);

    latest().fire();
    expect(onChange).not.toHaveBeenCalled();

    target.className = 'a ad-showing';
    latest().fire();
    latest().fire();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('a ad-showing');
  });

  it('abort 後斷開監聽', () => {
    const controller = new AbortController();
    observeClass({ className: 'a' } as Element, controller.signal, vi.fn());
    controller.abort();
    expect(latest().disconnected).toBe(true);
  });

  it('signal 已經 abort 時不建立監聽', () => {
    observeClass({ className: 'a' } as Element, AbortSignal.abort(), vi.fn());
    expect(FakeObserver.instances).toHaveLength(0);
  });
});
