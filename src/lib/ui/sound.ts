export interface SaveSound {
  play: () => void;
}

/** How a Review answer sounds. The keys are the schedule's grades. */
export type GradeSoundName = 'again' | 'hard' | 'good';

export interface GradeSounds {
  play: (grade: GradeSoundName) => void;
}

interface Note {
  readonly frequency: number;
  readonly start: number;
  readonly length: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
}

/** Two rising notes, made here so the extension ships no audio file. */
const SAVE_NOTES: readonly Note[] = [
  { frequency: 1318.5, start: 0, length: 0.09 },
  { frequency: 1760, start: 0.07, length: 0.16 },
];

/**
 * Got it rises like the save sound, Unsure is one even note, and Forgot falls softly
 * and low, so it says "again" rather than "wrong": forgetting is part of learning.
 */
const GRADE_NOTES: Readonly<Record<GradeSoundName, readonly Note[]>> = {
  good: [
    { frequency: 1046.5, start: 0, length: 0.09, gain: 0.11 },
    { frequency: 1568, start: 0.07, length: 0.16, gain: 0.11 },
  ],
  hard: [{ frequency: 880, start: 0, length: 0.14, gain: 0.08 }],
  again: [
    { frequency: 587.3, start: 0, length: 0.1, type: 'triangle', gain: 0.09 },
    { frequency: 440, start: 0.08, length: 0.18, type: 'triangle', gain: 0.08 },
  ],
};

const PEAK_GAIN = 0.12;
const SILENCE = 0.0001;
const ATTACK_SECONDS = 0.008;

/** Plays notes, creating the audio on the first play, because browsers block it before a gesture. */
function createTones(createContext: () => AudioContext) {
  let context: AudioContext | null = null;
  return (notes: readonly Note[]) => {
    context ??= createContext();
    const audio = context;
    void audio.resume();
    for (const { frequency, start, length, type, gain: peak } of notes) {
      const from = audio.currentTime + start;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type ?? 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(SILENCE, from);
      gain.gain.exponentialRampToValueAtTime(
        peak ?? PEAK_GAIN,
        from + ATTACK_SECONDS,
      );
      gain.gain.exponentialRampToValueAtTime(SILENCE, from + length);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(from);
      oscillator.stop(from + length);
    }
  };
}

export function createSaveSound(
  createContext: () => AudioContext = () => new AudioContext(),
): SaveSound {
  const tones = createTones(createContext);
  return {
    play() {
      tones(SAVE_NOTES);
    },
  };
}

export function createGradeSounds(
  createContext: () => AudioContext = () => new AudioContext(),
): GradeSounds {
  const tones = createTones(createContext);
  return {
    play(grade) {
      tones(GRADE_NOTES[grade]);
    },
  };
}
