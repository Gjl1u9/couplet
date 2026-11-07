import { canonical, mergeDocs, parseDoc } from './doc';
import type {
  PushEventItem,
  PushWordItem,
  PushWordResult,
  RemoteEvent,
  RemoteWord,
  SyncRemote,
} from './engine';

/** Postgres stores `jsonb` with its own key order, so tests must not rely on ours. */
function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))
        .map(([key, item]) => [key, reorderKeys(item)]),
    );
  }
  return value;
}

export type Fault = 'before' | 'after' | null;

/** A stand-in for the cloud, with the same rules as the SQL in supabase/migrations. */
export function createMemoryRemote(options: { fault?: () => Fault } = {}) {
  const words = new Map<string, RemoteWord>();
  const events = new Map<
    string,
    RemoteEvent & { word_birth: string; word_id: string }
  >();
  let tick = 1_000_000_000_000;
  /** Accepted pushes that lost something the server held. Must stay empty. */
  const lostData: string[] = [];

  /** Sometimes behind the newest, like a transaction that commits late. */
  const timestamp = () => {
    tick += 1000;
    const lag = (tick / 1000) % 7 === 0 ? 2000 : 0;
    return new Date(tick - lag).toISOString();
  };

  const faulty = async <T>(work: () => T): Promise<T> => {
    const fault = options.fault?.() ?? null;
    await Promise.resolve();
    if (fault === 'before') throw new Error('Lost request');
    const result = work();
    if (fault === 'after') throw new Error('Lost response');
    return result;
  };

  const page = <T extends { server_updated_at: string }>(
    rows: Iterable<T>,
    since: string | null,
    limit: number,
    id: (row: T) => string,
  ) =>
    [...rows]
      .filter((row) => since === null || row.server_updated_at >= since)
      .sort(
        (a, b) =>
          a.server_updated_at.localeCompare(b.server_updated_at) ||
          id(a).localeCompare(id(b)),
      )
      .slice(0, limit);

  const pushWord = (item: PushWordItem): PushWordResult => {
    const row = words.get(item.word_id);
    if ((row?.rev ?? 0) !== item.base_rev) {
      return {
        word_id: item.word_id,
        status: 'conflict',
        rev: row?.rev ?? 0,
        doc: row?.doc ?? null,
      };
    }
    const previous = parseDoc(row?.doc);
    if (
      previous &&
      canonical(mergeDocs(previous, item.doc)) !== canonical(item.doc)
    ) {
      lostData.push(item.word_id);
    }
    const rev = item.base_rev + 1;
    words.set(item.word_id, {
      word_id: item.word_id,
      doc: reorderKeys(structuredClone(item.doc)),
      rev,
      server_updated_at: timestamp(),
    });
    const tombstone = item.doc.deleted;
    if (tombstone !== null) {
      for (const [id, event] of events) {
        if (event.word_id === item.word_id && event.word_birth <= tombstone) {
          events.delete(id);
        }
      }
    }
    return { word_id: item.word_id, status: 'stored', rev };
  };

  const pushEvent = (item: PushEventItem) => {
    const tombstone = (
      words.get(item.word_id)?.doc as { deleted?: string | null } | undefined
    )?.deleted;
    if (tombstone != null && item.word_birth <= tombstone) return;
    const row = events.get(item.id);
    const undone = (row?.undone ?? false) || item.undone;
    if (row && row.undone === undone) return;
    events.set(item.id, {
      id: item.id,
      word_id: item.word_id,
      word_birth: item.word_birth,
      doc: reorderKeys(structuredClone(item.doc)),
      undone,
      server_updated_at: timestamp(),
    });
  };

  const remote: SyncRemote = {
    now: () => faulty(() => tick),
    pullWords: (since, limit) =>
      faulty(() => page(words.values(), since, limit, (row) => row.word_id)),
    pullEvents: (since, limit) =>
      faulty(() => page(events.values(), since, limit, (row) => row.id)),
    pushWords: (items) => faulty(() => items.map(pushWord)),
    pushEvents: (items) =>
      faulty(() => {
        items.forEach(pushEvent);
        return [];
      }),
  };
  return { remote, words, events, lostData };
}
