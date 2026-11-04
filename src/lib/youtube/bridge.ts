import type { ControllerEvent } from '../subtitles/controller';

/**
 * 頁面環境和內容腳本之間的訊息。頁面上的任何程式都能發送 window 訊息，
 * 所以這裡只接受形狀正確的內容，也不把它用在翻譯字幕以外的地方。
 */
export const BRIDGE_TAG = '__dualSubtitles';
const MAX_CAPTION_BYTES = 20 * 1024 * 1024;

export function toBridgeMessage(
  event: ControllerEvent,
): Record<string, unknown> {
  return { [BRIDGE_TAG]: true, event };
}

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

export function parseBridgeMessage(data: unknown): ControllerEvent | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record[BRIDGE_TAG] !== true) return null;
  const event = record.event;
  if (typeof event !== 'object' || event === null) return null;
  const e = event as Record<string, unknown>;

  if (e.type === 'player') {
    if (!isNullableString(e.videoId) || typeof e.adShowing !== 'boolean') {
      return null;
    }
    return { type: 'player', videoId: e.videoId, adShowing: e.adShowing };
  }
  if (e.type === 'captions') {
    if (
      typeof e.videoId !== 'string' ||
      !isNullableString(e.lang) ||
      !isNullableString(e.kind) ||
      typeof e.status !== 'number' ||
      typeof e.body !== 'string' ||
      e.body.length > MAX_CAPTION_BYTES
    ) {
      return null;
    }
    return {
      type: 'captions',
      videoId: e.videoId,
      lang: e.lang,
      kind: e.kind,
      status: e.status,
      body: e.body,
    };
  }
  return null;
}
