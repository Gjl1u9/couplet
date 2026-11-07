import { LADDER_SECONDS, type ReviewState } from '../vocabulary/schedule';
import { formatInterval, formatIntervalAdjective } from './format';

const STEPS = LADDER_SECONDS.map(formatInterval).join(' → ');

function intervalLabel(review: ReviewState): string {
  if (review.retired) return 'Not scheduled';
  if (review.reviewCount === 0) return 'New word';
  const seconds = LADDER_SECONDS[review.level] ?? 0;
  return `${formatIntervalAdjective(seconds)} interval`;
}

/** How far a word has come on the schedule. It holds no answer, so it is always shown. */
export function LevelTrack({ review }: { readonly review: ReviewState }) {
  const reached = review.reviewCount === 0 ? 0 : review.level + 1;
  const label = intervalLabel(review);
  return (
    <span
      className="level"
      role="img"
      aria-label={`Level ${String(reached)} of ${String(LADDER_SECONDS.length)}. ${label}`}
      title={STEPS}
    >
      <span className="level-dots">
        {LADDER_SECONDS.map((seconds, at) => (
          <span className={at < reached ? 'is-on' : ''} key={seconds} />
        ))}
      </span>
      {label}
    </span>
  );
}
