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

/** A language's known good voices, best first. */
export function rankVoices(
  voices: readonly SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice[] {
  const wanted = normalized(language);
  const primary = wanted.split('-')[0];
  const candidates = voices.filter(
    (voice) =>
      qualityOf(voice) !== -1 &&
      normalized(voice.lang).split('-')[0] === primary,
  );
  const exact = (voice: SpeechSynthesisVoice) =>
    normalized(voice.lang) === wanted;
  return candidates.sort(
    (a, b) =>
      qualityOf(a) - qualityOf(b) || Number(exact(b)) - Number(exact(a)),
  );
}

/** The best known voice for a language, or `null` to let the browser choose. */
export const pickVoice = (
  voices: readonly SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice | null => rankVoices(voices, language)[0] ?? null;

/** Long enough for Chrome's list to arrive, and short enough to still feel like a click. */
const VOICES_WAIT_MS = 1000;

/** Speaks with the browser's own voices. */
export function createSpeaker(
  synth: SpeechSynthesis = globalThis.speechSynthesis,
): Speaker {
  /** Chrome can drop the events of an utterance nothing refers to. */
  const held: { utterance: SpeechSynthesisUtterance | null } = {
    utterance: null,
  };
  /** A listed voice can fail every time, as Chrome's Natural voices can. */
  const broken = new Set<string>();
  let abandonWait: (() => void) | null = null;

  const say = (
    text: string,
    language: string,
    voices: readonly SpeechSynthesisVoice[],
    onEnd: () => void,
  ) => {
    const [voice = null, ...rest] = voices;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.voice = voice;
    utterance.onend = onEnd;
    utterance.onerror = (event) => {
      const stopped =
        event.error === 'canceled' || event.error === 'interrupted';
      if (!voice || stopped) {
        onEnd();
        return;
      }
      // The browser's default can be a novelty voice, so the next good voice goes first.
      broken.add(voice.name);
      say(text, language, rest, onEnd);
    };
    held.utterance = utterance;
    synth.speak(utterance);
  };

  /** Chrome's list starts empty on each page, and fills in after the first request. */
  const whenVoicesReady = (ready: () => void, abandoned: () => void) => {
    if (synth.getVoices().length > 0) {
      ready();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', proceed);
      abandonWait = null;
    };
    const proceed = () => {
      finish();
      ready();
    };
    const timer = setTimeout(proceed, VOICES_WAIT_MS);
    synth.addEventListener('voiceschanged', proceed);
    abandonWait = () => {
      finish();
      abandoned();
    };
  };

  return {
    speak(text, language, onEnd) {
      abandonWait?.();
      synth.cancel();
      whenVoicesReady(() => {
        const voices = rankVoices(synth.getVoices(), language).filter(
          (voice) => !broken.has(voice.name),
        );
        say(text, language, voices, onEnd);
      }, onEnd);
    },
    stop() {
      abandonWait?.();
      held.utterance = null;
      synth.cancel();
    },
  };
}
