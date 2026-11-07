export type Stamp = string;

const MS_DIGITS = 14;
const COUNTER_DIGITS = 5;

export function makeStamp(ms: number, counter: number, device: string): Stamp {
  const time = String(Math.max(0, Math.floor(ms))).padStart(MS_DIGITS, '0');
  const count = String(counter).padStart(COUNTER_DIGITS, '0');
  return `${time}-${count}-${device}`;
}

export function stampMs(stamp: Stamp): number {
  return Number(stamp.slice(0, MS_DIGITS));
}

const stampCounter = (stamp: Stamp) =>
  Number(stamp.slice(MS_DIGITS + 1, MS_DIGITS + 1 + COUNTER_DIGITS));

export interface StampClock {
  /** A stamp later than every stamp this device has made or seen. */
  next: () => Stamp;
  observe: (stamp: Stamp | null | undefined) => void;
  /** Corrects a wrong device clock, from the server's time. */
  setOffset: (ms: number) => void;
  latest: () => Stamp;
}

/** A hybrid logical clock: real time where possible, and never behind what it has seen. */
export function createStampClock(
  device: string,
  now: () => number = Date.now,
): StampClock {
  let ms = 0;
  let counter = 0;
  let offset = 0;
  return {
    next() {
      const time = now() + offset;
      if (time > ms) {
        ms = time;
        counter = 0;
      } else {
        counter += 1;
      }
      return makeStamp(ms, counter, device);
    },
    observe(stamp) {
      if (!stamp) return;
      const seenMs = stampMs(stamp);
      const seenCounter = stampCounter(stamp);
      if (!Number.isFinite(seenMs) || !Number.isFinite(seenCounter)) return;
      if (seenMs > ms) {
        ms = seenMs;
        counter = seenCounter;
      } else if (seenMs === ms && seenCounter > counter) {
        counter = seenCounter;
      }
    },
    setOffset(ms_) {
      offset = ms_;
    },
    latest: () => makeStamp(ms, counter, device),
  };
}
