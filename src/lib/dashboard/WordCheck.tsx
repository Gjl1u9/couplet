import { useState, type KeyboardEvent } from 'react';
import { frequencyLanguage } from '../hints/frequency';
import { wordCheckFor } from '../hints/word-check';
import { LEARNING_LANGUAGES } from '../settings/settings';

const format = (size: number) => size.toLocaleString('en-US');

const nameOf = (code: string) =>
  LEARNING_LANGUAGES.find((language) => language.code === code)?.name ?? code;

/**
 * Asks how many of the learning language's common words the user knows, as rows from
 * easy to hard, so new-word hints can start before any word is saved. Renders nothing
 * for a language without a word list.
 */
export function WordCheck({
  language,
  levels,
  onSave,
}: {
  readonly language: string;
  readonly levels: Readonly<Record<string, number>>;
  readonly onSave: (levels: Readonly<Record<string, number>>) => void;
}) {
  const check = wordCheckFor(language);
  const listed = frequencyLanguage(language);
  const saved = listed ? levels[listed] : undefined;
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(-1);
  const name = nameOf(language);

  // Only languages with a word list have hints, so the others don't see the check.
  if (!check || !listed) return null;

  const start = () => {
    setChosen(check.rows.findIndex((row) => row.size === saved));
    setOpen(true);
  };

  if (!open) {
    const row = check.rows.find((item) => item.size === saved);
    return (
      <section className="menu-group word-check">
        <h2 className="menu-title">Words you know</h2>
        <div className="word-check-head">
          {saved === undefined ? (
            <p>
              Tell Couplet roughly how many {name} words you know, and it points
              out words worth learning at your level.
            </p>
          ) : (
            <p>
              <strong>
                About {format(saved)} common {name} words
              </strong>
              {row ? ` · ~${check.scale} ${row.level}` : ''}
            </p>
          )}
          <button type="button" className="button" onClick={start}>
            {saved === undefined ? `Check my ${name} words` : 'Change'}
          </button>
        </div>
      </section>
    );
  }

  const move = (event: KeyboardEvent, index: number) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
      event.key
    ];
    if (!step) return;
    event.preventDefault();
    const next = Math.min(Math.max(index + step, 0), check.rows.length - 1);
    setChosen(next);
    const rungs = event.currentTarget.parentElement?.children;
    (rungs?.[next] as HTMLElement | undefined)?.focus();
  };

  const picked = check.rows[chosen];
  return (
    <section className="menu-group word-check">
      <h2 className="menu-title">Words you know · {name}</h2>
      <p>Choose the last row where you know every word.</p>
      <div
        className="word-ladder"
        role="radiogroup"
        aria-label={`${name} words by how common they are`}
      >
        {check.rows.map((row, index) => (
          <button
            key={row.size}
            type="button"
            role="radio"
            aria-checked={index === chosen}
            tabIndex={index === Math.max(chosen, 0) ? 0 : -1}
            className={`word-rung${index <= chosen ? ' is-known' : ''}`}
            onClick={() => {
              setChosen(index);
            }}
            onKeyDown={(event) => {
              move(event, index);
            }}
          >
            <span className="word-rung-size">
              <strong>{format(row.size)}</strong>
              <small>~{row.level}</small>
            </span>
            <span className="word-rung-words" lang={listed}>
              {row.words.map((word) => (
                <span key={word}>{word}</span>
              ))}
            </span>
            <span className="word-rung-state" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 12l5 5l9 -10" />
              </svg>
              Known
            </span>
          </button>
        ))}
      </div>
      <div className="word-check-head">
        <p aria-live="polite">
          {picked ? (
            <>
              You know about the <strong>{format(picked.size)}</strong> most
              common {name} words
            </>
          ) : (
            'Choose a row.'
          )}
        </p>
        <div className="word-check-actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              setOpen(false);
            }}
          >
            Not now
          </button>
          <button
            type="button"
            className="button is-primary"
            disabled={!picked}
            onClick={() => {
              if (!picked) return;
              onSave({ ...levels, [listed]: picked.size });
              setOpen(false);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </section>
  );
}
