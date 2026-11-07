import { describe, expect, it, vi } from 'vitest';
import {
  answerVocabularyMessage,
  createVocabularyClient,
  createVocabularyService,
  isVocabularyMessage,
} from './service';
import { createVocabulary, type EncounterInput } from './vocabulary';

const INPUT: EncounterInput = {
  entry: {
    lemma: 'rid',
    phonetic: null,
    senses: [
      { meaning: '擺脫', example: 'Get rid of it.', translation: '擺脫它。' },
    ],
  },
  source: 'en',
  target: 'zh-TW',
  cues: [
    { original: 'so I had to get', startMs: 0 },
    { original: 'rid of the old stuff', startMs: 1000 },
    { original: 'in the garage', startMs: 2000 },
  ],
  currentCue: 1,
  form: 'rid',
  formOffset: 0,
  origin: null,
};

function setup(translated: readonly string[] = ['譯文']) {
  const translate = vi.fn(() => Promise.resolve([...translated]));
  const createTranslate = vi.fn(() => translate);
  const vocabulary = createVocabulary();
  const handle = createVocabularyService({
    vocabulary,
    createTranslate,
    now: () => 7,
  });
  const client = createVocabularyClient(
    (message) =>
      new Promise((resolve) => {
        answerVocabularyMessage(message, handle, resolve);
      }),
  );
  return { client, translate, createTranslate, vocabulary };
}

describe('vocabulary service', () => {
  it('translates the context as one continuous text after saving', async () => {
    const { client, translate, createTranslate, vocabulary } = setup();
    await client.save(INPUT);
    await vi.waitFor(async () => {
      const [word] = await vocabulary.list();
      expect(word?.encounters[0]?.translation).toBe('譯文');
    });
    expect(createTranslate).toHaveBeenCalledWith({
      source: 'en',
      target: 'zh-TW',
    });
    expect(translate.mock.calls[0]).toEqual([
      ['so I had to get rid of the old stuff in the garage'],
      expect.any(AbortSignal),
    ]);
  });

  it('keeps the save when the translation fails', async () => {
    const { client, translate } = setup();
    translate.mockRejectedValueOnce(new Error('offline'));
    const word = await client.save(INPUT);
    expect(word.encounters[0]?.translation).toBeNull();
  });

  it('translates once and then reuses the stored text', async () => {
    const { client, translate, vocabulary } = setup();
    const saved = await client.save(INPUT);
    const encounterId = saved.encounters[0]?.id ?? '';
    await expect(client.fillTranslation(saved.id, encounterId)).resolves.toBe(
      '譯文',
    );
    await vi.waitFor(async () => {
      const [word] = await vocabulary.list();
      expect(word?.encounters[0]?.translation).toBe('譯文');
    });
    translate.mockClear();
    await expect(client.fillTranslation(saved.id, encounterId)).resolves.toBe(
      '譯文',
    );
    expect(translate).not.toHaveBeenCalled();
  });

  it('skips translation within the same language', async () => {
    const { client, translate } = setup();
    const saved = await client.save({ ...INPUT, target: 'en-GB' });
    await expect(
      client.fillTranslation(saved.id, saved.encounters[0]?.id ?? ''),
    ).resolves.toBeNull();
    expect(translate).not.toHaveBeenCalled();
  });

  it('applies grades with the service clock', async () => {
    const { client } = setup();
    const saved = await client.save(INPUT);
    const graded = await client.grade(
      saved.id,
      saved.encounters[0]?.id ?? '',
      'good',
    );
    expect(graded?.review.lastReviewedAt).toBe(7);
  });

  it('passes a failed command back to the caller', async () => {
    const client = createVocabularyClient(() =>
      Promise.resolve({ ok: false, error: '壞了' }),
    );
    await expect(client.list()).rejects.toThrow('壞了');
  });

  it('reports a background script that did not answer', async () => {
    const client = createVocabularyClient(() => Promise.resolve(undefined));
    await expect(client.list()).rejects.toThrow('沒有回應');
  });

  it('recognises only its own messages', () => {
    expect(isVocabularyMessage({ type: 'vocabulary', command: {} })).toBe(true);
    expect(isVocabularyMessage({ type: 'dev-reload' })).toBe(false);
    expect(isVocabularyMessage(null)).toBe(false);
  });
});
