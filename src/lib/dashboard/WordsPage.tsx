import { useCallback, useEffect, useRef, useState } from 'react';
import { sameLanguage } from '../language';
import type { Encounter, SavedWord } from '../vocabulary/vocabulary';
import { jumpLink } from '../youtube/origin';
import { DictionaryButton } from './Dictionary';
import { wordsToCsv } from './export';
import { formatDue, formatTimestamp, savedGroup } from './format';
import { Icon, ICONS } from './Icon';
import { LevelTrack } from './LevelTrack';
import type { DashboardServices } from './services';
import { VideoTitle } from './VideoTitle';
import { Toast } from './Toast';
import {
  DeleteConfirm,
  MarkedCue,
  restoredMessage,
  STOP_REVIEWING_HINT,
  stoppedMessage,
  TranslationText,
  useEncounterTranslation,
} from './WordParts';
import { STAGES, stageCounts, stageLabel, stageOf, type Stage } from './stats';

type StageFilter = Stage | 'all';
type WordView = 'date' | 'video';

interface Notice {
  readonly message: string;
  /** The word before the action, so Undo keeps its level. */
  readonly before: SavedWord;
  /** The schedule the action wrote. Undo is refused once it has moved on. */
  readonly stamp: string | null;
}

const NO_VIDEO = 'No video';

function nextLabel(word: SavedWord, now: number): string {
  const { retired, dueAt } = word.review;
  if (retired)
    return retired.reason === 'mastered' ? 'Finished' : 'Not reviewing';
  return formatDue(dueAt, now);
}

