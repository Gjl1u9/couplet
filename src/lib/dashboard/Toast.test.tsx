// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('Toast', () => {
  let root: Root;
  let host: HTMLElement;
  const onDismiss = vi.fn();
  const onUndo = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onDismiss.mockClear();
    onUndo.mockClear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
  });

  const show = (message: string | null) => {
    act(() => {
      root.render(
        <Toast message={message} onUndo={onUndo} onDismiss={onDismiss} />,
      );
    });
  };

  it('keeps an empty live region so the message is announced', () => {
    show(null);
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('.toast')).toBeNull();
  });

  it('dismisses itself after a while and offers Undo', () => {
    show('bank stopped');
    act(() => {
      host.querySelector('button')?.click();
    });
    expect(onUndo).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('stays while pointed at', () => {
    show('bank stopped');
    const toast = host.querySelector('.toast');
    act(() => {
      toast?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      toast?.dispatchEvent(
        new MouseEvent('mouseout', {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
