import { element, icon, iconButton, ICON_ALERT, ICON_CLOSE } from './dom';

export interface TrackNoticeOptions {
  /** Where the notice goes; `null` when the player is not available. */
  readonly layer: () => HTMLElement | null;
}

export interface TrackNotice {
  /** Says the video has no subtitles, replacing any earlier notice. */
  show: () => void;
  close: () => void;
  isOpen: () => boolean;
}

const SHOWN_MS = 8_000;

/**
 * Says why nothing shows on a video without any captions, so the user is not left
 * wondering whether the extension broke.
 */
export function createTrackNotice(options: TrackNoticeOptions): TrackNotice {
  let notice: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = () => {
    clearTimeout(timer);
    notice?.remove();
    notice = null;
  };

  const startTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(close, SHOWN_MS);
  };

  return {
    show() {
      close();
      const layer = options.layer();
      if (!layer) return;
      const current = element(
        'div',
        'panel player-toast track-notice',
        element(
          'p',
          'player-toast-note',
          icon(ICON_ALERT),
          element('span', '', 'This video has no subtitles'),
        ),
        iconButton('close', 'Close', ICON_CLOSE, close),
      );
      current.dataset.theme = 'dark';
      current.setAttribute('role', 'status');
      current.addEventListener('mouseenter', () => {
        clearTimeout(timer);
      });
      current.addEventListener('mouseleave', startTimer);
      current.addEventListener('focusin', () => {
        clearTimeout(timer);
      });
      notice = current;
      layer.append(current);
      startTimer();
    },
    close,
    isOpen: () => notice !== null,
  };
}
