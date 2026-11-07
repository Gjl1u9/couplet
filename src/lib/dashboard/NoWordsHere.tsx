import type { LanguageSummary } from './stats';

/** Stands in for a page when this language has no words but another one does. */
export function NoWordsHere({
  language,
  other,
  onSwitch,
}: {
  readonly language: string;
  readonly other: LanguageSummary;
  readonly onSwitch: () => void;
}) {
  return (
    <div className="page">
      <section className="card hero">
        <div>
          <h1>No {language} words yet</h1>
          <p className="muted">
            Your {other.words} {other.name}{' '}
            {other.words === 1 ? 'word is' : 'words are'} still here. Words you
            save from {language} videos will appear in this list.
          </p>
        </div>
        <button className="button is-primary" type="button" onClick={onSwitch}>
          Switch to {other.name}
        </button>
      </section>
    </div>
  );
}
