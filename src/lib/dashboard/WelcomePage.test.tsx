// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '../settings/settings';
import { WelcomePage } from './WelcomePage';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('WelcomePage', () => {
  let container: HTMLElement;
  let root: Root;
  let saved: Settings[];

  beforeEach(async () => {
    saved = [];
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WelcomePage
          iconUrl="/icon.png"
          services={{
            settings: () => Promise.resolve(defaultSettings('fr-CA')),
            saveSettings: (settings) => {
              saved.push(settings);
              return Promise.resolve();
            },
          }}
        />,
      );
      await Promise.resolve();
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('teaches the four things to try', () => {
    const titles = [...container.querySelectorAll('.welcome-step h2')].map(
      (title) => title.textContent,
    );
    expect(titles).toEqual([
      '1Click a word',
      '2Drag across a phrase',
      '3Show nearby lines',
      '4Review your words',
    ]);
  });

  it('describes each animation to screen readers', () => {
    const labels = [...container.querySelectorAll('[role="img"]')].map(
      (scene) => scene.getAttribute('aria-label'),
    );
    expect(labels[0]).toContain('clicks the word bank');
    expect(labels[1]).toContain('drags across');
    expect(labels[2]).toContain('across two lines');
    expect(labels[3]).toContain('Start review');
  });

  it('pauses one animation at a time', () => {
    const [first, second] = [
      ...container.querySelectorAll<HTMLButtonElement>('.welcome-pause'),
    ];
    act(() => {
      first?.click();
    });
    expect(first?.textContent).toBe('Play');
    expect(first?.getAttribute('aria-pressed')).toBe('true');
    expect(first?.closest('.welcome-step')?.className).toContain('is-paused');
    expect(second?.closest('.welcome-step')?.className).not.toContain(
      'is-paused',
    );
    act(() => {
      first?.click();
    });
    expect(first?.textContent).toBe('Pause');
  });

  it('starts from the browser language, and saves a change', async () => {
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '.welcome-languages button',
      ),
    ];
    expect(buttons[0]?.textContent).toContain('Français');
    expect(buttons[1]?.textContent).toContain('English');
    buttons[0]?.click();
    const option = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((item) => item.textContent.includes('العربية'));
    await act(async () => {
      option?.click();
      await Promise.resolve();
    });
    expect(saved.at(-1)?.nativeLanguage).toBe('ar');
    expect(saved.at(-1)?.learningLanguage).toBe('en');
  });

  it('leads to YouTube', () => {
    const link = container.querySelector<HTMLAnchorElement>('a.button');
    expect(link?.getAttribute('href')).toBe('https://www.youtube.com');
  });
});
