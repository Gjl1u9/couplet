import {
  dueWords,
  type ReviewEvent,
  type SavedWord,
} from '../vocabulary/vocabulary';
import { formatDue } from './format';
import { Icon, ICONS } from './Icon';
import {
  forecast,
  reviewsLastWeek,
  stageCounts,
  stageLabel,
  stageOf,
  streakDays,
} from './stats';

const RECENT_SHOWN = 4;

const plural = (count: number, one: string) =>
  `${String(count)} ${one}${count === 1 ? '' : 's'}`;

function Welcome() {
  return (
    <div className="page">
      <section className="card hero">
        <div>
          <h1>Start with a video</h1>
          <ol className="welcome">
            <li>
              Open a video with subtitles on{' '}
              <a
                className="text-link"
                href="https://www.youtube.com/"
                target="_blank"
                rel="noreferrer"
              >
                YouTube
              </a>
            </li>
            <li>Click a word you don&apos;t know</li>
            <li>Press the star, and the word appears here</li>
          </ol>
        </div>
      </section>
    </div>
  );
}

export function HomePage({
  words,
  log,
  streakLog,
}: {
  readonly words: readonly SavedWord[];
  readonly log: readonly ReviewEvent[];
  /** Every language's reviews, because a streak measures the habit. */
  readonly streakLog: readonly ReviewEvent[];
}) {
  if (words.length === 0) return <Welcome />;
  const now = Date.now();
  const due = dueWords(words, now).length;
  const later = (forecast(words, now, 1)[0]?.count ?? 0) - due;
  const upcoming = words
    .filter((word) => !word.review.retired && word.review.dueAt > now)
    .map((word) => word.review.dueAt)
    .sort((a, b) => a - b)[0];
  const known = stageCounts(words).known;
  const recent = [...words]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, RECENT_SHOWN);

  let note = '';
  if (due > 0 && later > 0) note = `${String(later)} more later today`;
  else if (due === 0 && upcoming !== undefined) {
    note = `The next one returns ${formatDue(upcoming, now).toLowerCase()}`;
  } else if (due === 0) note = 'Every word is known';

  return (
    <div className="page">
      <div className="grid">
        <section className="card hero span-6">
          <div>
            <p className="muted">Ready for review</p>
            <div className="hero-count">{plural(due, 'word')}</div>
            {note ? <p className="muted">{note}</p> : null}
          </div>
          {due > 0 ? (
            <a className="button is-primary" href="#/review">
              Start review <Icon paths={ICONS.right} />
            </a>
          ) : null}
        </section>
      </div>
      <dl className="grid stats">
        <div className="card span-2">
          <dt className="muted">Review streak</dt>
          <dd className="stat-value">
            {plural(streakDays(streakLog, now), 'day')}
          </dd>
        </div>
        <div className="card span-2">
          <dt className="muted">Known words</dt>
          <dd className="stat-value">
            {known}
            <span className="muted"> of {words.length} saved</span>
          </dd>
        </div>
        <div className="card span-2">
          <dt className="muted">Reviews, last 7 days</dt>
          <dd className="stat-value">{reviewsLastWeek(log, now)}</dd>
        </div>
      </dl>
      <div className="grid home-recent">
        <section className="card span-6" aria-labelledby="recent-title">
          <div className="card-head list-head">
            <h2 id="recent-title">Recently saved</h2>
            <a className="text-button" href="#/words">
              All words
            </a>
          </div>
          <ul className="list list-rows">
            {recent.map((word) => {
              const stage = stageOf(word);
              return (
                <li key={word.id}>
                  <a
                    className="row-link"
                    href={`#/words?word=${encodeURIComponent(word.id)}`}
                  >
                    <span className="row-word" lang={word.source} dir="auto">
                      {word.lemma}
                    </span>
                    <span className="stage">
                      <span className={`stage-dot is-${stage}`} />
                      {stageLabel(stage)}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
