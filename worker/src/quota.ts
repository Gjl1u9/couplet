/** How the counter is stored, so the rules can be tested without Cloudflare. */
export interface CounterStorage {
  get: (key: string) => Promise<number | undefined>;
  put: (key: string, value: number) => Promise<void>;
  delete: (key: string) => Promise<unknown>;
  list: () => Promise<Map<string, number>>;
}

/** Takes one from today's allowance. Yesterday's counts are removed as it goes. */
export async function consume(
  storage: CounterStorage,
  day: string,
  limit: number,
): Promise<boolean> {
  const used = (await storage.get(day)) ?? 0;
  if (used >= limit) return false;
  if (used === 0) {
    for (const key of (await storage.list()).keys()) {
      if (key !== day) await storage.delete(key);
    }
  }
  await storage.put(day, used + 1);
  return true;
}

/** Gives one back, because a failed lookup should not cost the user anything. */
export async function refund(
  storage: CounterStorage,
  day: string,
): Promise<void> {
  const used = (await storage.get(day)) ?? 0;
  if (used > 0) await storage.put(day, used - 1);
}
