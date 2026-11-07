import type { Grade } from '../vocabulary/schedule';
import type { SavedWord } from '../vocabulary/vocabulary';

/** How to take back one step of the session. */
export interface UndoStep {
  readonly word: SavedWord;
  /** The log entry to remove; a retirement has none. */
  readonly eventAt: number | null;
  /** The schedule this step wrote. Undo is refused once another device moves past it. */
  readonly stamp: string | null;
}

export type SessionOutcome = Grade | 'retired';

export interface SessionState {
  readonly queue: readonly SavedWord[];
  readonly index: number;
  readonly outcomes: readonly SessionOutcome[];
  readonly undo: readonly UndoStep[];
}

export type SessionAction =
  | {
      readonly type: 'answered';
      readonly outcome: SessionOutcome;
      readonly step: UndoStep;
    }
  | { readonly type: 'deleted' }
  | { readonly type: 'undone' }
  | { readonly type: 'undo-refused' }
  | { readonly type: 'due'; readonly words: readonly SavedWord[] };

export const startSession = (queue: readonly SavedWord[]): SessionState => ({
  queue,
  index: 0,
  outcomes: [],
  undo: [],
});

export function reduceSession(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'answered':
      return {
        ...state,
        index: state.index + 1,
        outcomes: [...state.outcomes, action.outcome],
        undo: [...state.undo, action.step],
      };
    case 'deleted':
      // A deleted word cannot come back, so the steps before it stop being safe to undo.
      return {
        ...state,
        queue: state.queue.filter((_, at) => at !== state.index),
        undo: [],
      };
    case 'undo-refused':
      return { ...state, undo: state.undo.slice(0, -1) };
    case 'undone': {
      const last = state.undo.at(-1);
      if (!last) return state;
      const index = state.index - 1;
      return {
        ...state,
        index,
        // A forgotten word may have rejoined the queue since.
        queue: state.queue.filter(
          (word, at) => at <= index || word.id !== last.word.id,
        ),
        outcomes: state.outcomes.slice(0, -1),
        undo: state.undo.slice(0, -1),
      };
    }
    case 'due': {
      const waiting = new Set(
        state.queue.slice(state.index).map((word) => word.id),
      );
      const added = action.words.filter((word) => !waiting.has(word.id));
      return added.length > 0
        ? { ...state, queue: [...state.queue, ...added] }
        : state;
    }
  }
}
