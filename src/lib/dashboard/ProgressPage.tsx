import type { ReviewEvent, SavedWord } from '../vocabulary/vocabulary';
import { formatInterval } from './format';
import {
  forecast,
  hardWords,
  intervalCounts,
  reviewTrail,
  STAGES,
  stageCounts,
  streakDays,
  trailShade,
  type ForecastDay,
} from './stats';

const FORECAST_DAYS = 7;
const TRAIL_WEEKS = 12;
const HARD_SHOWN = 5;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const words = (count: number) =>
  `${String(count)} ${count === 1 ? 'word' : 'words'}`;

const dateLabel = (day: number) =>
  new Date(day).toLocaleDateString('en', { month: 'short', day: 'numeric' });

function NextSevenDays({ days }: { readonly days: readonly ForecastDay[] }) {
  const peak = Math.max(...days.map((day) => day.count), 1);
  const name = (day: ForecastDay, at: number) =>
    at === 0 ? 'Today' : (WEEKDAYS[new Date(day.day).getDay()] ?? '');
  const detail = (day: ForecastDay, at: number) => {
    const later = day.count - day.dueNow;
    return at === 0 && day.dueNow > 0 && later > 0
      ? `Today: ${String(day.dueNow)} now, ${String(later)} later`
      : `${dateLabel(day.day)}: ${words(day.count)}`;
  };
  return (
    <section className="card span-3" aria-labelledby="forecast-title">
      <div className="card-head">
        <h2 id="forecast-title">Next 7 days</h2>
      </div>
      {days.some((day) => day.count > 0) ? (
        <>
          <div className="forecast" aria-hidden="true">
            {days.map((day, at) => (
              <div
                className={at === 0 ? 'forecast-day is-today' : 'forecast-day'}
                key={day.day}
                title={detail(day, at)}
              >
                <div className="forecast-plot">
                  {day.count > 0 ? (
                    <span
                      style={{
                        height: `${String((day.count / peak) * 76)}%`,
                      }}
                    >
                      <b>{day.count}</b>
                    </span>
                  ) : null}
                </div>
                <span className="forecast-name">{name(day, at)}</span>
              </div>
            ))}
          </div>
          <table className="visually-hidden">
            <caption>Words due each day</caption>
            <tbody>
              {days.map((day, at) => (
                <tr key={day.day}>
                  <th scope="row">{name(day, at)}</th>
                  <td>{detail(day, at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="muted">No words are due in the next 7 days.</p>
      )}
    </section>
  );
}

function ReviewActivity({
  log,
  streakLog,
  now,
}: {
  readonly log: readonly ReviewEvent[];
  readonly streakLog: readonly ReviewEvent[];
  readonly now: number;
}) {
  const days = reviewTrail(log, now, TRAIL_WEEKS);
  const peak = Math.max(...days.map((day) => day?.count ?? 0), 0);
  const streak = streakDays(streakLog, now);
  return (
    <section className="card span-3" aria-labelledby="activity-title">
      <div className="card-head">
        <h2 id="activity-title">Review activity</h2>
        <span className="muted">
          {streak}-day streak · {log.length} reviews
        </span>
      </div>
      <div className="trail" aria-hidden="true">
        {days.map((day, at) =>
          day ? (
            <span
              className={`is-${String(trailShade(day.count, peak))}`}
              key={day.day}
              title={`${dateLabel(day.day)}: ${String(day.count)} reviews`}
            />
          ) : (
            <span className="is-future" key={`future-${String(at)}`} />
          ),
        )}
      </div>
      <div className="trail-legend" aria-hidden="true">
        Less <i />
        <i className="is-1" />
        <i className="is-2" />
        <i className="is-3" />
        <i className="is-4" /> More
      </div>
      <table className="visually-hidden">
        <caption>Days with reviews</caption>
        <tbody>
          {days.flatMap((day) =>
            day && day.count > 0
              ? [
                  <tr key={day.day}>
                    <th scope="row">{dateLabel(day.day)}</th>
                    <td>{day.count}</td>
                  </tr>,
                ]
              : [],
          )}
        </tbody>
      </table>
    </section>
  );
}

export function ProgressPage({
  words: saved,
  log,
  streakLog,
}: {
  readonly words: readonly SavedWord[];
  readonly log: readonly ReviewEvent[];
  /** Every language's reviews, because a streak measures the habit. */
  readonly streakLog: readonly ReviewEvent[];
}) {
  if (saved.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Progress</h1>
        </div>
        <section className="card empty">
          <p className="page-note">
            Save a word from a video to start tracking your progress.
          </p>
        </section>
      </div>
    );
  }
  const now = Date.now();
  const counts = stageCounts(saved);
  const intervals = intervalCounts(saved);
  const peak = Math.max(...intervals.map((item) => item.count), counts.new, 1);
  const hard = hardWords(saved, log, now).slice(0, HARD_SHOWN);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Progress</h1>
      </div>
      <div className="grid">
        <section className="card span-6" aria-labelledby="known-title">
          <div className="muted" id="known-title">
            Words you know
          </div>
          <div className="big-number">
            {counts.known}
            <span className="muted big-number-of"> of {saved.length}</span>
          </div>
          <div className="stage-bar" aria-hidden="true">
            {STAGES.filter(({ id }) => counts[id] > 0).map(({ id }) => (
              <span
                className={`is-${id}`}
                key={id}
                style={{ flex: counts[id] }}
              />
            ))}
          </div>
          <div className="stage-links">
            {STAGES.map(({ id, label }) => (
              <a className="text-button" href={`#/words?stage=${id}`} key={id}>
                <span className="stage">
                  <span className={`stage-dot is-${id}`} />
                  {label} · {counts[id]}
                </span>
              </a>
            ))}
          </div>
        </section>
        <section className="card span-3" aria-labelledby="intervals-title">
          <div className="card-head">
            <h2 id="intervals-title">Review intervals</h2>
          </div>
          <div className="ladder">
            <span>New</span>
            <span className="ladder-track">
              <span
                className="is-new"
                style={{ width: `${String((counts.new / peak) * 100)}%` }}
              />
            </span>
            <span className="ladder-count">{counts.new}</span>
            {intervals.flatMap(({ seconds, count, stage }) => [
              <span key={`${String(seconds)}-label`}>
                {formatInterval(seconds)}
              </span>,
              <span className="ladder-track" key={`${String(seconds)}-track`}>
                <span
                  className={`is-${stage}`}
                  style={{ width: `${String((count / peak) * 100)}%` }}
                />
              </span>,
              <span className="ladder-count" key={`${String(seconds)}-count`}>
                {count}
              </span>,
            ])}
          </div>
          <p className="muted interval-note">
            How long each word waits between reviews. See Next 7 days for actual
            dates.
          </p>
        </section>
        <NextSevenDays days={forecast(saved, now, FORECAST_DAYS)} />
        <ReviewActivity log={log} streakLog={streakLog} now={now} />
        <section className="card span-3" aria-labelledby="hard-title">
          <div className="card-head list-head">
            <div>
              <h2 id="hard-title">Hard words</h2>
              <p className="muted">Forgotten most in the last 30 days</p>
            </div>
          </div>
          {hard.length === 0 ? (
            <p className="muted hard-empty">No hard words right now.</p>
          ) : (
            <ul className="list list-rows">
              {hard.map(({ word, forgets }) => (
                <li key={word.id}>
                  <a
                    className="row-link"
                    href={`#/words?word=${encodeURIComponent(word.id)}`}
                  >
                    <span className="row-word" lang={word.source} dir="auto">
                      {word.lemma}
                    </span>
                    <span className="forget-count">Forgot {forgets}×</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
