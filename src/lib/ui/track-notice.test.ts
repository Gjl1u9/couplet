// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTrackNotice, type TrackNotice } from './track-notice';

describe('createTrackNotice', () => {
  let layer: HTMLElement;
  let notice: TrackNotice;
  const find = (selector: string) => layer.querySelector<HTMLElement>(selector);

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.replaceChildren(layer);
    notice = createTrackNotice({ layer: () => layer });
  });

  afterEach(() => {
    notice.close();
    vi.useRealTimers();
  });

  it('says the video has no subtitles', () => {
    notice.show();
    expect(find('.player-toast-note')?.textContent).toBe(
      'This video has no subtitles',
    );
    expect(find('.track-notice')?.getAttribute('role')).toBe('status');
  });

  it('closes from its close button', () => {
    notice.show();
    find('.close')?.click();
    expect(notice.isOpen()).toBe(false);
  });

  it('closes on a press anywhere else, but not on itself', () => {
    notice.show();
    find('.player-toast-note')?.dispatchEvent(
      new Event('pointerdown', { bubbles: true, composed: true }),
    );
    expect(notice.isOpen()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(notice.isOpen()).toBe(false);
  });

  it('leaves after 8 seconds, but not while pointed at', () => {
    notice.show();
    const current = find('.track-notice');
    current?.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(20_000);
    expect(notice.isOpen()).toBe(true);
    current?.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(8_000);
    expect(notice.isOpen()).toBe(false);
  });

  it('keeps one notice at a time', () => {
    notice.show();
    notice.show();
    expect(layer.querySelectorAll('.track-notice')).toHaveLength(1);
  });

  it('shows nothing without a player', () => {
    const detached = createTrackNotice({ layer: () => null });
    detached.show();
    expect(detached.isOpen()).toBe(false);
  });
});
