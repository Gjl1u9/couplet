import { useEffect, useState } from 'react';

/** Long enough to read while answering quickly; Z still undoes after it leaves. */
export const ANSWER_SHOWN_MS = 2500;
/** Problems stay longer, since they ask the user to do something. */
const ALERT_MS = 6000;

export interface PillMessage {
  /** Tells a new message from an old one with the same words. */
  readonly id: number;
  readonly text: string;
  /** The word it is about, in bold: before the text, or after it with `wordLast`. */
  readonly word?: string;
  readonly wordLast?: boolean;
  /** Offers Undo while the page has a step to undo. */
  readonly undo?: boolean;
  readonly alert?: boolean;
}

/**
 * One line on what an action did, with Undo. Review puts it above the grade buttons,
 * where the eyes already are; Words floats it at the bottom. The region stays mounted
 * so screen readers hear each new message.
 */
export function AnswerPill({
  message,
  onUndo,
  onDismiss,
  shownMs = ANSWER_SHOWN_MS,
  floating = false,
}: {
  readonly message: PillMessage | null;
  /** How long a message without a problem stays. */
  readonly shownMs?: number;
  /** Fixed at the bottom of the window, for pages without grade buttons. */
  readonly floating?: boolean;
  /** `null` when there is nothing to undo. */
  readonly onUndo: (() => void) | null;
  readonly onDismiss: () => void;
}) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (message === null || held) return undefined;
    const timer = setTimeout(onDismiss, message.alert ? ALERT_MS : shownMs);
    return () => {
      clearTimeout(timer);
    };
  }, [message, held, onDismiss, shownMs]);
  useEffect(() => {
    if (message === null) setHeld(false);
  }, [message]);
  const hold = () => {
    setHeld(true);
  };
  const release = () => {
    setHeld(false);
  };
  const undo = message?.undo ? onUndo : null;
  const word = message?.word ? <strong>{message.word}</strong> : null;
  return (
    <div
      className={floating ? 'answer-pill-slot is-floating' : 'answer-pill-slot'}
      role="status"
    >
      {message === null ? null : (
        <div
          key={message.id}
          className={[
            'answer-pill',
            undo ? '' : 'no-undo',
            message.alert ? 'is-alert' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onMouseEnter={hold}
          onMouseLeave={release}
          onFocus={hold}
          onBlur={release}
        >
          <span>
            {message.wordLast ? (
              <>
                {message.text} {word}
              </>
            ) : word ? (
              <>
                {word} · {message.text}
              </>
            ) : (
              message.text
            )}
          </span>
          {undo ? (
            <button type="button" onClick={undo}>
              Undo
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
