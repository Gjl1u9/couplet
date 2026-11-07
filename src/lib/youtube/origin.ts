import type { ContextCue, VideoOrigin } from '../vocabulary/vocabulary';

const TITLE_SELECTOR = 'ytd-watch-metadata h1';
const JUMP_LEAD_SECONDS = 2;

export function currentVideoOrigin(
  href: string,
  page: Pick<Document, 'querySelector' | 'title'>,
): VideoOrigin | null {
  const videoId = new URL(href).searchParams.get('v');
  if (!videoId) return null;
  const heading = page.querySelector(TITLE_SELECTOR)?.textContent.trim();
  const title = heading ?? page.title.replace(/ - YouTube$/, '');
  return { site: 'youtube', videoId, title };
}

/** Starts a little early, so the sentence is heard from its beginning. */
export function jumpLink(origin: VideoOrigin, cue: ContextCue | undefined) {
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', origin.videoId);
  if (typeof cue?.startMs === 'number') {
    const seconds = Math.floor(cue.startMs / 1000) - JUMP_LEAD_SECONDS;
    url.searchParams.set('t', `${String(Math.max(seconds, 0))}s`);
  }
  return url.href;
}
