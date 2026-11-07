import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { sameLanguage } from '../language';
import { intervalSeconds, type Grade } from '../vocabulary/schedule';
import {
  dueWords,
  encounterForReview,
  type SavedWord,
} from '../vocabulary/vocabulary';
import { formatDue, formatInterval, shortLabel } from './format';
import { ReviewCard, type ReviewCardHandle } from './ReviewCard';
import type { DashboardServices } from './services';
import { Toast } from './Toast';
import { stoppedMessage } from './WordParts';
import { reduceSession, startSession, type SessionOutcome } from './session';

const GRADES: readonly { readonly id: Grade; readonly label: string }[] = [
  { id: 'again', label: 'Forgot' },
  { id: 'hard', label: 'Unsure' },
  { id: 'good', label: 'Got it' },
];

/** Always in view, because a shortcut nobody can see is one nobody uses. */
const KEY_HINTS: readonly {
  readonly keys: readonly string[];
  readonly label: string;
}[] = [
  { keys: ['1', '2', '3'], label: 'Grade' },
  { keys: ['Space'], label: 'Translation' },
  { keys: ['D'], label: 'Dictionary' },
  { keys: ['P'], label: 'Pronunciation' },
  { keys: ['C'], label: 'Nearby lines' },
  { keys: ['Z'], label: 'Undo' },
];

/** Long waits are left for the next visit. */
const MAX_WAKE_MS = 60 * 60 * 1000;

const CONTEXT_COLLAPSED_KEY = 'review-context-collapsed';

