// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker, pickVoice } from './speech';

const voice = (name: string, lang: string) =>
  ({ name, lang }) as SpeechSynthesisVoice;

class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(readonly text: string) {}
}

function fakeSynth(voices: readonly SpeechSynthesisVoice[] = []) {
  const spoken: FakeUtterance[] = [];
  const cancel = vi.fn();
  const listeners = new Set<() => void>();
  let listed = voices;
  const synth = {
    cancel,
    getVoices: () => listed,
    speak: (utterance: FakeUtterance) => {
      spoken.push(utterance);
    },
    addEventListener: (_: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: () => void) => {
      listeners.delete(listener);
    },
  } as unknown as SpeechSynthesis;
  const listVoices = (next: readonly SpeechSynthesisVoice[]) => {
    listed = next;
    for (const listener of [...listeners]) listener();
  };
  return { synth, spoken, cancel, listeners, listVoices };
}

describe('pickVoice', () => {
  it('prefers a better voice over the first one listed', () => {
    const google = voice('Google US English', 'en-US');
    const picked = pickVoice(
      [voice('Bells', 'en-US'), google, voice('Google français', 'fr-FR')],
      'en',
    );
    expect(picked).toBe(google);
  });

  it('prefers the exact region among equal voices', () => {
    const british = voice('Google UK English Male', 'en-GB');
    expect(
      pickVoice([voice('Google US English', 'en-US'), british], 'en-GB'),
    ).toBe(british);
  });

  it('matches underscores and letter case', () => {
    const italian = voice('Google italiano', 'it_IT');
    expect(pickVoice([italian], 'IT')).toBe(italian);
  });

  it('leaves the choice to the browser without a known good voice', () => {
    expect(pickVoice([voice('Bells', 'en-US')], 'en')).toBeNull();
    expect(pickVoice([voice('Google US English', 'en-US')], 'ko')).toBeNull();
  });
});

describe('createSpeaker', () => {
  beforeEach(() => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  });

  it('speaks with the best voice for the language', () => {
    const google = voice('Google español', 'es-ES');
    const { synth, spoken } = fakeSynth([google]);
    createSpeaker(synth).speak('casa', 'es', vi.fn());
    expect(spoken[0]).toMatchObject({
      text: 'casa',
      lang: 'es',
      voice: google,
    });
  });

  it('reports the end of playback', () => {
    const { synth, spoken } = fakeSynth([voice('Bells', 'en-US')]);
    const onEnd = vi.fn();
    createSpeaker(synth).speak('casa', 'es', onEnd);
    spoken[0]?.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('retries with the default voice when the chosen one fails', () => {
    const { synth, spoken } = fakeSynth([voice('Google español', 'es-ES')]);
    const onEnd = vi.fn();
    createSpeaker(synth).speak('casa', 'es', onEnd);
    spoken[0]?.onerror?.({ error: 'network' });
    expect(spoken[1]?.voice).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
    spoken[1]?.onerror?.({ error: 'network' });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('tries the next good voice before the default voice', () => {
    const natural = voice('Google US English 1 (Natural)', 'en-US');
    const google = voice('Google US English', 'en-US');
    const { synth, spoken } = fakeSynth([
      voice('Bells', 'en-US'),
      google,
      natural,
    ]);
    createSpeaker(synth).speak('bank', 'en', vi.fn());
    expect(spoken[0]?.voice).toBe(natural);
    spoken[0]?.onerror?.({ error: 'synthesis-failed' });
    expect(spoken[1]?.voice).toBe(google);
  });

  it('skips a voice that has already failed', () => {
    const natural = voice('Google US English 1 (Natural)', 'en-US');
    const google = voice('Google US English', 'en-US');
    const { synth, spoken } = fakeSynth([natural, google]);
    const speaker = createSpeaker(synth);
    speaker.speak('bank', 'en', vi.fn());
    spoken[0]?.onerror?.({ error: 'synthesis-failed' });
    speaker.speak('river', 'en', vi.fn());
    expect(spoken.at(-1)).toMatchObject({ text: 'river', voice: google });
  });

  describe('before the voices have loaded', () => {
    const google = voice('Google español', 'es-ES');

    it('waits for the list, so the first click gets a good voice', () => {
      const { synth, spoken, listVoices, listeners } = fakeSynth();
      createSpeaker(synth).speak('casa', 'es', vi.fn());
      expect(spoken).toHaveLength(0);
      listVoices([google]);
      expect(spoken[0]?.voice).toBe(google);
      expect(listeners.size).toBe(0);
    });

    it('speaks anyway when the list never arrives', () => {
      vi.useFakeTimers();
      try {
        const { synth, spoken, listeners } = fakeSynth();
        createSpeaker(synth).speak('casa', 'es', vi.fn());
        vi.advanceTimersByTime(1000);
        expect(spoken[0]?.voice).toBeNull();
        expect(listeners.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('drops the wait when stopped, and reports the end', () => {
      const { synth, spoken, listVoices, listeners } = fakeSynth();
      const onEnd = vi.fn();
      const speaker = createSpeaker(synth);
      speaker.speak('casa', 'es', onEnd);
      speaker.stop();
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(listeners.size).toBe(0);
      listVoices([google]);
      expect(spoken).toHaveLength(0);
    });

    it('replaces the wait when asked to speak again', () => {
      const { synth, spoken, listVoices } = fakeSynth();
      const first = vi.fn();
      const speaker = createSpeaker(synth);
      speaker.speak('uno', 'es', first);
      speaker.speak('dos', 'es', vi.fn());
      expect(first).toHaveBeenCalledTimes(1);
      listVoices([google]);
      expect(spoken.map((utterance) => utterance.text)).toEqual(['dos']);
    });
  });

  it('does not retry speech that was stopped', () => {
    const { synth, spoken } = fakeSynth([voice('Google español', 'es-ES')]);
    const onEnd = vi.fn();
    createSpeaker(synth).speak('casa', 'es', onEnd);
    spoken[0]?.onerror?.({ error: 'canceled' });
    expect(spoken).toHaveLength(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('stops whatever is speaking', () => {
    const { synth, cancel } = fakeSynth();
    createSpeaker(synth).stop();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
