import { splitMeaning } from '../lookup/entry';
import type { PanelTheme } from '../settings/settings';
import type { Sense, WordEntry, WordInCue } from '../lookup/types';
import {
  element,
  icon,
  iconButton,
  meaningChip,
  ICON_ALERT,
  ICON_SPEAK,
  ICON_STAR,
  watchDismiss,
} from './dom';
import { lookupFailure } from '../lookup/proxy';
import type { Speaker } from './speech';

export interface LookupPanelOptions {
  /** Where panels go; `null` when the player is not available. */
  readonly layer: () => HTMLElement | null;
  readonly lookUp: (word: string) => Promise<WordEntry | null>;
  /** Resolves to `null` when the text is already in the target language. */
  readonly translateSelection: (text: string) => Promise<string | null>;
  readonly isSaved: (entry: WordEntry) => Promise<boolean>;
  /** Rejecting tells the panel to show the previous state again. */
  readonly setSaved: (
    entry: WordEntry,
    cue: WordInCue,
    saved: boolean,
  ) => Promise<void>;
  readonly sourceLanguage: () => string;
  readonly theme: () => PanelTheme;
  readonly speaker: Speaker;
  /** Resolves false to leave the word unsaved, such as when sign-in is declined. */
  readonly beforeSave?: () => Promise<boolean>;
  /** Clicks here leave the panel open, such as on the sign-in toast. */
  readonly keepsOpen?: (path: readonly EventTarget[]) => boolean;
  readonly onSaved?: () => void;
  /** The word is already saved and was opened again, perhaps in a new sentence. */
  readonly onSeenAgain?: (entry: WordEntry, cue: WordInCue) => void;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}

export interface LookupPanel {
  /** Opens for this token, or closes when it is already showing it. */
  toggle: (cue: WordInCue, anchor: HTMLElement) => void;
  /** Shows the translation of text the user selected across tokens. */
  showSelection: (text: string, anchor: HTMLElement) => void;
  close: () => void;
  isOpen: () => boolean;
}

/** Also used by the Review Card's dictionary, so both look the same. */
export function senseRow({
  meaning,
  example,
  translation,
}: Sense): HTMLElement {
  const row = element('div', 'lookup-sense');
  const parts = [
    element('div', 'lookup-meaning', ...splitMeaning(meaning).map(meaningChip)),
    element('div', 'couplet-original', example),
    element('div', 'couplet-translation', translation),
  ];
  for (const part of parts) part.dir = 'auto';
  row.append(...parts);
  return row;
}

const EDGE_GAP_PX = 16;
const LEADER_PX = 14;

