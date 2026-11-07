import type { ControllerEvent } from '../subtitles/controller';

/**
 * 頁面環境和內容腳本之間的訊息。頁面上的任何程式都能發送 window 訊息，
 * 所以這裡只接受形狀正確的內容，也不把它用在翻譯字幕以外的地方。
 */
export const BRIDGE_TAG = '__dualSubtitles';
const MAX_CAPTION_BYTES = 20 * 1024 * 1024;

/** Everything the page agent reports to the content script. */
export type PageEvent =
  | ControllerEvent
  | { readonly type: 'agent-ready' }
  | {
      readonly type: 'track-status';
      readonly videoId: string;
      readonly available: boolean;
    };

/** The content script's instruction to the page agent. */
export interface LearningLanguageCommand {
  readonly type: 'set-learning-language';
  readonly language: string;
}

const COMMAND_TAG = '__dualSubtitlesCommand';
const LANGUAGE_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

export function toBridgeCommand(
  command: LearningLanguageCommand,
): Record<string, unknown> {
  return { [COMMAND_TAG]: true, command };
}

export function parseBridgeCommand(
  data: unknown,
): LearningLanguageCommand | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record[COMMAND_TAG] !== true) return null;
  const command = record.command as Partial<LearningLanguageCommand> | null;
  if (
    command?.type !== 'set-learning-language' ||
    typeof command.language !== 'string' ||
    !LANGUAGE_CODE.test(command.language)
  ) {
    return null;
  }
  return { type: command.type, language: command.language };
}

export function toBridgeMessage(event: PageEvent): Record<string, unknown> {
  return { [BRIDGE_TAG]: true, event };
}

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

export function parseBridgeMessage(data: unknown): PageEvent | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record[BRIDGE_TAG] !== true) return null;
  const event = record.event;
  if (typeof event !== 'object' || event === null) return null;
  const e = event as Record<string, unknown>;

  if (e.type === 'agent-ready') return { type: 'agent-ready' };
  if (e.type === 'track-status') {
    if (typeof e.videoId !== 'string' || typeof e.available !== 'boolean') {
      return null;
    }
    return {
      type: 'track-status',
      videoId: e.videoId,
      available: e.available,
    };
  }
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
