import { describe, expect, it } from 'vitest';
import {
  createVocabulary,
  dueWords,
  encounterForReview,
  markedForms,
  type EncounterInput,
} from './vocabulary';
import { createMemoryStore } from '../sync/store';

const ENTRY = {
  lemma: 'bank',
  phonetic: '/bæŋk/',
  senses: [{ meaning: '銀行', example: 'A bank.', translation: '一家銀行。' }],
};

const input = (
  sentence = 'the bank',
  overrides: Partial<EncounterInput> = {},
): EncounterInput => ({
  entry: ENTRY,
  source: 'en',
  target: 'zh-TW',
  cues: [{ original: sentence, startMs: 1000 }],
  currentCue: 0,
  form: 'bank',
  formOffset: 4,
  origin: { site: 'youtube', videoId: 'abc', title: 'A video' },
  ...overrides,
});

function setup() {
  let id = 0;
  const store = createMemoryStore();
  const vocabulary = createVocabulary({
    store,
    newId: () => {
      id += 1;
      return `e${String(id)}`;
    },
  });
  return { vocabulary, store };
}

describe('createVocabulary', () => {
  it('remembers a saved word until it is removed', async () => {
    const { vocabulary } = setup();
    await expect(vocabulary.has('bank', 'en')).resolves.toBe(false);
    await vocabulary.save(input(), 1);
    await expect(vocabulary.has('bank', 'en')).resolves.toBe(true);
    await vocabulary.removeByLemma('bank', 'en');
    await expect(vocabulary.has('bank', 'en')).resolves.toBe(false);
  });

  it('keeps the same spelling in another language apart', async () => {
    const { vocabulary } = setup();
    await vocabulary.save(input(), 1);
    await expect(vocabulary.has('bank', 'de')).resolves.toBe(false);
  });

  it('makes a new word due at once, at level 0', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 5);
    expect(word.review).toMatchObject({ level: 0, dueAt: 5, retired: null });
    expect(word.forms).toEqual(['bank']);
  });

  it('keeps every word from quick saves', async () => {
    const { vocabulary } = setup();
    await Promise.all([
      vocabulary.save(input(), 1),
      vocabulary.save(
        input('a river', { entry: { ...ENTRY, lemma: 'river' } }),
        1,
      ),
    ]);
    await expect(vocabulary.list()).resolves.toHaveLength(2);
  });

  it('adds a new sentence without changing the schedule', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.grade(word.id, 'e1', 'good', 2);
    const again = await vocabulary.addEncounter(
      input('two banks', { form: 'banks', formOffset: 4 }),
      3,
    );
    expect(again?.word.encounters.map((item) => item.id)).toEqual(['e3', 'e1']);
    expect(again?.word.forms).toEqual(['bank', 'banks']);
    expect(again?.word.review).toMatchObject({ level: 2, lastReviewedAt: 2 });
  });

  it('keeps only the three newest sentences', async () => {
    const { vocabulary } = setup();
    let now = 1;
    for (const sentence of ['one', 'two', 'three', 'four']) {
      await vocabulary.save(input(sentence), now);
      now += 1;
    }
    const [word] = await vocabulary.list();
    expect(word?.encounters.map((item) => item.cues[0]?.original)).toEqual([
      'four',
      'three',
      'two',
    ]);
  });

  it('removes NUL, which the database cannot store', async () => {
    const { vocabulary } = setup();
    const { encounter, word } = await vocabulary.save(input('a\u0000b'), 1);
    expect(encounter.cues[0]?.original).toBe('ab');
    await vocabulary.setTranslation(word.id, encounter.id, 'c\u0000d');
    const [stored] = await vocabulary.list();
    expect(stored?.encounters[0]?.translation).toBe('cd');
  });

  it('does not add the same moment twice', async () => {
    const { vocabulary } = setup();
    await vocabulary.save(input(), 1);
    const again = await vocabulary.addEncounter(input(), 2);
    expect(again?.word.encounters).toHaveLength(1);
    expect(again?.encounter.id).toBe('e1');
  });

  it('ignores a sentence for a word that is not saved', async () => {
    const { vocabulary } = setup();
    await expect(vocabulary.addEncounter(input(), 1)).resolves.toBeNull();
    await expect(vocabulary.list()).resolves.toHaveLength(0);
  });

  it('logs each grade', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.grade(word.id, 'e1', 'hard', 2);
    await expect(vocabulary.reviewLog()).resolves.toEqual([
      {
        wordId: word.id,
        encounterId: 'e1',
        grade: 'hard',
        levelBefore: 0,
        levelAfter: 1,
        at: 2,
      },
    ]);
  });

  it('undoes a grade and its log entry', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.grade(word.id, 'e1', 'good', 2);
    await vocabulary.revert(word, 2);
    const [back] = await vocabulary.list();
    expect(back?.review.level).toBe(0);
    await expect(vocabulary.reviewLog()).resolves.toEqual([]);
  });

  it('retires and restores a word, keeping it saved', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    const retired = await vocabulary.retire(word.id, 2);
    expect(retired?.review.retired).toEqual({ reason: 'manual', at: 2 });
    await expect(vocabulary.has('bank', 'en')).resolves.toBe(true);
    const restored = await vocabulary.restore(word.id, 3);
    expect(restored?.review).toMatchObject({
      level: 0,
      dueAt: 3,
      retired: null,
    });
  });

  it('deletes the review history with the word', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.grade(word.id, 'e1', 'good', 2);
    await vocabulary.remove(word.id);
    await expect(vocabulary.list()).resolves.toEqual([]);
    await expect(vocabulary.reviewLog()).resolves.toEqual([]);
  });

  it('stores a translation on its Encounter', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.setTranslation(word.id, 'e1', '銀行');
    const [stored] = await vocabulary.list();
    expect(stored?.encounters[0]?.translation).toBe('銀行');
  });
});

