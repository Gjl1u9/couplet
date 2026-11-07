export interface SaveSound {
  play: () => void;
}

/** Two rising notes, made here so the extension ships no audio file. */
const NOTES = [
  { frequency: 1318.5, start: 0, length: 0.09 },
  { frequency: 1760, start: 0.07, length: 0.16 },
];
const PEAK_GAIN = 0.12;
const SILENCE = 0.0001;
const ATTACK_SECONDS = 0.008;

export function createSaveSound(
  createContext: () => AudioContext = () => new AudioContext(),
): SaveSound {
  let context: AudioContext | null = null;
  return {
    play() {
      // Created on the first click, because browsers block audio before a gesture.
      context ??= createContext();
      const audio = context;
      void audio.resume();
      for (const { frequency, start, length } of NOTES) {
        const from = audio.currentTime + start;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(SILENCE, from);
        gain.gain.exponentialRampToValueAtTime(
          PEAK_GAIN,
          from + ATTACK_SECONDS,
        );
        gain.gain.exponentialRampToValueAtTime(SILENCE, from + length);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(from);
        oscillator.stop(from + length);
      }
    },
  };
}
