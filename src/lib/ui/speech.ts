export interface Speaker {
  speak: (text: string, language: string, onEnd: () => void) => void;
  stop: () => void;
}

/**
 * Better voices first. Others are left to the browser, because macOS lists novelty
 * voices such as Bells among its English ones.
 */
const VOICE_QUALITY = [/natural|neural/i, /google/i, /premium|enhanced|siri/i];

const qualityOf = (voice: SpeechSynthesisVoice) =>
  VOICE_QUALITY.findIndex((pattern) => pattern.test(voice.name));

const normalized = (language: string) =>
  language.toLowerCase().replace('_', '-');

/** The best known voice for a language, or `null` to let the browser choose. */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice | null {
  const wanted = normalized(language);
  const primary = wanted.split('-')[0];
  const candidates = voices.filter(
    (voice) =>
      qualityOf(voice) !== -1 &&
      normalized(voice.lang).split('-')[0] === primary,
  );
  const exact = (voice: SpeechSynthesisVoice) =>
    normalized(voice.lang) === wanted;
  const sorted = candidates.sort(
    (a, b) =>
      qualityOf(a) - qualityOf(b) || Number(exact(b)) - Number(exact(a)),
  );
  return sorted[0] ?? null;
}

/** Speaks with the browser's own voices. */
export function createSpeaker(
  synth: SpeechSynthesis = globalThis.speechSynthesis,
): Speaker {
  /** Chrome can drop the events of an utterance nothing refers to. */
  const held: { utterance: SpeechSynthesisUtterance | null } = {
    utterance: null,
  };

  const say = (
    text: string,
    language: string,
    voice: SpeechSynthesisVoice | null,
    onEnd: () => void,
  ) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.voice = voice;
    utterance.onend = onEnd;
    utterance.onerror = (event) => {
      const stopped =
        event.error === 'canceled' || event.error === 'interrupted';
      // A network voice can fail offline, while the default voice still works.
      if (voice && !stopped) say(text, language, null, onEnd);
      else onEnd();
    };
    held.utterance = utterance;
    synth.speak(utterance);
  };

  return {
    speak(text, language, onEnd) {
      synth.cancel();
      say(text, language, pickVoice(synth.getVoices(), language), onEnd);
    },
    stop() {
      held.utterance = null;
      synth.cancel();
    },
  };
}
