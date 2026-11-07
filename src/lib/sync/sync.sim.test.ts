import { describe, expect, it } from 'vitest';
import type { Grade } from '../vocabulary/schedule';
import {
  createVocabulary,
  type Encounter,
  type EncounterInput,
  type SavedWord,
  type Vocabulary,
} from '../vocabulary/vocabulary';
import {
  canonical,
  coveredByDeletion,
  mergeDocs,
  mergeEncounters,
  parseDoc,
  viewOf,
  type ReviewEventDoc,
  type WordDoc,
} from './doc';
import { createSyncEngine, type SyncEngine } from './engine';
import { createMemoryRemote, type Fault } from './memory-remote';
import { createStampClock, stampMs } from './stamp';
import { createMemoryStore, createWriteQueue, type SyncStore } from './store';

/** The scenarios of prototype/sync-simulation.mjs, run against the real code. */
const LEMMAS = ['bank', 'pack', 'send'];
const GRADES: readonly Grade[] = ['again', 'hard', 'good'];

function random(seed: number) {
  let state = seed * 2654435761 + 7 || 1;
  return (limit: number) => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state % limit;
  };
}

const input = (lemma: string, moment: number): EncounterInput => ({
  entry: {
    lemma,
    phonetic: null,
    senses: [{ meaning: 'm', example: 'e', translation: 't' }],
  },
  source: 'en',
  target: 'zh-TW',
  cues: [{ original: `line ${String(moment)}`, startMs: 0 }],
  currentCue: 0,
  form: `${lemma}${String(moment)}`,
  formOffset: 0,
  origin: { site: 'youtube', videoId: 'v', title: 'T' },
});

interface Device {
  readonly name: string;
  readonly store: SyncStore;
  readonly vocabulary: Vocabulary;
  readonly engine: SyncEngine;
  online: boolean;
  undo: {
    word: SavedWord;
    at: number;
    stamp: string | undefined;
  } | null;
}

