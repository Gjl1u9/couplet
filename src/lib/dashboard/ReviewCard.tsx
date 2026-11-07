import { useEffect, useState } from 'react';
import { sameLanguage } from '../language';
import { ICON_SPEAK } from '../ui/dom';
import type { Encounter, SavedWord } from '../vocabulary/vocabulary';
import { jumpLink } from '../youtube/origin';
import { DictionaryButton } from './Dictionary';
import { formatTimestamp } from './format';
import { Icon, ICONS } from './Icon';
import { LevelTrack } from './LevelTrack';
import type { DashboardServices } from './services';
import { VideoTitle } from './VideoTitle';
import {
  DeleteConfirm,
  MarkedCue,
  STOP_REVIEWING_HINT,
  TranslationText,
  useEncounterTranslation,
} from './WordParts';

export interface ReviewCardHandle {
  toggleTranslation: () => void;
  toggleDictionary: () => void;
  speak: () => void;
  /** Closes what is open. Returns whether anything was. */
  dismiss: () => boolean;
}

export function ReviewCard({
  word,
  encounter,
  services,
  onRetire,
  onDelete,
  contextCollapsed,
  onToggleContext,
  handleRef,
}: {
  readonly word: SavedWord;
  readonly encounter: Encounter;
  readonly services: DashboardServices;
  readonly onRetire: () => void;
  readonly onDelete: () => void;
  /** Kept across Cards by the page. */
  readonly contextCollapsed: boolean;
  readonly onToggleContext: () => void;
  readonly handleRef: { current: ReviewCardHandle | null };
}) {
  const [open, setOpen] = useState(false);
  const [dictionary, setDictionary] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [playing, setPlaying] = useState(false);
  const translation = useEncounterTranslation(services, word, encounter);
  const translatable = !sameLanguage(word.source, word.target);

  const toggleTranslation = () => {
    if (!translatable) return;
    if (
      !open &&
      translation.text === null &&
      translation.status !== 'pending'
    ) {
      translation.load();
    }
    setOpen(!open);
  };
  const speak = () => {
    setPlaying(true);
    services.speaker.speak(encounter.form, word.source, () => {
      setPlaying(false);
    });
  };

  handleRef.current = {
    toggleTranslation,
    toggleDictionary: () => {
      setDictionary(!dictionary);
    },
    speak,
    dismiss: () => {
      if (confirming) {
        setConfirming(false);
        return true;
      }
      if (dictionary) {
        setDictionary(false);
        return true;
      }
      return false;
    },
  };

  useEffect(
    () => () => {
      services.speaker.stop();
    },
    [services],
  );

  const current = encounter.cues[encounter.currentCue];
  return (
    <article
      className="card review-card"
      aria-label="Review card"
      tabIndex={-1}
      id="card"
    >
      <div className="review-source">
        {encounter.origin ? (
          <>
            <a
              className="text-button"
              href={jumpLink(encounter.origin, current)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon paths={ICONS.play} /> Back to video
              {typeof current?.startMs === 'number'
                ? ` ${formatTimestamp(current.startMs)}`
                : ''}
            </a>
            <span className="review-title">
              <VideoTitle origin={encounter.origin} />
            </span>
          </>
        ) : (
          <span className="review-title" />
        )}
        <DictionaryButton
          word={word}
          services={services}
          withSpeak={false}
          open={dictionary}
          onOpenChange={setDictionary}
        />
      </div>
      <div className="review-word-row">
        <h1 className="review-word" lang={word.source} dir="auto">
          {encounter.form}
        </h1>
        <button
          className={playing ? 'icon-button is-playing' : 'icon-button'}
          type="button"
          aria-label="Play pronunciation"
          onClick={speak}
        >
          <Icon paths={ICON_SPEAK} />
        </button>
      </div>
      <LevelTrack review={word.review} />
      <div className="cues" lang={word.source}>
        {encounter.cues.map((cue, at) => {
          const isCurrent = at === encounter.currentCue;
          if (!isCurrent && contextCollapsed) return null;
          return (
            <p
              className={isCurrent ? 'cue is-current' : 'cue'}
              dir="auto"
              key={`${String(at)}-${cue.original}`}
            >
              {isCurrent ? (
                <MarkedCue
                  text={cue.original}
                  form={encounter.form}
                  offset={encounter.formOffset}
                />
              ) : (
                cue.original
              )}
              {isCurrent && encounter.cues.length > 1 ? (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={
                    contextCollapsed ? 'Show nearby lines' : 'Hide nearby lines'
                  }
                  aria-expanded={!contextCollapsed}
                  onClick={onToggleContext}
                >
                  <Icon paths={contextCollapsed ? ICONS.down : ICONS.up} />
                </button>
              ) : null}
            </p>
          );
        })}
      </div>
      <div className="review-tools">
        {translatable ? (
          <button
            className="text-button disclosure"
            type="button"
            aria-expanded={open}
            onClick={toggleTranslation}
          >
            <Icon paths={ICONS.right} />
            {open ? 'Hide translation' : 'Show translation'}
          </button>
        ) : null}
      </div>
      {open ? (
        <TranslationText
          status={translation.status}
          text={translation.text}
          className="review-translation"
          onRetry={translation.load}
        />
      ) : null}
      <div className="review-actions">
        {confirming ? (
          <DeleteConfirm
            word={word}
            onCancel={() => {
              setConfirming(false);
            }}
            onDelete={onDelete}
          />
        ) : (
          <>
            <button
              className="action"
              type="button"
              title={STOP_REVIEWING_HINT}
              onClick={onRetire}
            >
              <Icon paths={ICONS.check} /> Stop reviewing
            </button>
            <button
              className="action is-danger"
              type="button"
              onClick={() => {
                setConfirming(true);
              }}
            >
              <Icon paths={ICONS.trash} /> Delete
            </button>
          </>
        )}
      </div>
    </article>
  );
}
