import { useEffect, useState } from 'react';

const SHOWN_MS = 8000;

/** Says what an action did and offers to take it back. Stays while pointed at or focused. */
export function Toast({
  message,
  onUndo,
  onDismiss,
}: {
  readonly message: string | null;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
}) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (message === null || held) return undefined;
    const timer = setTimeout(onDismiss, SHOWN_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [message, held, onDismiss]);
  useEffect(() => {
    if (message === null) setHeld(false);
  }, [message]);
  const hold = () => {
    setHeld(true);
  };
  const release = () => {
    setHeld(false);
  };
  return (
    <div className="toast-region" role="status">
      {message === null ? null : (
        <div
          className="toast"
          onMouseEnter={hold}
          onMouseLeave={release}
          onFocus={hold}
          onBlur={release}
        >
          <span>{message}</span>
          <button type="button" onClick={onUndo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
