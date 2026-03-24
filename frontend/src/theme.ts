import { createTheme, alpha } from '@mui/material/styles';

// ── Brand Tokens (same in both themes) ────────────────────────────────────────
const BRAND_TOKENS = {
  red:         '#E31E24',
  redDim:      '#B71C1C',
  // gold differs per theme (darker on light bg for WCAG contrast)
  success: '#10B981',
  warning: '#F59E0B',
  error:   '#EF4444',
  info:    '#3B82F6',
  fontDisplay: '"Onest", "Segoe UI", Arial, sans-serif',
  fontMono:    '"JetBrains Mono", "Fira Code", monospace',
};

// ── Dark Mode Tokens ───────────────────────────────────────────────────────────
const DARK_TOKENS = {
  bgBase:        '#0A0D14',
  bgSurface:     '#121520',
  bgElevated:    '#1A1F2E',
  bgHover:       '#1F2538',
  border:        '#252A3D',
  borderHover:   '#343B58',
  textPrimary:   '#EEF0F8',
  textSecondary: '#6B7194',
  textMuted:     '#3D4260',
  textDisabled:  '#2A2F45',
  gold:          '#F59E0B',
  goldDim:       '#B45309',
};

// ── Light Mode Tokens ──────────────────────────────────────────────────────────
const LIGHT_TOKENS = {
  bgBase:        '#F2F4FB',
  bgSurface:     '#FFFFFF',
  bgElevated:    '#EEF0FA',
  bgHover:       '#E8EAF6',
  border:        '#D8DBEF',
  borderHover:   '#B0B4D0',
  textPrimary:   '#0F1128',
  textSecondary: '#555880',
  textMuted:     '#8890B0',
  textDisabled:  '#C0C4DC',
  gold:          '#D97706',
  goldDim:       '#92400E',
};

// ── Backwards-compatible TOKENS export (dark + brand) ─────────────────────────
export const TOKENS = {
  ...BRAND_TOKENS,
  ...DARK_TOKENS,
};

// ── TypeScript Module Augmentation ────────────────────────────────────────────
declare module '@mui/material/styles' {
  interface Palette {
    gold: { main: string; light: string; dark: string; contrastText: string };
    surface: { default: string; elevated: string; hover: string };
  }
  interface PaletteOptions {
    gold?: { main: string; light: string; dark: string; contrastText: string };
    surface?: { default: string; elevated: string; hover: string };
  }
  interface TypographyVariants {
    mono: React.CSSProperties;
    label: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    mono?: React.CSSProperties;
    label?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    mono: true;
    label: true;
  }
}

