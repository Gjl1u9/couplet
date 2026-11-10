import { useEffect, useState } from 'react';
import { sameLanguage } from '../language';
import { ICON_SPEAK } from '../ui/dom';
import type { Encounter, SavedWord } from '../vocabulary/vocabulary';
import { jumpLink } from '../youtube/origin';
import { DictionaryButton } from './Dictionary';
import { formatTimestamp, isLongText } from './format';
import { Icon, ICONS } from './Icon';
import { LevelTrack } from './LevelTrack';
import type { DashboardServices } from './services';
import { VideoTitle } from './VideoTitle';
import {
  KNOWN_HINT,
  MarkedCue,
  RemoveConfirm,
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
  onRemove,
  contextCollapsed,
  onToggleContext,
  handleRef,
}: {
  readonly word: SavedWord;
  readonly encounter: Encounter;
  readonly services: DashboardServices;
  readonly onRetire: () => void;
  readonly onRemove: () => void;
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
        <h1
          className={
            isLongText(encounter.form) ? 'review-word is-long' : 'review-word'
          }
          lang={word.source}
          dir="auto"
        >
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
        {encounter.cues.length > 1 ? (
          // The subtitles' own context switch uses the same icon, and C its key.
          <button
            className="text-button context-button"
            type="button"
            aria-expanded={!contextCollapsed}
            onClick={onToggleContext}
          >
            <Icon
              paths={contextCollapsed ? ICONS.contextOn : ICONS.contextOff}
            />
            {contextCollapsed ? 'Nearby lines' : 'Hide nearby lines'}
            <kbd aria-hidden="true">C</kbd>
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
          <RemoveConfirm
            word={word}
            onCancel={() => {
              setConfirming(false);
            }}
            onRemove={onRemove}
          />
        ) : (
          <>
            <button
              className="action"
              type="button"
              title={KNOWN_HINT}
              onClick={onRetire}
            >
              <Icon paths={ICONS.known} /> I know this
            </button>
            <button
              className="action is-quiet"
              type="button"
              onClick={() => {
                setConfirming(true);
              }}
            >
              <Icon paths={ICONS.trash} /> Remove
            </button>
          </>
        )}
      </div>
    </article>
  );
}
