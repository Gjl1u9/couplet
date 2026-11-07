import { describe, expect, it } from 'vitest';
import type { ControllerEvent } from '../subtitles/controller';
import {
  BRIDGE_TAG,
  parseBridgeCommand,
  parseBridgeMessage,
  toBridgeCommand,
  toBridgeMessage,
} from './bridge';

describe('page status events', () => {
  it('round-trips agent-ready and track-status', () => {
    const status = {
      type: 'track-status',
      videoId: 'a',
      available: false,
    } as const;
    expect(parseBridgeMessage(toBridgeMessage(status))).toEqual(status);
    expect(
      parseBridgeMessage(toBridgeMessage({ type: 'agent-ready' })),
    ).toEqual({ type: 'agent-ready' });
  });

  it('rejects a malformed track status', () => {
    expect(
      parseBridgeMessage({
        [BRIDGE_TAG]: true,
        event: { type: 'track-status', videoId: 'a', available: 'no' },
      }),
    ).toBeNull();
  });
});

describe('learning language command', () => {
  it('round-trips a valid command', () => {
    const command = {
      type: 'set-learning-language',
      language: 'zh-Hant',
    } as const;
    expect(parseBridgeCommand(toBridgeCommand(command))).toEqual(command);
  });

  it('rejects unrelated and malformed messages', () => {
    expect(parseBridgeCommand({ language: 'en' })).toBeNull();
    expect(
      parseBridgeCommand(
        toBridgeCommand({
          type: 'set-learning-language',
          language: '<script>',
        }),
      ),
    ).toBeNull();
  });
});

describe('bridge', () => {
  it.each<[string, ControllerEvent]>([
    ['player', { type: 'player', videoId: 'a', adShowing: true }],
    ['player 無影片', { type: 'player', videoId: null, adShowing: false }],
    [
      'captions',
      {
        type: 'captions',
        videoId: 'a',
        lang: 'en',
        kind: null,
        status: 200,
        body: '{}',
      },
    ],
  ])('來回轉換：%s', (_name, event) => {
    expect(parseBridgeMessage(toBridgeMessage(event))).toEqual(event);
  });

  it.each([
    [null],
    ['x'],
    [{}],
    [{ event: { type: 'player', videoId: 'a', adShowing: false } }],
    [{ [BRIDGE_TAG]: true }],
    [{ [BRIDGE_TAG]: true, event: { type: 'unknown' } }],
    [
      {
        [BRIDGE_TAG]: true,
        event: { type: 'player', videoId: 1, adShowing: false },
      },
    ],
    [{ [BRIDGE_TAG]: true, event: { type: 'player', videoId: 'a' } }],
    [
      {
        [BRIDGE_TAG]: true,
        event: {
          type: 'captions',
          videoId: null,
          lang: 'en',
          kind: null,
          status: 200,
          body: '',
        },
      },
    ],
    [
      {
        [BRIDGE_TAG]: true,
        event: {
          type: 'captions',
          videoId: 'a',
          lang: 'en',
          kind: null,
          status: '200',
          body: '',
        },
      },
    ],
    [
      {
        [BRIDGE_TAG]: true,
        event: {
          type: 'captions',
          videoId: 'a',
          lang: 'en',
          kind: null,
          status: 200,
          body: 1,
        },
      },
    ],
  ])('拒絕格式錯誤的訊息：%j', (data) => {
    expect(parseBridgeMessage(data)).toBeNull();
  });

  it('拒絕過大的字幕', () => {
    expect(
      parseBridgeMessage({
        [BRIDGE_TAG]: true,
        event: {
          type: 'captions',
          videoId: 'a',
          lang: 'en',
          kind: null,
          status: 200,
          body: 'x'.repeat(20 * 1024 * 1024 + 1),
        },
      }),
    ).toBeNull();
  });
});
