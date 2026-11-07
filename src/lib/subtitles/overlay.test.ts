// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampPosition, createOverlay } from './overlay';

const host = () =>
  document.querySelector<HTMLElement>('#dual-subtitles-overlay');
const box = () => host()?.shadowRoot?.querySelector<HTMLElement>('.box');
const part = (name: string) =>
  host()?.shadowRoot?.querySelector<HTMLElement>(`.${name}`);
const nativeHidden = () =>
  document.querySelector('#dual-subtitles-hide-native') !== null;

beforeEach(() => {
  document.body.innerHTML = '<div id="movie_player"></div>';
});

afterEach(() => {
  document.body.innerHTML = '';
  document.querySelector('#dual-subtitles-hide-native')?.remove();
});

describe('marks on Saved Words', () => {
  const marked = () =>
    [...(host()?.shadowRoot?.querySelectorAll('.token.is-marked') ?? [])].map(
      (token) => token.textContent,
    );

  it('marks matching tokens and updates after the Vocabulary changes', () => {
    let saved = new Set(['bank']);
    const overlay = createOverlay({
      isMarked: (token) => saved.has(token),
    });
    overlay.render({ original: 'the bank river', translation: null });
    expect(marked()).toEqual(['bank']);
    saved = new Set(['river']);
    overlay.refreshMarks();
    expect(marked()).toEqual(['river']);
  });
});