/** A convenience for this browser, so it may fail in a private window. */
function readContextCollapsed(): boolean {
  try {
    return localStorage.getItem(CONTEXT_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveContextCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(CONTEXT_COLLAPSED_KEY, String(collapsed));
  } catch {
    // Only the preference is lost.
  }
}

function Done({
  outcomes,
  nextDue,
}: {
  readonly outcomes: readonly SessionOutcome[];
  readonly nextDue: number | null;
}) {
  const reviewed = outcomes.filter((outcome) => outcome !== 'retired').length;
  const next =
    nextDue === null
      ? ''
      : `The next one returns ${formatDue(nextDue, Date.now()).toLowerCase()}.`;
  return (
    <section className="card empty">
      <h1>
        {reviewed > 0 ? 'All done for now' : 'Nothing to review right now'}
      </h1>
      <p className="page-note">
        {reviewed > 0
          ? `You reviewed ${String(reviewed)} ${reviewed === 1 ? 'word' : 'words'}. `
          : ''}
        {next}
      </p>
      <a className="button is-primary" href="#/">
        Back to Home
      </a>
    </section>
  );
}

export function ReviewPage({
  services,
  learningLanguage,
}: {
  readonly services: DashboardServices;
  readonly learningLanguage: string;
}) {
  const [session, dispatch] = useReducer(reduceSession, startSession([]));
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);
  const [nextDue, setNextDue] = useState<number | null>(null);
  const [contextCollapsed, setContextCollapsed] =
    useState(readContextCollapsed);
  const toggleContext = useCallback(() => {
    setContextCollapsed((collapsed) => {
      saveContextCollapsed(!collapsed);
      return !collapsed;
    });
  }, []);
  const card = useRef<ReviewCardHandle | null>(null);

  const word: SavedWord | undefined = session.queue[session.index];
  const encounter = word ? encounterForReview(word) : null;

  /** Brings back words that came due, such as one graded Forgot ten minutes ago. */
  const refresh = useCallback(async () => {
    const all = (await services.vocabulary.list()).filter((item) =>
      sameLanguage(item.source, learningLanguage),
    );
    const now = Date.now();
    dispatch({ type: 'due', words: dueWords(all, now) });
    const upcoming = all
      .filter((item) => !item.review.retired && item.review.dueAt > now)
      .map((item) => item.review.dueAt)
      .sort((a, b) => a - b)[0];
    setNextDue(upcoming ?? null);
    setLoaded(true);
  }, [services, learningLanguage]);

  useEffect(() => {
    refresh().catch(() => {
      setStatus("Couldn't load your words");
      setLoaded(true);
    });
  }, [refresh, session.outcomes.length]);

  useEffect(() => {
    if (nextDue === null) return undefined;
    const wait = nextDue - Date.now();
    if (wait > MAX_WAKE_MS) return undefined;
    const timer = setTimeout(
      () => {
        void refresh();
      },
      Math.max(wait, 0) + 50,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [nextDue, refresh]);

  /** A second key press must not grade the same Card twice. */
  const busy = useRef(false);
  const once = (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setNotice(null);
    action()
      .catch(() => {
        setStatus("Couldn't save. Try again.");
      })
      .finally(() => {
        busy.current = false;
      });
  };

  const answer = (grade: Grade) => {
    if (!word || !encounter) return;
    once(async () => {
      const next = await services.vocabulary.grade(
        word.id,
        encounter.id,
        grade,
      );
      if (!next) {
        // Deleted in another tab, so there is nothing left to grade.
        dispatch({ type: 'deleted' });
        setStatus(`${shortLabel(word.lemma)} was deleted`);
        return;
      }
      const eventAt = next.review.lastReviewedAt;
      dispatch({
        type: 'answered',
        outcome: grade,
        step: { word, eventAt, stamp: next.reviewStamp ?? null },
      });
      setStatus(
        next.review.retired
          ? `${shortLabel(word.lemma)}: finished`
          : `${shortLabel(word.lemma)}: back in ${formatInterval((next.review.dueAt - (eventAt ?? 0)) / 1000)}`,
      );
    });
  };

  const retire = () => {
    if (!word) return;
    once(async () => {
      const next = await services.vocabulary.retire(word.id);
      dispatch({
        type: 'answered',
        outcome: 'retired',
        step: { word, eventAt: null, stamp: next?.reviewStamp ?? null },
      });
      setStatus('');
      setNotice(stoppedMessage(word.lemma));
    });
  };

  const remove = () => {
    if (!word) return;
    once(async () => {
      await services.vocabulary.remove(word.id);
      dispatch({ type: 'deleted' });
      setStatus(`Deleted ${shortLabel(word.lemma)}`);
    });
  };

  const undoStep = session.undo.at(-1);
  const undo = () => {
    if (!undoStep) return;
    once(async () => {
      const result = await services.vocabulary.revert(
        undoStep.word,
        undoStep.eventAt,
        undoStep.stamp,
      );
      if (result === 'changed') {
        dispatch({ type: 'undo-refused' });
        setStatus('Changed on another device');
        return;
      }
      dispatch({ type: 'undone' });
      setStatus('Undone');
    });
  };

  const latest = useRef({ answer, undo, hasCard: false });
  latest.current = { answer, undo, hasCard: Boolean(word && encounter) };
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (event.key === 'Escape') {
        if (latest.current.hasCard) card.current?.dismiss();
        return;
      }
      if (event.key === 'z') {
        latest.current.undo();
        return;
      }
      // The handle outlives the last Card, so the Done screen must not use it.
      if (!card.current || !latest.current.hasCard) return;
      if (event.key === ' ' && !target?.closest('button, a')) {
        event.preventDefault();
        card.current.toggleTranslation();
      } else if (event.key === 'd') {
        card.current.toggleDictionary();
      } else if (event.key === 'p') {
        card.current.speak();
      } else if (event.key === 'c') {
        toggleContext();
      } else {
        const grade = GRADES[Number(event.key) - 1];
        if (grade && !document.querySelector('.review-card .confirm')) {
          latest.current.answer(grade.id);
        }
      }
    };
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('keydown', onKeydown);
    };
  }, [toggleContext]);

  useEffect(() => {
    if (word) document.getElementById('card')?.focus({ preventScroll: true });
  }, [word]);

  const total = session.queue.length;
  return (
    <div className="page review">
      <div className="review-head">
        <a className="text-button" href="#/">
          End review
        </a>
        <span className="review-status" role="status">
          {status}
        </span>
        {undoStep && notice === null ? (
          <button className="text-button" type="button" onClick={undo}>
            Undo
          </button>
        ) : null}
        {total > 0 ? (
          <span className="muted review-count">
            {Math.min(session.index + 1, total)} / {total}
          </span>
        ) : null}
      </div>
      <div className="review-bar" aria-hidden="true">
        <span
          style={{ width: `${String((session.index / (total || 1)) * 100)}%` }}
        />
      </div>
      {word && encounter ? (
        <>
          <ReviewCard
            key={`${word.id}-${String(session.index)}`}
            word={word}
            encounter={encounter}
            services={services}
            onRetire={retire}
            onDelete={remove}
            contextCollapsed={contextCollapsed}
            onToggleContext={toggleContext}
            handleRef={card}
          />
          <div className="grades">
            {GRADES.map((grade, at) => {
              const seconds = intervalSeconds(word.review.level, grade.id);
              return (
                <button
                  className="grade"
                  type="button"
                  key={grade.id}
                  onClick={() => {
                    answer(grade.id);
                  }}
                >
                  <kbd>{at + 1}</kbd>
                  <b>{grade.label}</b>
                  <small>
                    {seconds === null ? 'Done' : formatInterval(seconds)}
                  </small>
                </button>
              );
            })}
            <dl className="review-keys" aria-label="Keyboard shortcuts">
              {KEY_HINTS.map(({ keys, label }) => (
                <div key={label}>
                  <dt>
                    {keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      ) : loaded ? (
        <Done outcomes={session.outcomes} nextDue={nextDue} />
      ) : null}
      <Toast message={notice} onUndo={undo} onDismiss={dismissNotice} />
    </div>
  );
}