export function createLookupPanel(options: LookupPanelOptions): LookupPanel {
  let panel: HTMLElement | null = null;
  let anchor: HTMLElement | null = null;
  /** Identifies the newest lookup, so late answers for older words are dropped. */
  let generation = 0;
  let stopWatching: (() => void) | null = null;

  const releaseAnchor = () => {
    anchor?.classList.remove('is-panel-below');
    anchor?.style.removeProperty('--leader');
  };

  /** Stays clear of the whole subtitle, and opens below it when it sits near the top. */
  const place = () => {
    const layer = panel?.parentElement;
    if (!panel || !layer || !anchor) return;
    panel.style.removeProperty('max-height');
    const area = layer.getBoundingClientRect();
    const token = anchor.getBoundingClientRect();
    const strip = (anchor.closest('.strip') ?? anchor).getBoundingClientRect();
    const width = panel.offsetWidth;
    const center = token.left + token.width / 2 - area.left;
    const maxLeft = area.width - width - EDGE_GAP_PX;
    const left = Math.max(EDGE_GAP_PX, Math.min(center - width / 2, maxLeft));
    const above = strip.top - area.top - LEADER_PX - EDGE_GAP_PX;
    const below = area.bottom - strip.bottom - LEADER_PX - EDGE_GAP_PX;
    const opensBelow = panel.offsetHeight > above && below > above;
    panel.style.left = `${String(left)}px`;
    anchor.classList.toggle('is-panel-below', opensBelow);
    anchor.style.setProperty(
      '--leader',
      `${String(token.top - strip.top + LEADER_PX)}px`,
    );
    if (opensBelow) {
      panel.style.removeProperty('bottom');
      panel.style.top = `${String(strip.bottom - area.top + LEADER_PX)}px`;
    } else {
      panel.style.removeProperty('top');
      panel.style.bottom = `${String(area.bottom - strip.top + LEADER_PX)}px`;
    }
    // In a small player, a long entry scrolls instead of leaving the player.
    panel.style.maxHeight = `${String(opensBelow ? below : above)}px`;
  };

  const close = (byKeyboard = false) => {
    if (!panel) return;
    generation += 1;
    options.speaker.stop();
    stopWatching?.();
    stopWatching = null;
    panel.remove();
    panel = null;
    releaseAnchor();
    const previous = anchor;
    anchor = null;
    options.onClose();
    if (byKeyboard && previous?.isConnected) previous.focus();
  };

  const saveButton = (cue: WordInCue, entry: WordEntry) => {
    let saved = false;
    const show = (next: boolean) => {
      saved = next;
      button.classList.toggle('is-saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute(
        'aria-label',
        saved ? 'Remove from saved words' : 'Save word',
      );
    };
    const apply = (next: boolean) => {
      show(next);
      if (next) options.onSaved?.();
      options.setSaved(entry, cue, next).catch(() => {
        if (saved === next) show(!next);
      });
    };
    let asking = false;
    const button = iconButton('save', 'Save word', ICON_STAR, () => {
      const next = !saved;
      if (!next || !options.beforeSave) {
        apply(next);
        return;
      }
      if (asking) return;
      asking = true;
      options.beforeSave().then(
        (allowed) => {
          asking = false;
          if (allowed) apply(true);
        },
        () => {
          asking = false;
        },
      );
    });
    show(false);
    options.isSaved(entry).then(
      (isSaved) => {
        show(isSaved);
        if (isSaved) options.onSeenAgain?.(entry, cue);
      },
      () => undefined,
    );
    return button;
  };

  const load = (cue: WordInCue) => {
    if (!panel) return;
    generation += 1;
    const current = generation;
    const isCurrent = () => current === generation;

    /** The play button follows the heading, which becomes the lemma. */
    let spoken = cue.word;
    const word = element('span', 'lookup-word', cue.word);
    word.dir = 'auto';
    const phonetic = element('span', 'phonetic');
    phonetic.hidden = true;
    const speak = iconButton('speak', 'Play pronunciation', ICON_SPEAK, () => {
      speak.classList.add('is-playing');
      options.speaker.speak(spoken, options.sourceLanguage(), () => {
        speak.classList.remove('is-playing');
      });
    });
    const senses = element(
      'div',
      'lookup-senses',
      element('div', 'skeleton lookup-skeleton'),
      element('div', 'skeleton lookup-skeleton is-long'),
    );
    panel.setAttribute('aria-label', cue.word);
    panel.replaceChildren(
      element(
        'div',
        'lookup-head',
        element('div', 'lookup-title', word, phonetic),
        element('div', 'lookup-actions', speak),
      ),
      senses,
    );
    place();

    options.lookUp(cue.word).then(
      (entry) => {
        if (!isCurrent()) return;
        if (entry) {
          spoken = entry.lemma;
          word.textContent = entry.lemma;
          phonetic.textContent = entry.phonetic;
          phonetic.hidden = !entry.phonetic;
          speak.before(saveButton(cue, entry));
        }
        senses.hidden = !entry;
        senses.replaceChildren(...(entry?.senses.map(senseRow) ?? []));
        place();
      },
      (error: unknown) => {
        if (!isCurrent()) return;
        const failure = lookupFailure(error);
        const retry = element('button', 'text-button', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', () => {
          load(cue);
        });
        senses.replaceChildren(
          element(
            'div',
            'alert',
            icon(ICON_ALERT),
            element('span', '', failure.text),
          ),
          ...(failure.canRetry ? [retry] : []),
        );
        place();
      },
    );
  };

  const loadSelection = (text: string) => {
    if (!panel) return;
    generation += 1;
    const current = generation;
    const heading = element('span', 'lookup-phrase', text);
    heading.dir = 'auto';
    const speak = iconButton('speak', 'Play pronunciation', ICON_SPEAK, () => {
      speak.classList.add('is-playing');
      options.speaker.speak(text, options.sourceLanguage(), () => {
        speak.classList.remove('is-playing');
      });
    });
    const body = element(
      'div',
      'lookup-senses',
      element('div', 'skeleton lookup-skeleton is-long'),
    );
    panel.setAttribute('aria-label', text);
    panel.replaceChildren(
      element(
        'div',
        'lookup-head',
        element('div', 'lookup-title', heading),
        element('div', 'lookup-actions', speak),
      ),
      body,
    );
    place();

    options.translateSelection(text).then(
      (translation) => {
        if (current !== generation) return;
        body.hidden = translation === null;
        body.replaceChildren(
          ...(translation === null
            ? []
            : [element('div', 'lookup-meaning', meaningChip(translation))]),
        );
        place();
      },
      () => {
        if (current !== generation) return;
        const retry = element('button', 'text-button', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', () => {
          loadSelection(text);
        });
        body.replaceChildren(
          element(
            'div',
            'alert',
            icon(ICON_ALERT),
            element('span', '', "Couldn't reach the translator"),
          ),
          retry,
        );
        place();
      },
    );
  };

  const show = (nextAnchor: HTMLElement, draw: () => void) => {
    const layer = options.layer();
    if (!layer) return;
    const opening = panel === null;
    releaseAnchor();
    anchor = nextAnchor;
    if (!panel) {
      panel = element('div', 'panel lookup-panel');
      panel.dataset.theme = options.theme();
      panel.tabIndex = -1;
      panel.setAttribute('role', 'dialog');
      layer.append(panel);
      const current = panel;
      stopWatching = watchDismiss(
        (path) =>
          path.includes(current) ||
          options.keepsOpen?.(path) === true ||
          path.some(
            (target) =>
              target instanceof Element && target.classList.contains('token'),
          ),
        (byKeyboard) => {
          close(byKeyboard);
        },
      );
    }
    options.speaker.stop();
    draw();
    if (opening) {
      panel.focus({ preventScroll: true });
      options.onOpen();
    }
  };

  return {
    toggle(cue, nextAnchor) {
      if (panel && anchor === nextAnchor) {
        close();
        return;
      }
      show(nextAnchor, () => {
        load(cue);
      });
    },
    showSelection(text, nextAnchor) {
      show(nextAnchor, () => {
        loadSelection(text);
      });
    },
    close: () => {
      close();
    },
    isOpen: () => panel !== null,
  };
}