describe('createOverlay', () => {
  it('有字幕時才掛到播放器上，顯示原文和譯文', () => {
    const overlay = createOverlay();
    expect(host()).toBeNull();

    overlay.render({ original: 'hello', translation: '你好' });
    expect(host()?.parentElement?.id).toBe('movie_player');
    expect(box()?.hidden).toBe(false);
    expect(part('original')?.textContent).toBe('hello');
    expect(part('translation')?.textContent).toBe('你好');
    expect(part('translation')?.hidden).toBe(false);
  });

  it('還沒有譯文時只顯示原文，不留空行', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'hello', translation: null });
    expect(part('translation')?.hidden).toBe(true);
  });

  it('譯文之後補上時會顯示', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'hello', translation: null });
    overlay.render({ original: 'hello', translation: '你好' });
    expect(part('translation')?.hidden).toBe(false);
    expect(part('translation')?.textContent).toBe('你好');
  });

  it('render(null) 隱藏字幕，但不移除元素', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'hello', translation: null });
    overlay.render(null);
    expect(box()?.hidden).toBe(true);
    expect(host()).not.toBeNull();
  });

  it('多次 render 只有一層', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'a', translation: null });
    overlay.render({ original: 'b', translation: null });
    expect(document.querySelectorAll('#dual-subtitles-overlay')).toHaveLength(
      1,
    );
  });

  it('元素被移除後，下一句會重新掛上', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'a', translation: null });
    host()?.remove();
    overlay.render({ original: 'b', translation: null });
    expect(host()?.parentElement?.id).toBe('movie_player');
  });

  it('播放器換掉時會掛到新的播放器', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'a', translation: null });
    const old = document.querySelector('#movie_player');
    document.body.innerHTML = '<div id="movie_player"></div>';
    overlay.render({ original: 'b', translation: null });
    expect(host()?.parentElement).not.toBe(old);
    expect(host()?.parentElement?.id).toBe('movie_player');
  });

  it('字幕內容不會被當成 HTML', () => {
    const overlay = createOverlay();
    overlay.render({
      original: '<img src=x onerror=alert(1)>',
      translation: '<b>粗體</b>',
    });
    expect(part('original')?.querySelector('img')).toBeNull();
    expect(part('original')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(part('translation')?.querySelector('b')).toBeNull();
  });

  it('播放器還不存在時不會出錯', () => {
    document.body.innerHTML = '';
    const overlay = createOverlay();
    expect(() => {
      overlay.render({ original: 'a', translation: null });
    }).not.toThrow();
  });

  it('可以隱藏和恢復原生字幕，重複呼叫也只有一份樣式', () => {
    const overlay = createOverlay();
    overlay.setNativeCaptionsHidden(true);
    overlay.setNativeCaptionsHidden(true);
    expect(nativeHidden()).toBe(true);
    expect(
      document.querySelectorAll('#dual-subtitles-hide-native'),
    ).toHaveLength(1);
    overlay.setNativeCaptionsHidden(false);
    expect(nativeHidden()).toBe(false);
  });

  it('dispose 移除所有東西，把字幕交還給 YouTube', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'a', translation: null });
    overlay.setNativeCaptionsHidden(true);
    overlay.dispose();
    expect(host()).toBeNull();
    expect(nativeHidden()).toBe(false);
  });

  describe('tokens', () => {
    const tokens = () => [
      ...(part('original')?.querySelectorAll<HTMLElement>('.token') ?? []),
    ];

    it('makes words clickable and keeps the text intact', () => {
      const onToken = vi.fn();
      const overlay = createOverlay({ onToken });
      overlay.render({
        original: 'The Navier-Stokes move.',
        translation: null,
      });
      expect(part('original')?.textContent).toBe('The Navier-Stokes move.');
      expect(tokens().map((t) => t.textContent)).toEqual([
        'The',
        'Navier-Stokes',
        'move',
      ]);
      tokens()[1]?.click();
      expect(onToken).toHaveBeenCalledWith(
        {
          word: 'Navier-Stokes',
          sentence: 'The Navier-Stokes move.',
          offset: 4,
        },
        tokens()[1],
      );
    });

    it('gives each repeated word its own offset', () => {
      const onToken = vi.fn();
      const overlay = createOverlay({ onToken });
      overlay.render({ original: 'run and run', translation: null });
      tokens()[2]?.click();
      expect(onToken.mock.calls[0]?.[0]).toMatchObject({ offset: 8 });
    });

    it('keeps keyboard shortcuts on a focused token from reaching the player', () => {
      const overlay = createOverlay();
      overlay.render({ original: 'hello', translation: null });
      const onPlayerKey = vi.fn();
      document
        .querySelector('#movie_player')
        ?.addEventListener('keydown', onPlayerKey);
      tokens()[0]?.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      );
      expect(onPlayerKey).not.toHaveBeenCalled();
    });

    it('stops a token click from reaching the player', () => {
      const overlay = createOverlay();
      overlay.render({ original: 'hello', translation: null });
      const onPlayerClick = vi.fn();
      document
        .querySelector('#movie_player')
        ?.addEventListener('click', onPlayerClick);
      tokens()[0]?.click();
      expect(onPlayerClick).not.toHaveBeenCalled();
    });

    it('keeps the selected token when only the translation arrives', () => {
      const overlay = createOverlay();
      overlay.render({ original: 'hello', translation: null });
      const token = tokens()[0] ?? null;
      overlay.selectToken(token);
      overlay.render({ original: 'hello', translation: '你好' });
      expect(tokens()[0]).toBe(token);
      expect(token?.classList.contains('is-selected')).toBe(true);
      expect(box()?.classList.contains('is-raised')).toBe(true);
      overlay.selectToken(null);
      expect(token?.classList.contains('is-selected')).toBe(false);
      expect(box()?.classList.contains('is-raised')).toBe(false);
    });
  });

  it('shows a skeleton while a translation is on its way', () => {
    const overlay = createOverlay({ expectsTranslation: () => true });
    overlay.render({ original: 'hello', translation: null });
    expect(part('translation')?.hidden).toBe(false);
    expect(part('translation')?.classList.contains('is-loading')).toBe(true);
    overlay.render({ original: 'hello', translation: '你好' });
    expect(part('translation')?.classList.contains('is-loading')).toBe(false);
  });

  it('applies display settings, including to the current subtitle', () => {
    const overlay = createOverlay();
    overlay.render({ original: 'hello', translation: '你好' });
    overlay.setDisplay({ showTranslation: false, subtitleSize: 'large' });
    expect(part('translation')?.hidden).toBe(true);
    expect(host()?.style.getPropertyValue('--subtitle-scale')).toBe('0.96');
    overlay.setDisplay({ showTranslation: true, subtitleSize: 'medium' });
    expect(part('translation')?.hidden).toBe(false);
  });

  it('attaches to the player when panels need a layer', () => {
    const overlay = createOverlay();
    expect(overlay.panelLayer()?.className).toBe('panels');
    expect(host()?.parentElement?.id).toBe('movie_player');
    document.body.innerHTML = '';
    expect(overlay.panelLayer()).toBeNull();
  });

  describe('neighbouring cues', () => {
    const lines = () => ({
      previous: part('context-previous'),
      next: part('context-next'),
    });
    const VIEW = {
      original: 'current line',
      translation: '目前',
      previous: 'earlier line',
      next: 'later line',
    };

    it('stays hidden until asked for, then shows both sides', () => {
      const overlay = createOverlay();
      overlay.render(VIEW);
      expect(lines().previous?.hidden).toBe(true);
      expect(lines().next?.hidden).toBe(true);
      overlay.setContextVisible(true);
      expect(lines().previous?.textContent).toBe('earlier line');
      expect(lines().next?.textContent).toBe('later line');
      expect(lines().previous?.hidden).toBe(false);
      overlay.setContextVisible(false);
      expect(lines().next?.hidden).toBe(true);
    });

    it('asks for the opposite state from the button', () => {
      const onContextToggle = vi.fn();
      const overlay = createOverlay({ onContextToggle });
      overlay.render(VIEW);
      const toggle = part('context-toggle');
      expect(toggle?.getAttribute('aria-pressed')).toBe('false');
      expect(toggle?.getAttribute('aria-label')).toBe('Show nearby lines');
      toggle?.click();
      expect(onContextToggle).toHaveBeenCalledWith(true);
      expect(lines().next?.hidden).toBe(true);

      overlay.setContextVisible(true);
      expect(toggle?.getAttribute('aria-pressed')).toBe('true');
      expect(toggle?.getAttribute('aria-label')).toBe('Hide nearby lines');
      toggle?.click();
      expect(onContextToggle).toHaveBeenLastCalledWith(false);
    });

    it('hides the side with no cue', () => {
      const overlay = createOverlay();
      overlay.setContextVisible(true);
      overlay.render({ ...VIEW, previous: null });
      expect(lines().previous?.hidden).toBe(true);
      expect(lines().next?.hidden).toBe(false);
    });

    it('lets a neighbouring word open with its own sentence', () => {
      const onToken = vi.fn();
      const overlay = createOverlay({ onToken });
      overlay.setContextVisible(true);
      overlay.render(VIEW);
      lines().next?.querySelector<HTMLElement>('.token')?.click();
      expect(onToken.mock.calls[0]?.[0]).toMatchObject({
        word: 'later',
        sentence: 'later line',
      });
    });
  });

  describe('selecting by dragging', () => {
    afterEach(() => {
      // Ends the short window in which a finished drag swallows its click.
      window.dispatchEvent(new MouseEvent('click'));
    });

    const strip = () => part('strip');
    const tokens = () => [
      ...(strip()?.querySelectorAll<HTMLElement>('.token') ?? []),
    ];
    const pointer = (type: string, target: EventTarget | null | undefined) => {
      target?.dispatchEvent(
        new MouseEvent(type, { bubbles: true, composed: true, button: 0 }),
      );
    };

    /** happy-dom has no layout, so the word under the pointer is set directly. */
    const drag = (from: number, ...overs: number[]) => {
      const root = host()?.shadowRoot;
      if (!root) throw new Error('missing root');
      const start = tokens()[from];
      if (!start) throw new Error('missing token');
      start.setPointerCapture = vi.fn();
      pointer('pointerdown', start);
      for (const over of overs) {
        root.elementFromPoint = () => tokens()[over] ?? null;
        pointer('pointermove', start);
      }
      return start;
    };

    function setupDrag() {
      const onToken = vi.fn();
      const onSelection = vi.fn();
      const onSelectionStart = vi.fn();
      const onSelectionCancel = vi.fn();
      const overlay = createOverlay({
        onToken,
        onSelection,
        onSelectionStart,
        onSelectionCancel,
      });
      overlay.render({
        original: 'we need to get rid of it',
        translation: null,
      });
      return {
        overlay,
        onToken,
        onSelection,
        onSelectionStart,
        onSelectionCancel,
      };
    }

    it('selects the words between the two ends, in reading order', () => {
      const { onSelection, onSelectionStart } = setupDrag();
      const start = drag(5, 4, 3);
      expect(onSelectionStart).toHaveBeenCalledTimes(1);
      expect(
        tokens().filter((t) => t.classList.contains('is-in-range')),
      ).toHaveLength(3);
      pointer('pointerup', start);
      expect(onSelection).toHaveBeenCalledWith(
        { text: 'get rid of', sentence: 'we need to get rid of it' },
        tokens()[4],
      );
    });

    it('stays a plain click when the pointer never reaches another word', () => {
      const { onSelection, onSelectionStart, onToken } = setupDrag();
      const start = drag(2, 2);
      pointer('pointerup', start);
      start.click();
      expect(onSelectionStart).not.toHaveBeenCalled();
      expect(onSelection).not.toHaveBeenCalled();
      expect(onToken).toHaveBeenCalledTimes(1);
    });

    it('cancels when the drag returns to its first word', () => {
      const { onSelection, onSelectionCancel } = setupDrag();
      const start = drag(2, 3, 2);
      pointer('pointerup', start);
      expect(onSelection).not.toHaveBeenCalled();
      expect(onSelectionCancel).toHaveBeenCalledTimes(1);
      expect(tokens().some((t) => t.classList.contains('is-in-range'))).toBe(
        false,
      );
    });

    it('swallows the click that ends a drag', () => {
      const { onToken } = setupDrag();
      const start = drag(0, 1);
      pointer('pointerup', start);
      const onPlayerClick = vi.fn();
      document.body.addEventListener('click', onPlayerClick);
      document.querySelector<HTMLElement>('#movie_player')?.click();
      expect(onPlayerClick).not.toHaveBeenCalled();
      expect(onToken).not.toHaveBeenCalled();
      document.body.removeEventListener('click', onPlayerClick);
    });

    it('crosses into a neighbouring cue', () => {
      const onSelection = vi.fn();
      const overlay = createOverlay({ onSelection });
      overlay.setContextVisible(true);
      overlay.render({
        original: 'rid of it',
        translation: null,
        previous: 'we should get',
        next: null,
      });
      const start = drag(2, 3, 4);
      pointer('pointerup', start);
      expect(onSelection.mock.calls[0]?.[0]).toEqual({
        text: 'get rid of',
        sentence: 'we should get rid of it',
      });
    });

    it('clears the selection when the panel closes', () => {
      const { overlay } = setupDrag();
      const start = drag(0, 1);
      pointer('pointerup', start);
      overlay.selectToken(null);
      expect(tokens().some((t) => t.classList.contains('is-in-range'))).toBe(
        false,
      );
    });
  });

  describe('moving the subtitle', () => {
    const grip = () => part('grip');
    const prepare = (grabbed: HTMLElement | null | undefined) => {
      if (grabbed) grabbed.setPointerCapture = vi.fn();
    };
    const AREA = {
      left: 0,
      top: 0,
      right: 1000,
      bottom: 500,
      width: 1000,
      height: 500,
    } as DOMRect;
    const dragGrip = (dx: number, dy: number) => {
      const handle = grip();
      prepare(handle);
      const at = (x: number, y: number) => ({
        bubbles: true,
        composed: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      handle?.dispatchEvent(new MouseEvent('pointerdown', at(100, 100)));
      handle?.dispatchEvent(
        new MouseEvent('pointermove', at(100 + dx, 100 + dy)),
      );
      handle?.dispatchEvent(
        new MouseEvent('pointerup', at(100 + dx, 100 + dy)),
      );
    };
    const start = (options: Parameters<typeof createOverlay>[0]) => {
      const overlay = createOverlay(options);
      overlay.render({ original: 'hello', translation: null });
      const shell = host();
      if (shell) shell.getBoundingClientRect = () => AREA;
      const subtitle = box();
      if (subtitle) {
        subtitle.getBoundingClientRect = () =>
          ({
            left: 70,
            right: 930,
            width: 860,
            bottom: 470,
            height: 50,
          }) as DOMRect;
      }
      return overlay;
    };

    it('reports the new place as fractions of the player', () => {
      const onMove = vi.fn();
      const onMoveStart = vi.fn();
      start({ onMove, onMoveStart });
      dragGrip(100, -50);
      expect(onMoveStart).toHaveBeenCalledTimes(1);
      const position = onMove.mock.calls[0]?.[0] as { x: number; y: number };
      expect(position.x).toBeCloseTo(0.6);
      expect(position.y).toBeCloseTo(0.16);
      expect(box()?.classList.contains('is-placed')).toBe(true);
      expect(box()?.classList.contains('is-moving')).toBe(false);
    });

    it('swallows the click that ends a move, so the video keeps its state', () => {
      start({});
      dragGrip(100, -50);
      const onPlayerClick = vi.fn();
      document.body.addEventListener('click', onPlayerClick);
      document.querySelector<HTMLElement>('#movie_player')?.click();
      expect(onPlayerClick).not.toHaveBeenCalled();
      document.body.removeEventListener('click', onPlayerClick);
    });

    it('keeps a tall strip inside the player without changing the saved place', () => {
      const onMove = vi.fn();
      const overlay = start({ onMove });
      overlay.setDisplay({
        showTranslation: true,
        subtitleSize: 'medium',
        subtitlePosition: { x: 0.5, y: 0.95 },
      });
      expect(
        parseFloat(box()?.style.getPropertyValue('--place-bottom') ?? ''),
      ).toBeCloseTo(88);
      expect(onMove).not.toHaveBeenCalled();
    });

    it('stops the player starting a native drag', () => {
      start({});
      const press = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      grip()?.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
    });

    it('ignores a press that does not move', () => {
      const onMove = vi.fn();
      start({ onMove });
      dragGrip(1, 1);
      expect(onMove).not.toHaveBeenCalled();
      expect(box()?.classList.contains('is-placed')).toBe(false);
    });

    it('returns to the default place on double click', () => {
      const onMove = vi.fn();
      const overlay = start({ onMove });
      overlay.setDisplay({
        showTranslation: true,
        subtitleSize: 'medium',
        subtitlePosition: { x: 0.3, y: 0.5 },
      });
      expect(box()?.classList.contains('is-placed')).toBe(true);
      grip()?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(onMove).toHaveBeenCalledWith(null);
      expect(box()?.classList.contains('is-placed')).toBe(false);
      expect(box()?.style.left).toBe('');
    });

    it('moves with the arrow keys, and Home resets it', () => {
      const onMove = vi.fn();
      start({ onMove });
      grip()?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
      );
      const moved = onMove.mock.calls[0]?.[0] as { y: number };
      expect(moved.y).toBeGreaterThan(0);
      grip()?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      );
      expect(onMove).toHaveBeenLastCalledWith(null);
    });

    it('narrows the strip near a side, so it stays inside the player', () => {
      const overlay = start({});
      overlay.setDisplay({
        showTranslation: true,
        subtitleSize: 'medium',
        subtitlePosition: { x: 0.25, y: 0.5 },
      });
      expect(parseFloat(box()?.style.width ?? '')).toBeCloseTo(42);
      expect(box()?.style.left).toBe('25%');
    });

    it('keeps the subtitle inside the player', () => {
      expect(clampPosition({ x: -1, y: -1 }, 0.2)).toEqual({
        x: 0.25,
        y: 0.02,
      });
      const high = clampPosition({ x: 2, y: 2 }, 0.2);
      expect(high.x).toBe(0.75);
      expect(high.y).toBeCloseTo(0.78);
    });
  });
});
