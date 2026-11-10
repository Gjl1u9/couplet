// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerPill, type PillMessage } from './AnswerPill';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('AnswerPill', () => {
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

  const show = (
    message: PillMessage | null,
    undo: (() => void) | null = onUndo,
  ) => {
    act(() => {
      root.render(
        <AnswerPill message={message} onUndo={undo} onDismiss={onDismiss} />,
      );
    });
  };
  const pill = () => host.querySelector<HTMLElement>('.answer-pill');

  it('keeps the live region even when empty', () => {
    show(null);
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(pill()).toBeNull();
  });

  it('puts the word first, with Undo, and leaves after a moment', () => {
    show({ id: 1, word: 'bank', text: 'back in 3 days', undo: true });
    expect(pill()?.querySelector('strong')?.textContent).toBe('bank');
    expect(pill()?.textContent).toBe('bank · back in 3 daysUndo');
    pill()?.querySelector('button')?.click();
    expect(onUndo).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offers no Undo when there is nothing to undo', () => {
    show({ id: 1, word: 'bank', text: 'back in 3 days', undo: true }, null);
    expect(pill()?.querySelector('button')).toBeNull();
    expect(pill()?.classList.contains('no-undo')).toBe(true);
  });

  it('stays while pointed at', () => {
    show({ id: 1, text: 'Undone' });
    act(() => {
      pill()?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps problems up longer', () => {
    show({ id: 1, text: "Couldn't save. Try again.", alert: true });
    expect(pill()?.classList.contains('is-alert')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
