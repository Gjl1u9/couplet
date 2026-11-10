// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WordCheck } from './WordCheck';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('WordCheck', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const render = (language: string, levels: Record<string, number> = {}) => {
    act(() => {
      root.render(
        <WordCheck language={language} levels={levels} onSave={() => {}} />,
      );
    });
  };

  it('shows nothing for a language without a word list', () => {
    render('es');
    expect(container.innerHTML).toBe('');
  });

  it('offers the check for English, and shows a saved level', () => {
    render('en');
    expect(container.textContent).toContain('Check my English words');
    render('en', { en: 8000 });
    expect(container.textContent).toContain('About 8,000 common English words');
  });
});
