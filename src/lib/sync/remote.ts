import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PushWordResult,
  RemoteEvent,
  RemoteWord,
  SyncRemote,
} from './engine';

export class RemoteError extends Error {}

const unwrap = <T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T => {
  if (result.error) throw new RemoteError(result.error.message);
  if (result.data === null) throw new RemoteError('Empty response');
  return result.data;
};

/** The cloud side of docs/SYNC.md, in Supabase. */
export function createSupabaseRemote(client: SupabaseClient): SyncRemote {
  return {
    now: async () =>
      new Date(
        unwrap<string>(
          (await client.rpc('sync_now')) as {
            data: string | null;
            error: { message: string } | null;
          },
        ),
      ).getTime(),
    pullWords: async (since, limit) => {
      let query = client
        .from('words')
        .select('word_id, doc, rev, server_updated_at')
        .order('server_updated_at')
        .order('word_id')
        .limit(limit);
      if (since !== null) query = query.gte('server_updated_at', since);
      return unwrap<RemoteWord[]>(await query);
    },
    pullEvents: async (since, limit) => {
      let query = client
        .from('review_events')
        .select('id, doc, undone, server_updated_at')
        .order('server_updated_at')
        .order('id')
        .limit(limit);
      if (since !== null) query = query.gte('server_updated_at', since);
      return unwrap<RemoteEvent[]>(await query);
    },
    pushWords: async (items) =>
      unwrap<{ results: PushWordResult[] }>(
        (await client.rpc('push_words', { items })) as {
          data: { results: PushWordResult[] } | null;
          error: { message: string } | null;
        },
      ).results,
    pushEvents: async (items) =>
      unwrap<{ rejected: string[] }>(
        (await client.rpc('push_events', { items })) as {
          data: { rejected: string[] } | null;
          error: { message: string } | null;
        },
      ).rejected,
  };
}
