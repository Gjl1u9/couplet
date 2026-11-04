import type { SubtitleView } from './controller';

const HOST_ID = 'dual-subtitles-overlay';
const HIDE_NATIVE_ID = 'dual-subtitles-hide-native';

const STYLE = `
  :host {
    position: absolute;
    inset: 0;
    z-index: 45;
    pointer-events: none;
    contain: layout style;
    container-type: inline-size;
  }
  .box {
    position: absolute;
    left: 50%;
    bottom: 6%;
    transform: translateX(-50%);
    max-width: 86%;
    width: max-content;
    padding: 0.35em 0.8em;
    border-radius: 8px;
    background: rgba(8, 8, 8, 0.75);
    text-align: center;
    font-family: "YouTube Noto", Roboto, Arial, "PingFang TC", "Noto Sans TC", sans-serif;
    line-height: 1.3;
    transition: bottom 0.15s;
  }
  :host-context(#movie_player:not(.ytp-autohide)) .box { bottom: 14%; }
  .original { color: #fff; font-size: clamp(14px, 2.4cqw, 34px); }
  .translation { color: #d4d4d4; font-size: clamp(13px, 2.1cqw, 30px); margin-top: 0.15em; }
  [hidden] { display: none; }
`;

export interface Overlay {
  render: (view: SubtitleView | null) => void;
  setNativeCaptionsHidden: (hidden: boolean) => void;
  dispose: () => void;
}

export function createOverlay(): Overlay {
  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;
  const box = document.createElement('div');
  box.className = 'box';
  box.hidden = true;
  const original = document.createElement('div');
  original.className = 'original';
  const translation = document.createElement('div');
  translation.className = 'translation';
  box.append(original, translation);
  shadow.append(style, box);

  const nativeStyle = document.createElement('style');
  nativeStyle.id = HIDE_NATIVE_ID;
  nativeStyle.textContent =
    '#movie_player .ytp-caption-window-container { display: none !important; }';

  return {
    render(view) {
      if (!view) {
        box.hidden = true;
        return;
      }
      const player = document.querySelector('#movie_player');
      if (player && host.parentElement !== player) player.append(host);
      original.textContent = view.original;
      translation.textContent = view.translation ?? '';
      translation.hidden = view.translation === null;
      box.hidden = false;
    },
    setNativeCaptionsHidden(hidden) {
      if (hidden) document.documentElement.append(nativeStyle);
      else nativeStyle.remove();
    },
    dispose() {
      host.remove();
      nativeStyle.remove();
    },
  };
}
