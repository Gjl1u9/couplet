import type { AccountSync, ReadyResult } from './account-sync';

const SYNC_MESSAGE_TYPE = 'sync';

export const SYNC_STATUS_KEY = 'syncStatus';
/** Written after each local change, because pages cannot watch IndexedDB. */
export const VOCABULARY_REVISION_KEY = 'vocabularyRevision';

type SyncCommand = 'ready' | 'sync-now';

export interface SyncMessage {
  readonly type: typeof SYNC_MESSAGE_TYPE;
  readonly command: SyncCommand;
}

type SyncResponse =
  | { readonly ok: true; readonly value: ReadyResult | null }
  | { readonly ok: false; readonly error: string };

export function isSyncMessage(message: unknown): message is SyncMessage {
  return (message as { type?: unknown } | null)?.type === SYNC_MESSAGE_TYPE;
}

export function answerSyncMessage(
  message: SyncMessage,
  sync: Pick<AccountSync, 'ready' | 'syncNow'>,
  respond: (response: SyncResponse) => void,
): void {
  const run = async () => {
    if (message.command === 'ready') return sync.ready();
    await sync.syncNow();
    return null;
  };
  run().then(
    (value) => {
      respond({ ok: true, value });
    },
    (error: unknown) => {
      respond({ ok: false, error: String(error) });
    },
  );
}

export interface SyncClient {
  ready: () => Promise<ReadyResult>;
  syncNow: () => Promise<void>;
}

export function createSyncClient(
  send: (message: SyncMessage) => Promise<unknown>,
): SyncClient {
  const call = async (command: SyncCommand) => {
    const response = (await send({
      type: SYNC_MESSAGE_TYPE,
      command,
    })) as SyncResponse | undefined;
    // An older background script, until the extension reloads, does not know this message.
    if (!response) throw new Error('The background script did not answer');
    if (!response.ok) throw new Error(response.error);
    return response.value;
  };
  return {
    ready: async () => (await call('ready')) ?? 'failed',
    syncNow: async () => {
      await call('sync-now');
    },
  };
}
