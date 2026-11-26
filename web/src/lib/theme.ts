// The light and the dark theme. The page opens in the system's theme (set before the first paint,
// by the script in index.html); the switch overrides it until the page is closed. Nothing is
// stored: the next visit follows the system again.
import { useCallback, useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

/** The theme the page shows: `dark` on <html>, or not. */
function shownTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function show(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** The theme and the switch: the system's until the user chooses, then the user's. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState(shownTheme);
  const chosen = useRef(false);

  useEffect(() => show(theme), [theme]);

  useEffect(() => {
    const system = window.matchMedia(SYSTEM_DARK);
    const follow = () => {
      if (!chosen.current) setTheme(system.matches ? 'dark' : 'light');
    };
    follow(); // the system may have changed since the script in index.html ran
    system.addEventListener('change', follow);
    return () => system.removeEventListener('change', follow);
  }, []);

  const choose = useCallback((theme: Theme) => {
    chosen.current = true;
    setTheme(theme);
  }, []);

  return [theme, choose];
}
