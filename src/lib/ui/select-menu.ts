import { element, icon, ICON_CHECK, ICON_CHEVRON_DOWN } from './dom';

export interface SelectChoice {
  readonly code: string;
  readonly name: string;
}

export interface SelectMenuOptions {
  readonly label: string;
  readonly choices: readonly SelectChoice[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onClose?: () => void;
}

export interface SelectMenu {
  readonly element: HTMLElement;
  setValue: (value: string) => void;
  isOpen: () => boolean;
  /** Closes it and removes its page listeners. */
  dispose: () => void;
}

const GAP = 4;
const EDGE = 8;
const MIN_WIDTH = 160;

let lists = 0;

/**
 * Replaces the browser's select. The list sits in the top layer, so the panel's scrolling
 * and the player's fullscreen cannot clip it, and it keeps the colours of its parents.
 */
export function createSelectMenu(options: SelectMenuOptions): SelectMenu {
  const { label, choices, onChange } = options;
  let value = options.value;
  let open = false;
  let active = 0;

  const valueText = element('span', 'select-value');
  const trigger = element(
    'button',
    'select-trigger',
    valueText,
    icon(ICON_CHEVRON_DOWN),
  );
  trigger.type = 'button';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  lists += 1;
  const listId = `select-list-${String(lists)}`;
  const rows = choices.map((choice, at) => {
    const row = element(
      'li',
      'select-option',
      element('span', '', choice.name),
      icon(ICON_CHECK),
    );
    row.id = `${listId}-${String(at)}`;
    row.dataset.code = choice.code;
    row.setAttribute('role', 'option');
    return row;
  });
  const list = element('ul', 'select-list', ...rows);
  list.id = listId;
  list.popover = 'manual';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  trigger.setAttribute('aria-controls', listId);
  const root = element('div', 'select', trigger, list);

  const syncValue = () => {
    valueText.textContent =
      choices.find((choice) => choice.code === value)?.name ?? value;
    for (const row of rows) {
      row.setAttribute('aria-selected', String(row.dataset.code === value));
    }
  };

  const setActive = (at: number) => {
    active = Math.max(0, Math.min(at, rows.length - 1));
    rows.forEach((row, index) => {
      row.classList.toggle('is-active', index === active);
    });
    const row = rows[active];
    if (!row) return;
    trigger.setAttribute('aria-activedescendant', row.id);
    row.scrollIntoView({ block: 'nearest' });
  };

  /** Opens below the control, or above it when there is more room there. */
  const place = () => {
    const box = trigger.getBoundingClientRect();
    const width = Math.max(box.width, MIN_WIDTH);
    list.style.width = `${String(width)}px`;
    list.style.left = `${String(Math.max(EDGE, box.right - width))}px`;
    list.style.maxHeight = 'none';
    const wanted = list.getBoundingClientRect().height;
    const below = innerHeight - box.bottom - GAP - EDGE;
    const above = box.top - GAP - EDGE;
    const fitsBelow = wanted <= below || below >= above;
    list.style.maxHeight = `${String(fitsBelow ? below : above)}px`;
    list.style.top = fitsBelow
      ? `${String(box.bottom + GAP)}px`
      : `${String(Math.max(EDGE, box.top - GAP - Math.min(wanted, above)))}px`;
  };

  const choose = (code: string | undefined) => {
    close();
    trigger.focus();
    if (code === undefined || code === value) return;
    value = code;
    syncValue();
    onChange(code);
  };

  const typeAhead = (letter: string) => {
    const wanted = letter.toLocaleLowerCase();
    const next = choices.findIndex(
      (choice, at) =>
        at > active && choice.name.toLocaleLowerCase().startsWith(wanted),
    );
    const found =
      next >= 0
        ? next
        : choices.findIndex((choice) =>
            choice.name.toLocaleLowerCase().startsWith(wanted),
          );
    if (found >= 0) setActive(found);
  };

  /** Runs on window capture, so Esc closes only the list and the player's keys stay quiet. */
  const onOpenKey = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.stopPropagation();
    const { key } = event;
    if (key === 'Tab') {
      close();
      return;
    }
    event.preventDefault();
    if (key === 'Escape') {
      close();
      trigger.focus();
    } else if (key === 'ArrowDown') setActive(active + 1);
    else if (key === 'ArrowUp') setActive(active - 1);
    else if (key === 'Home') setActive(0);
    else if (key === 'End') setActive(rows.length - 1);
    else if (key === 'Enter' || key === ' ') {
      choose(rows[active]?.dataset.code);
    } else if (key.length === 1) typeAhead(key);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!event.composedPath().includes(root)) close();
  };

  /** A list in the top layer would stay behind while the page moves under it. */
  const onMove = (event: Event) => {
    if (event.composedPath()[0] !== list) close();
  };

  const stopListening = () => {
    window.removeEventListener('keydown', onOpenKey, { capture: true });
    window.removeEventListener('pointerdown', onPointerDown, { capture: true });
    window.removeEventListener('scroll', onMove, { capture: true });
    window.removeEventListener('resize', onMove);
  };

  function close() {
    if (!open) return;
    open = false;
    stopListening();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (list.isConnected) list.hidePopover();
    options.onClose?.();
  }

  const show = () => {
    if (open || !root.isConnected) return;
    open = true;
    trigger.setAttribute('aria-expanded', 'true');
    list.showPopover();
    place();
    setActive(
      Math.max(
        0,
        choices.findIndex((choice) => choice.code === value),
      ),
    );
    window.addEventListener('keydown', onOpenKey, { capture: true });
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('scroll', onMove, { capture: true });
    window.addEventListener('resize', onMove);
  };

  trigger.addEventListener('click', () => {
    if (open) close();
    else show();
  });
  trigger.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
    // Otherwise the same key press would also click the button, and reach the player.
    event.preventDefault();
    event.stopPropagation();
    show();
  });
  list.addEventListener('pointermove', (event) => {
    const row = (event.target as Element).closest<HTMLLIElement>(
      '.select-option',
    );
    const at = row ? rows.indexOf(row) : -1;
    if (at >= 0 && at !== active) setActive(at);
  });
  // Keeps focus on the control, which announces the active option.
  list.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  list.addEventListener('click', (event) => {
    const row = (event.target as Element).closest<HTMLLIElement>(
      '.select-option',
    );
    if (row) choose(row.dataset.code);
  });

  syncValue();
  return {
    element: root,
    setValue(next) {
      value = next;
      syncValue();
    },
    isOpen: () => open,
    dispose: close,
  };
}