// ── Theme Factory ──────────────────────────────────────────────────────────────
export function createAppTheme(mode: 'light' | 'dark') {
  const t = mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  const b = BRAND_TOKENS;
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main:         b.red,
        light:        '#FF5252',
        dark:         b.redDim,
        contrastText: '#FFFFFF',
      },
      secondary: {
        main:         t.gold,
        light:        '#FCD34D',
        dark:         t.goldDim,
        contrastText: isDark ? '#0A0D14' : '#FFFFFF',
      },
      gold: {
        main:         t.gold,
        light:        '#FCD34D',
        dark:         t.goldDim,
        contrastText: isDark ? '#0A0D14' : '#FFFFFF',
      },
      success: {
        main:  b.success,
        light: isDark ? '#34D399' : '#059669',
        dark:  '#059669',
      },
      warning: {
        main:  b.warning,
        light: '#FCD34D',
        dark:  t.goldDim,
      },
      error: {
        main:  b.error,
        light: '#F87171',
        dark:  '#DC2626',
      },
      info: {
        main:  b.info,
        light: '#60A5FA',
        dark:  '#2563EB',
      },
      surface: {
        default:  t.bgSurface,
        elevated: t.bgElevated,
        hover:    t.bgHover,
      },
      background: {
        default: t.bgBase,
        paper:   t.bgSurface,
      },
      text: {
        primary:   t.textPrimary,
        secondary: t.textSecondary,
        disabled:  t.textDisabled,
      },
      divider: t.border,
    },

    typography: {
      fontFamily: b.fontDisplay,
      h1: { fontSize: '2.5rem',   fontWeight: 800, lineHeight: 1.1,  letterSpacing: '-0.02em' },
      h2: { fontSize: '2rem',     fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em' },
      h3: { fontSize: '1.625rem', fontWeight: 700, lineHeight: 1.2 },
      h4: { fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.25 },
      h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.3 },
      h6: { fontSize: '1rem',     fontWeight: 600, lineHeight: 1.35 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
      body2: { fontSize: '0.875rem',  lineHeight: 1.55 },
      mono: {
        fontFamily: b.fontMono,
        fontSize: '0.9375rem',
        fontWeight: 500,
        letterSpacing: '0.01em',
      },
      label: {
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: t.textSecondary,
      },
      caption: { fontSize: '0.8125rem', lineHeight: 1.4 },
      button: { fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' as const },
    },

    shape: { borderRadius: 10 },

    components: {
      MuiCssBaseline: {
        styleOverrides: `
          :root {
            --color-bg-base:        ${t.bgBase};
            --color-bg-surface:     ${t.bgSurface};
            --color-bg-elevated:    ${t.bgElevated};
            --color-bg-hover:       ${t.bgHover};
            --color-border:         ${t.border};
            --color-border-hover:   ${t.borderHover};
            --color-border-subtle:  ${alpha(t.border, 0.6)};
            --color-text-primary:   ${t.textPrimary};
            --color-text-secondary: ${t.textSecondary};
            --color-text-muted:     ${t.textMuted};
            --color-text-disabled:  ${t.textDisabled};
            --color-red:            ${b.red};
            --color-red-dim:        ${b.redDim};
            --color-red-muted:      ${alpha(b.red, 0.08)};
            --color-red-subtle:     ${alpha(b.red, 0.12)};
            --color-gold:           ${t.gold};
            --color-gold-dim:       ${t.goldDim};
            --color-gold-muted:     ${alpha(t.gold, 0.10)};
            --color-gold-glow:      ${alpha(t.gold, 0.12)};
            --color-success:        ${b.success};
            --color-success-muted:  ${alpha(b.success, 0.12)};
            --color-error:          ${b.error};
            --color-error-muted:    ${alpha(b.error, 0.12)};
            --color-surface-hover:  ${alpha(t.textPrimary, 0.04)};
            --font-display:         ${b.fontDisplay};
            --font-mono:            ${b.fontMono};
          }
          html, body {
            background-color: ${t.bgBase};
            background-image:
              radial-gradient(circle at 10% 10%, ${alpha(b.red, isDark ? 0.08 : 0.04)} 0%, transparent 35%),
              radial-gradient(circle at 90% 0%, ${alpha(t.gold, isDark ? 0.08 : 0.04)} 0%, transparent 30%);
          }
          ::selection {
            background: ${alpha(b.red, 0.22)};
            color: ${t.textPrimary};
          }
          * { box-sizing: border-box; }
          *:focus-visible {
            outline: 2px solid ${alpha(b.red, 0.7)};
            outline-offset: 2px;
          }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: ${t.bgBase}; }
          ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: ${t.borderHover}; }
        `,
      },

      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 600,
            fontSize: '0.9375rem',
            padding: '10px 24px',
            textTransform: 'none',
            transition: 'all 200ms ease',
          },
          contained: {
            background: `linear-gradient(135deg, ${b.red} 0%, ${b.redDim} 100%)`,
            boxShadow: `0 2px 8px ${alpha(b.red, 0.35)}`,
            '&:hover': {
              background: `linear-gradient(135deg, #FF3333 0%, ${b.red} 100%)`,
              boxShadow: `0 4px 16px ${alpha(b.red, 0.5)}`,
              transform: 'translateY(-1px)',
            },
            '&:active': { transform: 'translateY(0)' },
            '&.Mui-disabled': {
              background: t.bgElevated,
              color: t.textMuted,
              boxShadow: 'none',
            },
          },
          outlined: {
            borderColor: t.border,
            color: t.textPrimary,
            '&:hover': {
              borderColor: t.borderHover,
              backgroundColor: alpha(t.textPrimary, 0.05),
            },
          },
          text: {
            color: t.textSecondary,
            '&:hover': {
              backgroundColor: alpha(t.textPrimary, 0.05),
              color: t.textPrimary,
            },
          },
          containedSecondary: {
            background: `linear-gradient(135deg, ${t.gold} 0%, ${t.goldDim} 100%)`,
            color: isDark ? '#0A0D14' : '#FFFFFF',
            boxShadow: `0 2px 8px ${alpha(t.gold, 0.35)}`,
            '&:hover': {
              background: `linear-gradient(135deg, #FBBF24 0%, ${t.gold} 100%)`,
              boxShadow: `0 4px 16px ${alpha(t.gold, 0.5)}`,
              transform: 'translateY(-1px)',
            },
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: t.bgSurface,
            backgroundImage: 'none',
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
            transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease',
            '&:hover': {
              borderColor: t.borderHover,
              boxShadow: isDark ? '0 6px 20px rgba(0,0,0,0.35)' : '0 8px 24px rgba(15,17,40,0.12)',
              transform: 'translateY(-1px)',
            },
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: t.bgSurface,
            backgroundImage: 'none',
            border: `1px solid ${t.border}`,
            borderRadius: 12,
          },
          elevation1: { boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)' },
          elevation2: { boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.10)' },
          elevation3: { boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.12)' },
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: t.bgElevated,
            borderRadius: 8,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: t.border,
              transition: 'border-color 200ms ease',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: t.borderHover,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: b.red,
              borderWidth: '2px',
              boxShadow: `0 0 0 3px ${alpha(b.red, 0.15)}`,
            },
          },
        },
      },

      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: t.textSecondary,
            '&.Mui-focused': { color: b.red },
          },
        },
      },

      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              backgroundColor: t.bgElevated,
              color: t.textSecondary,
              fontWeight: 600,
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderBottom: `2px solid ${t.border}`,
              padding: '12px 16px',
            },
          },
        },
      },

      MuiTableBody: {
        styleOverrides: {
          root: {
            '& .MuiTableRow-root': {
              transition: 'background-color 150ms ease',
              '&:nth-of-type(odd)': { backgroundColor: alpha(t.bgElevated, 0.4) },
              '&:nth-of-type(even)': { backgroundColor: 'transparent' },
              '&:hover': { backgroundColor: alpha(b.red, 0.06) },
            },
            '& .MuiTableCell-body': {
              borderBottom: `1px solid ${alpha(t.border, 0.6)}`,
              color: t.textPrimary,
              padding: '11px 16px',
            },
          },
        },
      },

      MuiTablePagination: {
        styleOverrides: {
          root: { color: t.textSecondary, borderTop: `1px solid ${t.border}` },
          selectIcon: { color: t.textSecondary },
        },
      },

      MuiTableContainer: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: t.bgSurface,
            backgroundImage: 'none',
            borderRight: `1px solid ${t.border}`,
          },
        },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '2px 8px',
            width: 'calc(100% - 16px)',
            transition: 'all 200ms ease',
            '&.Mui-selected': {
              backgroundColor: alpha(b.red, 0.12),
              color: b.red,
              boxShadow: `inset 3px 0 0 ${b.red}`,
              '& .MuiListItemIcon-root': { color: b.red },
              '&:hover': { backgroundColor: alpha(b.red, 0.16) },
            },
            '&:hover': { backgroundColor: alpha(t.textPrimary, 0.04) },
          },
        },
      },

      MuiListItemIcon: {
        styleOverrides: {
          root: {
            color: t.textSecondary,
            minWidth: 40,
          },
        },
      },

      MuiListItemText: {
        styleOverrides: {
          primary: {
            fontSize: '0.9375rem',
            fontWeight: 500,
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: {
            backgroundColor: t.bgElevated,
            border: `1px solid ${t.border}`,
            color: t.textSecondary,
            fontFamily: b.fontMono,
            fontSize: '0.8125rem',
          },
        },
      },

      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 8, border: '1px solid' },
          standardError: {
            backgroundColor: alpha(b.error, 0.1),
            borderColor: alpha(b.error, 0.3),
            color: isDark ? '#F87171' : '#DC2626',
          },
          standardSuccess: {
            backgroundColor: alpha(b.success, 0.1),
            borderColor: alpha(b.success, 0.3),
            color: isDark ? '#34D399' : '#059669',
          },
          standardWarning: {
            backgroundColor: alpha(b.warning, 0.1),
            borderColor: alpha(b.warning, 0.3),
            color: t.gold,
          },
        },
      },

      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: {
          root: {
            backgroundColor: alpha(t.bgElevated, 0.8),
            '&::after': {
              background: `linear-gradient(90deg, transparent, ${alpha(t.border, 0.8)}, transparent)`,
            },
          },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            fontSize: '0.8125rem',
            color: t.textPrimary,
            boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.12)',
          },
          arrow: { color: t.bgElevated },
        },
      },

      MuiDivider: {
        styleOverrides: {
          root: { borderColor: t.border },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: 'all 200ms ease',
            '&:hover': {
              backgroundColor: alpha(t.textPrimary, 0.06),
            },
          },
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: t.bgSurface,
            backgroundImage: 'none',
            borderBottom: `1px solid ${t.border}`,
            boxShadow: 'none',
          },
        },
      },

      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            backgroundColor: t.bgSurface,
            height: 56,
          },
        },
      },

      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            color: t.textSecondary,
            minWidth: 0,
            padding: '6px 12px',
            '&.Mui-selected': {
              color: b.red,
            },
          },
          label: {
            fontSize: '0.6875rem',
            fontWeight: 500,
            '&.Mui-selected': {
              fontSize: '0.6875rem',
            },
          },
        },
      },
    },
  });
}

// ── Default dark theme export (for any legacy imports) ─────────────────────────
export default createAppTheme('dark');