async function run(seed: number) {
  const pick = random(seed);
  let time = 1_000_000_000_000;
  let faults = true;
  const fault = (): Fault => {
    if (!faults) return null;
    const roll = pick(12);
    return roll === 0 ? 'before' : roll === 1 ? 'after' : null;
  };
  const {
    remote,
    words: serverWords,
    lostData,
  } = createMemoryRemote({ fault });

  let ids = 0;
  const log = {
    grades: [] as { id: string; wordId: string; undone: boolean }[],
    deletes: [] as { wordId: string; stamp: string }[],
    saves: [] as { wordId: string; birth: string }[],
  };
  const devices = ['A', 'B', 'C'].map((name, at): Device => {
    const store = createMemoryStore();
    const queue = createWriteQueue();
    const skew = at === 0 ? 0 : pick(40_000) - 20_000;
    const now = () => time + skew;
    const clock = createStampClock(name, now);
    const newId = () => {
      ids += 1;
      return `${name}-${String(ids)}`;
    };
    const online = remoteFor(() => device.online);
    const vocabulary = createVocabulary({ store, queue, clock, newId });
    const engine = createSyncEngine({
      store,
      queue,
      clock,
      remote: online,
      now,
    });
    const device: Device = {
      name,
      store,
      vocabulary,
      engine,
      online: true,
      undo: null,
    };
    return device;
  });

  function remoteFor(isOnline: () => boolean) {
    const guard =
      <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
      (...args: A) =>
        isOnline() ? call(...args) : Promise.reject(new Error('Offline'));
    return {
      now: guard(remote.now),
      pullWords: guard(remote.pullWords),
      pullEvents: guard(remote.pullEvents),
      pushWords: guard(remote.pushWords),
      pushEvents: guard(remote.pushEvents),
    };
  }

  const steps = 30 + pick(70);
  for (let step = 0; step < steps; step += 1) {
    time += 1 + pick(3000);
    const device = devices[pick(3)] as Device;
    const lemma = LEMMAS[pick(3)] as string;
    const id = `en:${lemma}`;
    switch (pick(14)) {
      case 0:
      case 1: {
        const before = await device.store.getWord(id);
        const { word } = await device.vocabulary.save(
          input(lemma, pick(6)),
          time,
        );
        if (!viewOf(before?.doc) && word.birth) {
          log.saves.push({ wordId: id, birth: word.birth });
          if (before?.doc.deleted && word.birth <= before.doc.deleted) {
            throw new Error('Re-save sorts before the deletion it saw');
          }
        }
        break;
      }
      case 2:
        await device.vocabulary.addEncounter(input(lemma, pick(6)), time);
        break;
      case 3:
      case 4: {
        const before = viewOf((await device.store.getWord(id))?.doc);
        const encounter = before?.encounters[0];
        if (!before || !encounter) break;
        const next = await device.vocabulary.grade(
          id,
          encounter.id,
          GRADES[pick(3)] as Grade,
          time,
        );
        if (next && before.reviewStamp && next.reviewStamp) {
          expect(next.reviewStamp > before.reviewStamp).toBe(true);
        }
        const event = (await device.store.allEvents()).find(
          (item) => item.at === time && item.wordId === id,
        );
        if (event) log.grades.push({ id: event.id, wordId: id, undone: false });
        device.undo = { word: before, at: time, stamp: next?.reviewStamp };
        break;
      }
      case 5: {
        const undo = device.undo;
        if (!undo) break;
        device.undo = null;
        const event = (await device.store.allEvents()).find(
          (item) => item.at === undo.at && item.wordId === undo.word.id,
        );
        const result = await device.vocabulary.revert(
          undo.word,
          undo.at,
          undo.stamp,
        );
        if (result === 'reverted' && event) {
          const logged = log.grades.find((item) => item.id === event.id);
          if (logged) logged.undone = true;
        }
        break;
      }
      case 6:
        await device.vocabulary.retire(id, time);
        break;
      case 7:
        await device.vocabulary.restore(id, time);
        break;
      case 8: {
        const word = viewOf((await device.store.getWord(id))?.doc);
        const encounter = word?.encounters.find((item) => !item.translation);
        if (encounter) {
          await device.vocabulary.setTranslation(
            id,
            encounter.id,
            `t${device.name}`,
          );
        }
        break;
      }
      case 9: {
        const had = viewOf((await device.store.getWord(id))?.doc);
        await device.vocabulary.remove(id);
        const doc = (await device.store.getWord(id))?.doc;
        if (had && doc?.deleted) {
          log.deletes.push({ wordId: id, stamp: doc.deleted });
        }
        break;
      }
      case 10:
        device.online = !device.online;
        break;
      case 11:
        // Two devices racing, which is what the conditional push is for.
        await Promise.all(devices.map((item) => item.engine.cycle()));
        break;
      default:
        await device.engine.cycle();
    }
  }

  faults = false;
  for (const device of devices) device.online = true;
  for (let round = 0; round < 6; round += 1) {
    for (const device of devices) await device.engine.cycle();
  }

  const docs = async (device: Device) =>
    canonical(
      (await device.store.allWords())
        .map((word) => word.doc)
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  const first = devices[0] as Device;
  const expected = await docs(first);
  const visible = async (device: Device) => {
    const events = await device.store.allEvents();
    return events
      .filter((event) => !event.undone)
      .map((event: ReviewEventDoc) => event.id)
      .sort();
  };
  for (const device of devices) {
    // I1 Convergence, on every device.
    expect(await docs(device)).toBe(expected);
    expect(await visible(device)).toEqual(await visible(first));
    // I7 Nothing unqueued.
    expect((await device.store.outbox()).size).toBe(0);
  }
  // I6 The server never loses data.
  expect(lostData).toEqual([]);
  // I1 The server holds the same.
  for (const stored of await first.store.allWords()) {
    const row = serverWords.get(stored.doc.id);
    expect(canonical(row?.doc)).toBe(canonical(stored.doc));
    expect(row?.rev).toBe(stored.rev);
  }

  const events = await first.store.allEvents();
  for (const lemma of LEMMAS) {
    const id = `en:${lemma}`;
    const doc = (await first.store.getWord(id))?.doc ?? null;
    const word = viewOf(doc);
    const lastDelete = log.deletes
      .filter((item) => item.wordId === id)
      .map((item) => item.stamp)
      .sort()
      .at(-1);
    const savedAfter = log.saves.some(
      (item) =>
        item.wordId === id &&
        (lastDelete === undefined || item.birth > lastDelete),
    );
    // I4 No resurrection, I5 No lost re-save.
    if (log.saves.some((item) => item.wordId === id)) {
      expect(word !== null).toBe(savedAfter);
    }
    // I10 Limits.
    if (word) {
      expect(word.encounters.length).toBeGreaterThanOrEqual(1);
      expect(word.encounters.length).toBeLessThanOrEqual(3);
      const moments = word.encounters.map(
        (item) => item.cues[item.currentCue]?.original,
      );
      expect(new Set(moments).size).toBe(moments.length);
    }
    // Every id on a word document names a life after its tombstone.
    for (const birth of Object.keys(doc?.lives ?? {})) {
      if (doc?.deleted) expect(birth > doc.deleted).toBe(true);
    }
  }
  for (const grade of log.grades) {
    const doc = (await first.store.getWord(grade.wordId))?.doc ?? null;
    const stored = events.find((item) => item.id === grade.id);
    if (grade.undone) {
      // I9 Undo sticks.
      expect(stored?.undone ?? true).toBe(true);
    } else if (stored && !coveredByDeletion(stored, doc)) {
      expect(stored.undone).toBe(false);
    } else if (!stored) {
      // I3 Only a deletion may remove a review.
      expect(doc?.deleted).toBeTruthy();
    }
  }
  return {
    saves: log.saves.length,
    deletes: log.deletes.length,
    grades: log.grades.length,
  };
}

describe('sync, on the real code', () => {
  it('converges under offline work, lost messages, and wrong clocks', async () => {
    const totals = { saves: 0, deletes: 0, grades: 0 };
    for (let seed = 1; seed <= 400; seed += 1) {
      const result = await run(seed);
      totals.saves += result.saves;
      totals.deletes += result.deletes;
      totals.grades += result.grades;
    }
    // The run must exercise what it claims to.
    expect(totals.saves).toBeGreaterThan(500);
    expect(totals.deletes).toBeGreaterThan(100);
    expect(totals.grades).toBeGreaterThan(300);
  }, 120_000);
});

describe('merge laws, on the real code', () => {
  const stamps = ['1', '2', '3', '4', '5', '6'].map(
    (n) => `${n.padStart(14, '0')}-00000-A`,
  );
  const randomDoc = (pick: (limit: number) => number): WordDoc => {
    const deleted = pick(3) === 0 ? (stamps[pick(6)] as string) : null;
    const lives: WordDoc['lives'] = {};
    const out = lives as Record<string, WordDoc['lives'][string]>;
    for (const birth of stamps) {
      if (pick(3) !== 0 || (deleted && birth <= deleted)) continue;
      const entryStamp = stamps[pick(6)] as string;
      const reviewStamp = stamps[pick(6)] as string;
      out[birth] = {
        birth,
        savedAt: stampMs(birth),
        entry: {
          stamp: entryStamp,
          value: {
            lemma: 'bank',
            phonetic: entryStamp,
            senses: [],
            source: 'en',
            target: 'zh-TW',
          },
        },
        review: {
          stamp: reviewStamp,
          value: {
            scheduler: 'ladder-v1',
            level: stampMs(reviewStamp),
            dueAt: 0,
            lastReviewedAt: null,
            reviewCount: 0,
            retired: null,
          },
        },
        forms: ['a', 'b'].slice(0, pick(3)),
        encounters: Array.from({ length: pick(5) }, () => {
          const n = pick(6);
          return {
            id: `e${String(n)}`,
            cues: [{ original: `m${String(n % 4)}`, startMs: null }],
            currentCue: 0,
            translation: pick(2) === 0 ? `t${String(pick(2))}` : null,
            form: 'bank',
            formOffset: null,
            origin: null,
            meaning: null,
            savedAt: n * 3,
          };
        }).reduce<readonly Encounter[]>(
          (kept, item) => mergeEncounters(kept, [item]),
          [],
        ),
      };
    }
    return { schema: 3, id: 'en:bank', deleted, lives };
  };

  it('holds for random documents', () => {
    const pick = random(99);
    const same = (a: WordDoc, b: WordDoc) => {
      expect(canonical(a)).toBe(canonical(b));
    };
    for (let at = 0; at < 3000; at += 1) {
      const [a, b, c] = [randomDoc(pick), randomDoc(pick), randomDoc(pick)];
      same(mergeDocs(a, b), mergeDocs(b, a));
      same(mergeDocs(mergeDocs(a, b), c), mergeDocs(a, mergeDocs(b, c)));
      same(mergeDocs(a, a), mergeDocs(mergeDocs(a, a), a));
    }
  });

  it('survives a round trip through jsonb key order', () => {
    const doc = randomDoc(random(5));
    const reordered = parseDoc(JSON.parse(canonical(doc)));
    if (!reordered) throw new Error('Not parsed');
    expect(canonical(reordered)).toBe(canonical(doc));
  });
});