describe('shared identity', () => {
  it('treats regional tracks as one word', async () => {
    const { vocabulary } = setup();
    await vocabulary.save(input('one'), 1);
    await vocabulary.save(input('two', { source: 'en-US' }), 2);
    await expect(vocabulary.has('bank', 'en-GB')).resolves.toBe(true);
    const words = await vocabulary.list();
    expect(words).toHaveLength(1);
    expect(words[0]?.encounters).toHaveLength(2);
  });
});

describe('writes', () => {
  it('queues every change for sync, with its data', async () => {
    const { vocabulary, store } = setup();
    const { word, encounter } = await vocabulary.save(input(), 1);
    expect([...(await store.outbox()).keys()]).toEqual(['word:en:bank']);
    await store.commit({ unqueue: ['word:en:bank'] });
    await vocabulary.setTranslation(word.id, encounter.id, '銀行');
    expect([...(await store.outbox()).keys()]).toEqual(['word:en:bank']);
    await store.commit({ unqueue: ['word:en:bank'] });
    await vocabulary.grade(word.id, encounter.id, 'good', 2);
    const keys = [...(await store.outbox()).keys()];
    expect(keys).toHaveLength(2);
    expect(keys.some((key) => key.startsWith('event:'))).toBe(true);
    await store.commit({ unqueue: keys });
    await vocabulary.revert(word, 2);
    expect((await store.outbox()).size).toBe(2);
  });

  it('marks an undone event instead of removing it', async () => {
    const { vocabulary, store } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.grade(word.id, 'e1', 'good', 2);
    await vocabulary.revert(word, 2);
    const [event] = await store.allEvents();
    expect(event?.undone).toBe(true);
    await expect(vocabulary.reviewLog()).resolves.toEqual([]);
  });

  it('refuses Undo once the schedule has moved on', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    const graded = await vocabulary.grade(word.id, 'e1', 'good', 2);
    await vocabulary.retire(word.id, 3);
    await expect(vocabulary.revert(word, 2, graded?.reviewStamp)).resolves.toBe(
      'changed',
    );
    const [kept] = await vocabulary.list();
    expect(kept?.review.retired).not.toBeNull();
    await expect(vocabulary.reviewLog()).resolves.toHaveLength(1);
  });

  it('leaves a tombstone, and a later save is a new word', async () => {
    const { vocabulary, store } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.grade(word.id, 'e1', 'good', 2);
    await vocabulary.remove(word.id);
    const tomb = await store.getWord(word.id);
    expect(tomb?.doc.deleted).not.toBeNull();
    expect(tomb?.doc.lives).toEqual({});
    await expect(store.allEvents()).resolves.toEqual([]);
    const again = await vocabulary.save(input(), 3);
    expect(again.word.review.level).toBe(0);
    expect((await store.getWord(word.id))?.doc.deleted).toBe(tomb?.doc.deleted);
  });

  it('keeps newer sentences and translations when undoing', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.grade(word.id, 'e1', 'good', 2);
    await vocabulary.setTranslation(word.id, 'e1', '銀行');
    await vocabulary.addEncounter(input('two banks'), 3);
    await vocabulary.revert(word, 2);
    const [back] = await vocabulary.list();
    expect(back?.review.level).toBe(0);
    expect(back?.encounters).toHaveLength(2);
    expect(back?.encounters[1]?.translation).toBe('銀行');
  });
});

describe('review helpers', () => {
  it('lists due words oldest first, without Retired ones', async () => {
    const { vocabulary } = setup();
    const later = await vocabulary.save(input(), 5);
    const earlier = await vocabulary.save(
      input('a river', { entry: { ...ENTRY, lemma: 'river' } }),
      3,
    );
    const gone = await vocabulary.save(
      input('a tree', { entry: { ...ENTRY, lemma: 'tree' } }),
      1,
    );
    await vocabulary.retire(gone.word.id, 2);
    const due = dueWords(await vocabulary.list(), 6);
    expect(due.map((word) => word.id)).toEqual([
      earlier.word.id,
      later.word.id,
    ]);
    expect(dueWords(await vocabulary.list(), 4)).toHaveLength(1);
  });

  it('rotates through the sentences', async () => {
    const { vocabulary } = setup();
    await vocabulary.save(input('one'), 1);
    const { word } = await vocabulary.save(input('two'), 2);
    const shown = [0, 1, 2].map(
      (reviewCount) =>
        encounterForReview({
          ...word,
          review: { ...word.review, reviewCount },
        })?.id,
    );
    expect(shown).toEqual(['e2', 'e1', 'e2']);
  });

  it('marks saved forms in the same language only', async () => {
    const { vocabulary } = setup();
    await vocabulary.save(input('Banks', { form: 'Banks', formOffset: 0 }), 1);
    const words = await vocabulary.list();
    expect([...markedForms(words, 'en-US')].sort()).toEqual(['bank', 'banks']);
    expect(markedForms(words, 'de').size).toBe(0);
  });

  it('stops marking a Retired word', async () => {
    const { vocabulary } = setup();
    const { word } = await vocabulary.save(input(), 1);
    await vocabulary.retire(word.id, 2);
    expect(markedForms(await vocabulary.list(), 'en').size).toBe(0);
  });
});
