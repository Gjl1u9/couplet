// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectMenu, type SelectMenu } from './select-menu';

const CHOICES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'sw', name: 'Swedish' },
];

describe('createSelectMenu', () => {
  let menu: SelectMenu;
  const onChange = vi.fn();
  const trigger = () =>
    menu.element.querySelector<HTMLButtonElement>('.select-trigger');
  const expanded = () => trigger()?.getAttribute('aria-expanded');
  const press = (key: string) => {
    trigger()?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  };
  const activeCode = () =>
    menu.element.querySelector<HTMLElement>('.is-active')?.dataset.code;

  beforeEach(() => {
    onChange.mockClear();
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
    menu = createSelectMenu({
      label: 'Learning language',
      choices: CHOICES,
      value: 'es',
      onChange,
    });
    document.body.replaceChildren(menu.element);
  });

  afterEach(() => {
    menu.dispose();
  });

  it('names the control and shows the current value', () => {
    expect(trigger()?.getAttribute('aria-label')).toBe('Learning language');
    expect(trigger()?.textContent).toBe('Spanish');
    const selected = menu.element.querySelector('[aria-selected="true"]');
    expect(selected?.textContent).toBe('Spanish');
  });

  it('opens on click at the current value, and a choice closes it', () => {
    trigger()?.click();
    expect(expanded()).toBe('true');
    expect(activeCode()).toBe('es');
    menu.element.querySelector<HTMLElement>('[data-code="fr"]')?.click();
    expect(expanded()).toBe('false');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('fr');
    expect(trigger()?.textContent).toBe('French');
  });

  it('keeps a long list to its maximum height, however much room there is', () => {
    const size = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 132, 620));
    vi.stubGlobal('innerHeight', 2000);
    trigger()?.click();
    const list = document.querySelector<HTMLElement>('.select-list');
    expect(list?.style.maxHeight).toBe('272px');
    size.mockRestore();
    vi.unstubAllGlobals();
  });

  it('does not report the value it already has', () => {
    trigger()?.click();
    menu.element.querySelector<HTMLElement>('[data-code="es"]')?.click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works by keyboard, without letting keys reach the page', () => {
    const onPage = vi.fn();
    document.addEventListener('keydown', onPage);
    press('ArrowDown');
    expect(expanded()).toBe('true');
    press('ArrowDown');
    expect(activeCode()).toBe('fr');
    press('End');
    expect(activeCode()).toBe('sw');
    press('Home');
    expect(activeCode()).toBe('en');
    press('ArrowUp');
    expect(activeCode()).toBe('en');
    press('s');
    expect(activeCode()).toBe('es');
    press('s');
    expect(activeCode()).toBe('sw');
    press('Enter');
    document.removeEventListener('keydown', onPage);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('sw');
    expect(onPage).not.toHaveBeenCalled();
  });

  it('closes on Escape before the panel around it can', () => {
    const onDocument = vi.fn();
    document.addEventListener('keydown', onDocument, { capture: true });
    trigger()?.click();
    press('Escape');
    document.removeEventListener('keydown', onDocument, { capture: true });
    expect(expanded()).toBe('false');
    expect(onDocument).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on Tab and on a press outside', () => {
    trigger()?.click();
    press('Tab');
    expect(expanded()).toBe('false');
    trigger()?.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(expanded()).toBe('false');
  });

  it('leaves no key handling behind once disposed', () => {
    const onPage = vi.fn();
    trigger()?.click();
    menu.dispose();
    document.addEventListener('keydown', onPage);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );
    document.removeEventListener('keydown', onPage);
    expect(onPage).toHaveBeenCalledOnce();
  });
});
