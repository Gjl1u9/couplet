// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { currentVideoOrigin, jumpLink } from './origin';

const ORIGIN = { site: 'youtube', videoId: 'abc', title: 'T' } as const;

describe('currentVideoOrigin', () => {
  it('reads the video and its heading', () => {
    document.body.innerHTML =
      '<ytd-watch-metadata><h1> A title </h1></ytd-watch-metadata>';
    expect(
      currentVideoOrigin('https://www.youtube.com/watch?v=abc', document),
    ).toEqual({ site: 'youtube', videoId: 'abc', title: 'A title' });
  });

  it('falls back to the page title', () => {
    document.body.innerHTML = '';
    document.title = 'Other - YouTube';
    expect(
      currentVideoOrigin('https://www.youtube.com/watch?v=abc', document)
        ?.title,
    ).toBe('Other');
  });

  it('has no origin outside a watch page', () => {
    expect(currentVideoOrigin('https://www.youtube.com/', document)).toBeNull();
  });
});

describe('jumpLink', () => {
  it('starts two seconds before the cue', () => {
    expect(jumpLink(ORIGIN, { original: 'x', startMs: 204_500 })).toBe(
      'https://www.youtube.com/watch?v=abc&t=202s',
    );
  });

  it('stays at the start of the video', () => {
    expect(jumpLink(ORIGIN, { original: 'x', startMs: 500 })).toContain('t=0s');
  });

  it('opens the video when the time is unknown', () => {
    expect(jumpLink(ORIGIN, { original: 'x', startMs: null })).toBe(
      'https://www.youtube.com/watch?v=abc',
    );
  });
});
