import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ThemeProvider, useMediaQuery } from '@mui/material';
import { CssBaseline } from '@mui/material';
import { createAppTheme } from '../theme';

// ── Types ──────────────────────────────────────────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** The stored user preference */
  mode: ThemeMode;
  /** The actual rendered mode after system resolution */
  resolvedMode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  /** Cycles: dark → light → system → dark */
  toggleMode: () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'salary-monitor-theme';

// ── Provider ───────────────────────────────────────────────────────────────────
export const ThemeContextProvider = ({ children }: { children: ReactNode }) => {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
  });

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  const resolvedMode: 'light' | 'dark' =
    mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

  // Only recreate the MUI theme when the resolved mode actually changes
  const muiTheme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  const toggleMode = useCallback(() => {
    const next: ThemeMode =
      mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark';
    setMode(next);
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, resolvedMode, setMode, toggleMode }),
    [mode, resolvedMode, setMode, toggleMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

// ── Hook ───────────────────────────────────────────────────────────────────────
export const useThemeContext = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within ThemeContextProvider');
  return ctx;
};
