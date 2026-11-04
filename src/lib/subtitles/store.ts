import type { Cue } from '../translation/batches';

export interface ActiveCue {
  readonly id: string;
  readonly text: string;
  readonly translation: string | null;
}

/** 單一 session 的字幕和譯文。依時間查詢使用二分搜尋，長影片也不用掃整份字幕。 */
export class SubtitleStore {
  private readonly cues: readonly Cue[];
  private readonly translations = new Map<string, string>();

  constructor(cues: readonly Cue[]) {
    this.cues = [...cues].sort((a, b) => a.start - b.start);
  }

  get allCues(): readonly Cue[] {
    return this.cues;
  }

  setTranslation(id: string, translation: string): void {
    this.translations.set(id, translation);
  }

  private lastStartedIndex(time: number): number {
    let low = 0;
    let high = this.cues.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const cue = this.cues[middle];
      if (cue && cue.start <= time) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }

  cueAt(time: number): ActiveCue | null {
    const cue = this.cues[this.lastStartedIndex(time)];
    if (!cue || time >= cue.end) return null;
    return {
      id: cue.id,
      text: cue.text,
      translation: this.translations.get(cue.id) ?? null,
    };
  }

  /** 下一次字幕內容會改變的時間點，沒有的話回傳 null。 */
  nextChangeAfter(time: number): number | null {
    const index = this.lastStartedIndex(time);
    const current = this.cues[index];
    if (current && time < current.end) return current.end;
    return this.cues[index + 1]?.start ?? null;
  }
}