function SentenceBlock({
  word,
  encounter,
  services,
}: {
  readonly word: SavedWord;
  readonly encounter: Encounter;
  readonly services: DashboardServices;
}) {
  const [expanded, setExpanded] = useState(false);
  const [translated, setTranslated] = useState(false);
  const translation = useEncounterTranslation(services, word, encounter);
  const current = encounter.cues[encounter.currentCue];
  const toggleTranslation = () => {
    if (
      !translated &&
      translation.text === null &&
      translation.status !== 'pending'
    ) {
      translation.load();
    }
    setTranslated(!translated);
  };
  return (
    <div className="sentence">
      {encounter.cues.map((cue, at) => {
        if (at !== encounter.currentCue) {
          return expanded ? (
            <div
              className="sentence-line"
              lang={word.source}
              dir="auto"
              key={`${String(at)}-${cue.original}`}
            >
              {cue.original}
            </div>
          ) : null;
        }
        return (
          <div
            className="sentence-text"
            lang={word.source}
            dir="auto"
            key={`${String(at)}-${cue.original}`}
          >
            <MarkedCue
              text={cue.original}
              form={encounter.form}
              offset={encounter.formOffset}
            />
            {encounter.cues.length > 1 ? (
              <button
                className="icon-button"
                type="button"
                aria-label={
                  expanded ? 'Hide nearby lines' : 'Show nearby lines'
                }
                title={expanded ? 'Hide nearby lines' : 'Show nearby lines'}
                aria-expanded={expanded}
                onClick={() => {
                  setExpanded(!expanded);
                }}
              >
                <Icon paths={expanded ? ICONS.up : ICONS.down} />
              </button>
            ) : null}
          </div>
        );
      })}
      {translated ? (
        <TranslationText
          status={translation.status}
          text={translation.text}
          className="sentence-translation"
          onRetry={translation.load}
        />
      ) : null}
      <div className="sentence-tools">
        {!sameLanguage(word.source, word.target) ? (
          <button
            className="text-button"
            type="button"
            onClick={toggleTranslation}
          >
            {translated ? 'Hide translation' : 'Show translation'}
          </button>
        ) : null}
        {encounter.origin ? (
          <>
            <a
              className="text-button"
              href={jumpLink(encounter.origin, current)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon paths={ICONS.play} />
              {typeof current?.startMs === 'number'
                ? formatTimestamp(current.startMs)
                : 'Open video'}
            </a>
            <span className="muted sentence-video">
              <VideoTitle origin={encounter.origin} />
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function WordDetail({
  word,
  services,
  onNotice,
}: {
  readonly word: SavedWord;
  readonly services: DashboardServices;
  readonly onNotice: (notice: Notice | null) => void;
}) {
  const [dictionary, setDictionary] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = (action: Promise<unknown>) => {
    setFailed(false);
    action.catch(() => {
      setFailed(true);
    });
  };
  return (
    <div
      className="word-detail"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        setConfirming(false);
        setDictionary(false);
      }}
    >
      <div className="detail-top">
        <LevelTrack review={word.review} />
        <DictionaryButton
          word={word}
          services={services}
          withSpeak
          open={dictionary}
          onOpenChange={setDictionary}
        />
      </div>
      {word.encounters.map((encounter) => (
        <SentenceBlock
          word={word}
          encounter={encounter}
          services={services}
          key={encounter.id}
        />
      ))}
      <div className="detail-actions">
        {failed ? (
          <span className="confirm" role="alert">
            Couldn&apos;t save. Try again.
          </span>
        ) : null}
        {confirming ? (
          <DeleteConfirm
            word={word}
            onCancel={() => {
              setConfirming(false);
            }}
            onDelete={() => {
              onNotice(null);
              run(services.vocabulary.remove(word.id));
            }}
          />
        ) : (
          <>
            <button
              className="action"
              type="button"
              title={word.review.retired ? undefined : STOP_REVIEWING_HINT}
              onClick={() => {
                const { retired } = word.review;
                run(
                  (retired
                    ? services.vocabulary.restore(word.id)
                    : services.vocabulary.retire(word.id)
                  ).then((next) => {
                    onNotice({
                      stamp: next?.reviewStamp ?? null,
                      message: retired
                        ? restoredMessage(word.lemma)
                        : stoppedMessage(word.lemma),
                      before: word,
                    });
                  }),
                );
              }}
            >
              <Icon paths={ICONS.check} />{' '}
              {word.review.retired ? 'Review again' : 'Stop reviewing'}
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
    </div>
  );
}

function WordRow({
  word,
  services,
  now,
  open,
  onToggle,
  onNotice,
}: {
  readonly word: SavedWord;
  readonly services: DashboardServices;
  readonly now: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onNotice: (notice: Notice | null) => void;
}) {
  const row = useRef<HTMLLIElement>(null);
  const stage = stageOf(word);
  const origin = word.encounters[0]?.origin;
  useEffect(() => {
    if (open) row.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  return (
    <li className="word-row" ref={row}>
      <button
        className="word-summary"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="row-word" lang={word.source} dir="auto">
          {word.lemma}
        </span>
        <span className="word-from">
          {origin ? <VideoTitle origin={origin} /> : null}
        </span>
        <span className="stage">
          <span className={`stage-dot is-${stage}`} />
          {stageLabel(stage)}
        </span>
        <span className="word-next">{nextLabel(word, now)}</span>
        <Icon paths={ICONS.down} />
      </button>
      {open ? (
        <WordDetail word={word} services={services} onNotice={onNotice} />
      ) : null}
    </li>
  );
}

function downloadCsv(words: readonly SavedWord[]) {
  const url = URL.createObjectURL(
    new Blob([wordsToCsv(words)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'vocabulary.csv';
  link.click();
  URL.revokeObjectURL(url);
}

const isStageFilter = (value: string | null): value is StageFilter =>
  value === 'all' || STAGES.some(({ id }) => id === value);

export function WordsPage({
  services,
  words,
  focusWordId,
  focusStage,
}: {
  readonly services: DashboardServices;
  readonly words: readonly SavedWord[];
  readonly focusWordId: string | null;
  readonly focusStage: string | null;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StageFilter>('all');
  const [view, setView] = useState<WordView>('date');
  const [openId, setOpenId] = useState(focusWordId);
  const [notice, setNotice] = useState<Notice | null>(null);
  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);
  const undoNotice = () => {
    if (!notice) return;
    setNotice(null);
    services.vocabulary.revert(notice.before, null, notice.stamp).catch(() => {
      setNotice(notice);
    });
  };
  useEffect(() => {
    setOpenId(focusWordId);
    if (focusWordId) setFilter('all');
  }, [focusWordId]);
  useEffect(() => {
    if (isStageFilter(focusStage)) setFilter(focusStage);
  }, [focusStage]);

  if (words.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Words</h1>
        </div>
        <section className="card empty">
          <p className="page-note">
            Words you save from videos will appear here.
          </p>
        </section>
      </div>
    );
  }

  const now = Date.now();
  const wanted = query.trim().toLocaleLowerCase();
  const counts = stageCounts(words);
  const shown = [...words]
    .sort((a, b) => b.savedAt - a.savedAt)
    .filter((word) => filter === 'all' || stageOf(word) === filter)
    .filter(
      (word) =>
        wanted === '' ||
        word.lemma.toLocaleLowerCase().includes(wanted) ||
        word.forms.some((form) => form.toLocaleLowerCase().includes(wanted)) ||
        word.encounters.some((item) =>
          item.origin?.title.toLocaleLowerCase().includes(wanted),
        ),
    );
  const groups = [
    ...Map.groupBy(shown, (word) =>
      view === 'date'
        ? savedGroup(word.savedAt, now)
        : (word.encounters[0]?.origin?.title ?? NO_VIDEO),
    ),
  ];
  const filters: readonly {
    readonly id: StageFilter;
    readonly label: string;
    readonly count: number;
  }[] = [
    { id: 'all', label: 'All', count: words.length },
    ...STAGES.map(({ id, label }) => ({ id, label, count: counts[id] })),
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Words</h1>
        <button
          className="button"
          type="button"
          disabled={shown.length === 0}
          onClick={() => {
            downloadCsv(shown);
          }}
        >
          <Icon paths={ICONS.download} /> Export
        </button>
      </div>
      <div className="tools">
        <label className="visually-hidden" htmlFor="word-search">
          Search words
        </label>
        <input
          className="search"
          id="word-search"
          type="search"
          placeholder="Search words or videos"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <div className="switcher" role="group" aria-label="Group by">
          <button
            className="pill"
            type="button"
            aria-pressed={view === 'date'}
            onClick={() => {
              setView('date');
            }}
          >
            By date
          </button>
          <button
            className="pill"
            type="button"
            aria-pressed={view === 'video'}
            onClick={() => {
              setView('video');
            }}
          >
            By video
          </button>
        </div>
      </div>
      <div
        className="pills word-filters"
        role="group"
        aria-label="Filter by stage"
      >
        {filters.map(({ id, label, count }) => (
          <button
            className="pill"
            type="button"
            aria-pressed={filter === id}
            key={id}
            onClick={() => {
              setFilter(id);
            }}
          >
            {label} {count}
          </button>
        ))}
      </div>
      <section className="card words">
        {shown.length === 0 ? (
          <p className="muted words-empty">No words match.</p>
        ) : (
          groups.map(([title, group]) => (
            <div key={title}>
              <div className="word-group-title">
                {view === 'video' && group[0]?.encounters[0]?.origin ? (
                  <VideoTitle origin={group[0].encounters[0].origin} />
                ) : (
                  title
                )}
              </div>
              <ul className="list">
                {group.map((word) => (
                  <WordRow
                    key={word.id}
                    word={word}
                    services={services}
                    now={now}
                    open={openId === word.id}
                    onToggle={() => {
                      setOpenId(openId === word.id ? null : word.id);
                    }}
                    onNotice={setNotice}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
      <Toast
        message={notice?.message ?? null}
        onUndo={undoNotice}
        onDismiss={dismissNotice}
      />
    </div>
  );
}
