// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOverlay } from './overlay';

const host = () => document.querySelector('#dual-subtitles-overlay');
const box = () => host()?.shadowRoot?.querySelector<HTMLElement>('.box');
const part = (name: string) =>
  host()?.shadowRoot?.querySelector<HTMLElement>(`.${name}`);
const nativeHidden = () =>
  document.querySelector('#dual-subtitles-hide-native') !== null;

beforeEach(() => {
  document.body.innerHTML = '<div id="movie_player"></div>';
});

afterEach(() => {
  document.body.innerHTML = '';
  document.querySelector('#dual-subtitles-hide-native')?.remove();
});

describe('createOverlay', () => {
  it('有字幕時才掛到播放器上，顯示原文和譯文', () => {
    const overlay = createOverlay();
    expect(host()).toBeNull();

    overlay.render({ original: 'hello', translation: '你好' });
    expect(host()?.parentElement?.id).toBe('movie_player');
    expect(box()?.hidden).toBe(false);
    expect(part('original')?.textContent).toBe('hello');
    expect(part('translation')?.textContent).toBe('你好');
    expect(part('translation')?.hidden).toBe(false);
  });

  it('還沒有譯文時只顯示原文，不留空行', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'hello', translation: null });
    expect(part('translation')?.hidden).toBe(true);
  });

  it('譯文之後補上時會顯示', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'hello', translation: null });
    overlay.render({ original: 'hello', translation: '你好' });
    expect(part('translation')?.hidden).toBe(false);
    expect(part('translation')?.textContent).toBe('你好');
  });

  it('render(null) 隱藏字幕，但不移除元素', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'hello', translation: null });
    overlay.render(null);
    expect(box()?.hidden).toBe(true);
    expect(host()).not.toBeNull();
  });

  it('多次 render 只有一層', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'a', translation: null });
    overlay.render({ original: 'b', translation: null });
    expect(document.querySelectorAll('#dual-subtitles-overlay')).toHaveLength(
      1,
    );
  });

  it('元素被移除後，下一句會重新掛上', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'a', translation: null });
    host()?.remove();
    overlay.render({ original: 'b', translation: null });
    expect(host()?.parentElement?.id).toBe('movie_player');
  });

  it('播放器換掉時會掛到新的播放器', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'a', translation: null });
    const old = document.querySelector('#movie_player');
    document.body.innerHTML = '<div id="movie_player"></div>';
    overlay.render({ original: 'b', translation: null });
    expect(host()?.parentElement).not.toBe(old);
    expect(host()?.parentElement?.id).toBe('movie_player');
  });

  it('字幕內容不會被當成 HTML', () => {
    const overlay = createOverlay();
    overlay.render({
      original: '<img src=x onerror=alert(1)>',
      translation: '<b>粗體</b>',
    });
    expect(part('original')?.querySelector('img')).toBeNull();
    expect(part('original')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(part('translation')?.querySelector('b')).toBeNull();
  });

  it('播放器還不存在時不會出錯', () => {
    document.body.innerHTML = '';
    const overlay = createOverlay();
    expect(() => {
      overlay.render({ original: 'a', translation: null });
    }).not.toThrow();
  });

  it('可以隱藏和恢復原生字幕，重複呼叫也只有一份樣式', () => {
    const overlay = createOverlay();
    overlay.setNativeCaptionsHidden(true);
    overlay.setNativeCaptionsHidden(true);
    expect(nativeHidden()).toBe(true);
    expect(
      document.querySelectorAll('#dual-subtitles-hide-native'),
    ).toHaveLength(1);
    overlay.setNativeCaptionsHidden(false);
    expect(nativeHidden()).toBe(false);
  });

  it('dispose 移除所有東西，把字幕交還給 YouTube', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'a', translation: null });
    overlay.setNativeCaptionsHidden(true);
    overlay.dispose();
    expect(host()).toBeNull();
    expect(nativeHidden()).toBe(false);
  });
});
