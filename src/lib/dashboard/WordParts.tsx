/** Shown before the click, because the button leaves the schedule without asking. */
export const STOP_REVIEWING_HINT =
  'Takes this word off your review schedule. It stays in Words.';

export const stoppedMessage = (lemma: string) =>
  `${lemma} won't come up for review again. It stays in Words as Known.`;

export const restoredMessage = (lemma: string) =>
  `${lemma} is back in review, starting from the first step.`;

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Encounter, SavedWord } from '../vocabulary/vocabulary';
import { markWord } from './format';
import { Icon, ICONS } from './Icon';
import type { DashboardServices } from './services';

export function MarkedCue({
  text,
  form,
  offset,
}: {
  readonly text: string;
  readonly form: string;
  readonly offset: number | null;
}) {
  const marked = markWord(text, form, offset);
  return marked ? (
    <>
      {marked.before}
      <mark>{marked.mark}</mark>
      {marked.after}
    </>
  ) : (
    text
  );
}

export type TranslationStatus = 'pending' | 'failed' | 'ready';

export function TranslationText({
  status,
  text,
  className,
  onRetry,
}: {
  readonly status: TranslationStatus;
  readonly text: string | null;
  readonly className: string;
  readonly onRetry: () => void;
}): ReactNode {
  if (status === 'pending') {
    return (
      <div className={className} aria-label="Loading translation">
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <p className={`${className} is-alert`} role="alert">
        Couldn&apos;t load the translation.{' '}
        <button className="text-button" type="button" onClick={onRetry}>
          Try again
        </button>
      </p>
    );
  }
  return (
    <p className={className} dir="auto">
      {text}
    </p>
  );
}

/** Fetches an Encounter's translation once, the first time it is wanted. */
export function useEncounterTranslation(
  services: DashboardServices,
  word: SavedWord,
  encounter: Encounter,
) {
  const [text, setText] = useState(encounter.translation);
  const [status, setStatus] = useState<TranslationStatus>('ready');
  const load = () => {
    setStatus('pending');
    services.vocabulary.fillTranslation(word.id, encounter.id).then(
      (result) => {
        setText(result);
        setStatus(result === null ? 'failed' : 'ready');
      },
      () => {
        setStatus('failed');
      },
    );
  };
  return { text, status, load };
}

export function DeleteConfirm({
  word,
  onCancel,
  onDelete,
}: {
  readonly word: SavedWord;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  return (
    <>
      <span className="confirm" role="alert">
        Delete {word.lemma} and its progress?
      </span>
      <button className="action" type="button" ref={cancel} onClick={onCancel}>
        Cancel
      </button>
      <button className="action is-danger" type="button" onClick={onDelete}>
        <Icon paths={ICONS.trash} /> Delete
      </button>
    </>
  );
}
