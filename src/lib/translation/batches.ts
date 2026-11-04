export interface Cue {
  readonly id: string;
  /** 秒。 */
  readonly start: number;
  /** 秒。 */
  readonly end: number;
  readonly text: string;
}

export interface BatchItem {
  readonly id: string;
  readonly text: string;
}

export interface Batch {
  readonly start: number;
  readonly end: number;
  readonly items: readonly BatchItem[];
}

export interface BatchLimits {
  readonly maxCues: number;
  /** 包含字幕之間的換行分隔。單句超過上限時會自成一批。 */
  readonly maxChars: number;
}

/**
 * 字幕裡的換行只是排版。保留的話，翻譯服務會把前後拆開翻，
 * 例如 "pull\ntwo all-nighters" 會譯成「拉 兩個通宵」。
 */
export function normalizeCueText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function createBatches(
  cues: readonly Cue[],
  limits: BatchLimits,
): Batch[] {
  const batches: Batch[] = [];
  let current: { cue: Cue; text: string }[] = [];
  let chars = 0;

  const close = () => {
    const [first] = current;
    if (!first) return;
    batches.push({
      start: first.cue.start,
      end: Math.max(...current.map(({ cue }) => cue.end)),
      items: current.map(({ cue, text }) => ({ id: cue.id, text })),
    });
    current = [];
    chars = 0;
  };

  for (const cue of cues) {
    const text = normalizeCueText(cue.text);
    if (text === '') continue;
    const added = text.length + (current.length > 0 ? 1 : 0);
    if (
      current.length >= limits.maxCues ||
      (current.length > 0 && chars + added > limits.maxChars)
    ) {
      close();
    }
    chars += text.length + (current.length > 0 ? 1 : 0);
    current.push({ cue, text });
  }
  close();
  return batches;
}
