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
  const synth = {
    cancel,
    getVoices: () => voices,
    speak: (utterance: FakeUtterance) => {
      spoken.push(utterance);
    },
  } as unknown as SpeechSynthesis;
  return { synth, spoken, cancel };
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
    const { synth, spoken } = fakeSynth();
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
