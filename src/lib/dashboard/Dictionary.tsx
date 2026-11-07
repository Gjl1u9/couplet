import { useEffect, useRef, useState } from 'react';
import { ICON_DICTIONARY, ICON_SPEAK } from '../ui/dom';
import { senseRow } from '../ui/lookup-panel';
import type { SavedWord } from '../vocabulary/vocabulary';
import { Icon } from './Icon';
import type { DashboardServices } from './services';

/**
 * Opens on demand, because a visible meaning is the answer, and because its senses may
 * not include what the word means in this sentence.
 */
export function DictionaryButton({
  word,
  services,
  withSpeak,
  open,
  onOpenChange,
}: {
  readonly word: SavedWord;
  readonly services: DashboardServices;
  /** The Review Card already has a play button beside its title. */
  readonly withSpeak: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const senses = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    senses.current?.replaceChildren(...word.senses.map(senseRow));
  }, [word, open]);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onOpenChange]);
  return (
    <span className="dict-anchor" ref={anchor}>
      <button
        className="icon-button"
        type="button"
        aria-label="Open dictionary"
        title="Dictionary"
        aria-expanded={open}
        onClick={() => {
          onOpenChange(!open);
        }}
      >
        <Icon paths={ICON_DICTIONARY} />
      </button>
      {open ? (
        <aside className="dict" aria-label={`Dictionary: ${word.lemma}`}>
          <div className="dict-head">
            <span className="dict-word" lang={word.source} dir="auto">
              {word.lemma}
            </span>
            {word.phonetic ? (
              <span className="muted">{word.phonetic}</span>
            ) : null}
            {withSpeak ? (
              <button
                className={playing ? 'icon-button is-playing' : 'icon-button'}
                type="button"
                aria-label="Play pronunciation"
                onClick={() => {
                  setPlaying(true);
                  services.speaker.speak(word.lemma, word.source, () => {
                    setPlaying(false);
                  });
                }}
              >
                <Icon paths={ICON_SPEAK} />
              </button>
            ) : null}
          </div>
          <div className="lookup-senses" ref={senses} />
        </aside>
      ) : null}
    </span>
  );
}
