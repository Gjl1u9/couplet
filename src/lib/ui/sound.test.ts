import { describe, expect, it, vi } from 'vitest';
import { createSaveSound } from './sound';

function fakeContext() {
  const oscillators: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  const context = {
    currentTime: 1,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: () => {
      const oscillator = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  };
  return { context: context as unknown as AudioContext, oscillators };
}

describe('createSaveSound', () => {
  it('waits for the first play before creating audio', () => {
    const create = vi.fn(() => fakeContext().context);
    const sound = createSaveSound(create);
    expect(create).not.toHaveBeenCalled();
    sound.play();
    sound.play();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('plays two short notes that end on their own', () => {
    const { context, oscillators } = fakeContext();
    createSaveSound(() => context).play();
    expect(oscillators).toHaveLength(2);
    for (const oscillator of oscillators) {
      expect(oscillator.stop.mock.calls[0]?.[0]).toBeGreaterThan(
        oscillator.start.mock.calls[0]?.[0] as number,
      );
    }
  });
});
