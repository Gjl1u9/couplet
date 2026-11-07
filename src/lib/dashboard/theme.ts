import { useEffect, useState } from 'react';
import type { PageTheme } from '../settings/settings';

/** Follows the system until the user picks a theme. Returns what is showing. */
export function usePageTheme(preference: PageTheme): 'light' | 'dark' {
  const [system, setSystem] = useState(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      setSystem(query.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
    };
  }, []);
  const theme = preference === 'system' ? system : preference;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return theme === 'dark' ? 'dark' : 'light';
}
