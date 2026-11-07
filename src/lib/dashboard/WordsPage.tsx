import { useCallback, useEffect, useRef, useState } from 'react';
import { sameLanguage } from '../language';
import { explainFailure, type Explanation } from '../lookup/explain';
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
  const explanation = useExplanation(word, encounter, services);
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
      {explanation.open ? <ExplanationText state={explanation} /> : null}
      <div className="sentence-tools">
        <button
          className="text-button ai-button"
          type="button"
          aria-expanded={explanation.open}
          onClick={explanation.toggle}
        >
          <SparklesIcon />
          {explanation.open ? (
            'Hide explanation'
          ) : (
            <>
              Explain with AI <span className="beta">Beta</span>
            </>
          )}
        </button>
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

/** Filled, unlike the other icons, so AI reads apart. From Tabler Icons (MIT). */
function SparklesIcon() {
  return (
    <svg className="ai-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.964 2.733c.156 .563 .312 1 .484 1.353c.342 .71 .758 1.125 1.47 1.467c.353 .17 .79 .326 1.352 .484c.98 .276 .97 1.668 -.013 1.93a8.3 8.3 0 0 0 -1.34 .481c-.71 .342 -1.127 .757 -1.463 1.453a8 8 0 0 0 -.486 1.352c-.258 .988 -1.658 1 -1.932 .015c-.156 -.565 -.312 -1.002 -.484 -1.354c-.342 -.71 -.758 -1.124 -1.458 -1.46a8 8 0 0 0 -1.374 -.495a.4 .4 0 0 1 -.06 -.02l-.044 -.017l-.045 -.02l-.049 -.025l-.035 -.02a.4 .4 0 0 1 -.049 -.03l-.032 -.023l-.043 -.034l-.033 -.028l-.036 -.035l-.034 -.035l-.028 -.033l-.035 -.043l-.022 -.032a.4 .4 0 0 1 -.032 -.049l-.02 -.035l-.025 -.05l-.02 -.044l-.017 -.043a.4 .4 0 0 1 -.02 -.06l-.01 -.034a.5 .5 0 0 1 -.02 -.098l-.006 -.065l-.005 -.035v-.05a.4 .4 0 0 1 .003 -.085a.5 .5 0 0 1 .013 -.093a.5 .5 0 0 1 .024 -.103a.4 .4 0 0 1 .02 -.06l.017 -.044l.02 -.045l.025 -.049l.02 -.035a.4 .4 0 0 1 .03 -.049l.023 -.032l.034 -.043l.028 -.033l.035 -.036l.035 -.034q .015 -.015 .033 -.028l.043 -.035l.032 -.022a.4 .4 0 0 1 .049 -.032l.035 -.02l.05 -.025l.044 -.02l.043 -.017a.4 .4 0 0 1 .06 -.02l.027 -.008a8.3 8.3 0 0 0 1.339 -.48c.71 -.342 1.127 -.757 1.47 -1.466c.17 -.354 .327 -.792 .483 -1.355c.272 -.976 1.657 -.976 1.928 0" />
      <path d="M10.965 6.737q .219 .801 .503 1.574c.856 2.28 1.945 3.363 4.23 4.22q .708 .265 1.571 .506c.976 .272 .974 1.656 -.002 1.927q -.798 .221 -1.568 .504c-2.288 .858 -3.376 1.94 -4.229 4.216a19 19 0 0 0 -.505 1.579c-.268 .983 -1.662 .983 -1.93 0a19 19 0 0 0 -.503 -1.574c-.856 -2.281 -1.944 -3.363 -4.226 -4.219a20 20 0 0 0 -1.594 -.513a.4 .4 0 0 1 -.054 -.018l-.044 -.017l-.043 -.02a.3 .3 0 0 1 -.048 -.024l-.036 -.02a.4 .4 0 0 1 -.048 -.03l-.032 -.024l-.044 -.034l-.033 -.029l-.037 -.034l-.034 -.037l-.03 -.033l-.033 -.044l-.023 -.032a.4 .4 0 0 1 -.03 -.048l-.021 -.036a.3 .3 0 0 1 -.024 -.048l-.02 -.043l-.017 -.044a.4 .4 0 0 1 -.018 -.054a.2 .2 0 0 1 -.01 -.039a.4 .4 0 0 1 -.014 -.059l-.007 -.04l-.007 -.056l-.003 -.044l-.002 -.05v-.05q 0 -.023 .004 -.044q .001 -.03 .007 -.057l.007 -.04a.4 .4 0 0 1 .017 -.076l.007 -.021a.4 .4 0 0 1 .018 -.054l.017 -.044l.02 -.043a.3 .3 0 0 1 .024 -.048l.02 -.036a.4 .4 0 0 1 .03 -.048l.024 -.032l.034 -.044l.029 -.033l.034 -.037l.037 -.034l.033 -.03l.044 -.033l.032 -.023a.4 .4 0 0 1 .048 -.03l.036 -.021a.3 .3 0 0 1 .048 -.024l.043 -.02l.044 -.017a.4 .4 0 0 1 .054 -.018l.021 -.007a20 20 0 0 0 1.568 -.504c2.287 -.858 3.375 -1.94 4.229 -4.216a19 19 0 0 0 .505 -1.579c.268 -.983 1.662 -.983 1.93 0" />
    </svg>
  );
}

/** Asks once per sentence on this page. The service keeps it free to ask again later. */
function useExplanation(
  word: SavedWord,
  encounter: Encounter,
  services: DashboardServices,
) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { readonly status: 'idle' | 'pending' }
    | { readonly status: 'done'; readonly result: Explanation }
    | { readonly status: 'failed'; readonly error: unknown }
  >({ status: 'idle' });
  const load = () => {
    setState({ status: 'pending' });
    services
      .settings()
      .then((settings) =>
        services.explain({
          word: encounter.form,
          cues: encounter.cues.map((cue) => cue.original),
          current: encounter.currentCue,
          source: word.source,
          target: settings.nativeLanguage,
        }),
      )
      .then(
        (result) => {
          setState({ status: 'done', result });
        },
        (error: unknown) => {
          setState({ status: 'failed', error });
        },
      );
  };
  return {
    ...state,
    open,
    load,
    toggle: () => {
      if (!open && (state.status === 'idle' || state.status === 'failed')) {
        load();
      }
      setOpen(!open);
    },
  };
}

function ExplanationText({
  state,
}: {
  readonly state: ReturnType<typeof useExplanation>;
}) {
  if (state.status === 'done') {
    return (
      <div className="sentence-explanation">
        <p dir="auto">{state.result.text}</p>
        <p className="muted">
          AI can make mistakes · {state.result.remaining} left today
        </p>
      </div>
    );
  }
  if (state.status === 'failed') {
    const failure = explainFailure(state.error);
    return (
      <p className="sentence-explanation is-alert" role="alert">
        {failure.text}{' '}
        {failure.canRetry ? (
          <button className="text-button" type="button" onClick={state.load}>
            Try again
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <div className="sentence-explanation" aria-label="Loading explanation">
      <span className="skeleton" />
      <span className="skeleton" />
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
