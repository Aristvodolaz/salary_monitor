import { createTheme, alpha } from '@mui/material/styles';

// ── Design Tokens ─────────────────────────────────────────────────────────────
export const TOKENS = {
  // Backgrounds
  bgBase:      '#0A0D14',
  bgSurface:   '#121520',
  bgElevated:  '#1A1F2E',
  bgHover:     '#1F2538',

  // Borders
  border:      '#252A3D',
  borderHover: '#343B58',

  // Brand
  red:         '#E31E24',
  redDim:      '#B71C1C',
  gold:        '#F59E0B',
  goldDim:     '#B45309',

  // Text
  textPrimary:   '#EEF0F8',
  textSecondary: '#6B7194',
  textMuted:     '#3D4260',
  textDisabled:  '#2A2F45',

  // Semantic
  success: '#10B981',
  warning: '#F59E0B',
  error:   '#EF4444',
  info:    '#3B82F6',

  // Fonts
  fontDisplay: '"Onest", "Segoe UI", Arial, sans-serif',
  fontMono:    '"JetBrains Mono", "Fira Code", monospace',
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

// ── Theme ─────────────────────────────────────────────────────────────────────
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:         TOKENS.red,
      light:        '#FF5252',
      dark:         TOKENS.redDim,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main:         TOKENS.gold,
      light:        '#FCD34D',
      dark:         TOKENS.goldDim,
      contrastText: '#0A0D14',
    },
    gold: {
      main:         TOKENS.gold,
      light:        '#FCD34D',
      dark:         TOKENS.goldDim,
      contrastText: '#0A0D14',
    },
    success: {
      main:  TOKENS.success,
      light: '#34D399',
      dark:  '#059669',
    },
    warning: {
      main:  TOKENS.warning,
      light: '#FCD34D',
      dark:  TOKENS.goldDim,
    },
    error: {
      main:  TOKENS.error,
      light: '#F87171',
      dark:  '#DC2626',
    },
    info: {
      main:  TOKENS.info,
      light: '#60A5FA',
      dark:  '#2563EB',
    },
    surface: {
      default:  TOKENS.bgSurface,
      elevated: TOKENS.bgElevated,
      hover:    TOKENS.bgHover,
    },
    background: {
      default: TOKENS.bgBase,
      paper:   TOKENS.bgSurface,
    },
    text: {
      primary:   TOKENS.textPrimary,
      secondary: TOKENS.textSecondary,
      disabled:  TOKENS.textDisabled,
    },
    divider: TOKENS.border,
  },

  typography: {
    fontFamily: TOKENS.fontDisplay,
    h1: { fontSize: '2.5rem',   fontWeight: 800, lineHeight: 1.1,  letterSpacing: '-0.02em' },
    h2: { fontSize: '2rem',     fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.625rem', fontWeight: 700, lineHeight: 1.2 },
    h4: { fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.25 },
    h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.3 },
    h6: { fontSize: '1rem',     fontWeight: 600, lineHeight: 1.35 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem',  lineHeight: 1.55 },
    mono: {
      fontFamily: TOKENS.fontMono,
      fontSize: '0.9375rem',
      fontWeight: 500,
      letterSpacing: '0.01em',
    },
    label: {
      fontSize: '0.75rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: TOKENS.textSecondary,
    },
    caption: { fontSize: '0.8125rem', lineHeight: 1.4 },
    button: { fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' as const },
  },

  shape: { borderRadius: 10 },

  components: {
    MuiCssBaseline: {
      styleOverrides: `
        :root {
          --color-bg-base:        ${TOKENS.bgBase};
          --color-bg-surface:     ${TOKENS.bgSurface};
          --color-bg-elevated:    ${TOKENS.bgElevated};
          --color-border:         ${TOKENS.border};
          --color-red:            ${TOKENS.red};
          --color-gold:           ${TOKENS.gold};
          --color-text-primary:   ${TOKENS.textPrimary};
          --color-text-secondary: ${TOKENS.textSecondary};
          --font-display:         ${TOKENS.fontDisplay};
          --font-mono:            ${TOKENS.fontMono};
        }
        html, body { background-color: ${TOKENS.bgBase}; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${TOKENS.bgBase}; }
        ::-webkit-scrollbar-thumb { background: ${TOKENS.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${TOKENS.borderHover}; }
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
          background: `linear-gradient(135deg, ${TOKENS.red} 0%, ${TOKENS.redDim} 100%)`,
          boxShadow: `0 2px 8px ${alpha(TOKENS.red, 0.35)}`,
          '&:hover': {
            background: `linear-gradient(135deg, #FF3333 0%, ${TOKENS.red} 100%)`,
            boxShadow: `0 4px 16px ${alpha(TOKENS.red, 0.5)}`,
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
          '&.Mui-disabled': {
            background: TOKENS.bgElevated,
            color: TOKENS.textMuted,
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: TOKENS.border,
          color: TOKENS.textPrimary,
          '&:hover': {
            borderColor: TOKENS.borderHover,
            backgroundColor: alpha(TOKENS.textPrimary, 0.05),
          },
        },
        text: {
          color: TOKENS.textSecondary,
          '&:hover': {
            backgroundColor: alpha(TOKENS.textPrimary, 0.05),
            color: TOKENS.textPrimary,
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${TOKENS.gold} 0%, ${TOKENS.goldDim} 100%)`,
          color: '#0A0D14',
          boxShadow: `0 2px 8px ${alpha(TOKENS.gold, 0.35)}`,
          '&:hover': {
            background: `linear-gradient(135deg, #FBBF24 0%, ${TOKENS.gold} 100%)`,
            boxShadow: `0 4px 16px ${alpha(TOKENS.gold, 0.5)}`,
            transform: 'translateY(-1px)',
          },
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: TOKENS.bgSurface,
          backgroundImage: 'none',
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 12,
          boxShadow: 'none',
          transition: 'border-color 200ms ease, box-shadow 200ms ease',
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: TOKENS.bgSurface,
          backgroundImage: 'none',
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 12,
        },
        elevation1: { boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
        elevation2: { boxShadow: '0 4px 16px rgba(0,0,0,0.5)' },
        elevation3: { boxShadow: '0 8px 32px rgba(0,0,0,0.6)' },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: TOKENS.bgElevated,
          borderRadius: 8,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: TOKENS.border,
            transition: 'border-color 200ms ease',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: TOKENS.borderHover,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: TOKENS.red,
            borderWidth: '2px',
            boxShadow: `0 0 0 3px ${alpha(TOKENS.red, 0.15)}`,
          },
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: TOKENS.textSecondary,
          '&.Mui-focused': { color: TOKENS.red },
        },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: TOKENS.bgElevated,
            color: TOKENS.textSecondary,
            fontWeight: 600,
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            borderBottom: `2px solid ${TOKENS.border}`,
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
            '&:nth-of-type(odd)': { backgroundColor: alpha(TOKENS.bgElevated, 0.4) },
            '&:nth-of-type(even)': { backgroundColor: 'transparent' },
            '&:hover': { backgroundColor: alpha(TOKENS.red, 0.06) },
          },
          '& .MuiTableCell-body': {
            borderBottom: `1px solid ${alpha(TOKENS.border, 0.6)}`,
            color: TOKENS.textPrimary,
            padding: '11px 16px',
          },
        },
      },
    },

    MuiTablePagination: {
      styleOverrides: {
        root: { color: TOKENS.textSecondary, borderTop: `1px solid ${TOKENS.border}` },
        selectIcon: { color: TOKENS.textSecondary },
      },
    },

    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: TOKENS.bgSurface,
          backgroundImage: 'none',
          borderRight: `1px solid ${TOKENS.border}`,
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
            backgroundColor: alpha(TOKENS.red, 0.12),
            color: TOKENS.red,
            boxShadow: `inset 3px 0 0 ${TOKENS.red}`,
            '& .MuiListItemIcon-root': { color: TOKENS.red },
            '&:hover': { backgroundColor: alpha(TOKENS.red, 0.16) },
          },
          '&:hover': { backgroundColor: alpha(TOKENS.textPrimary, 0.04) },
        },
      },
    },

    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: TOKENS.textSecondary,
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
          backgroundColor: TOKENS.bgElevated,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.textSecondary,
          fontFamily: TOKENS.fontMono,
          fontSize: '0.8125rem',
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 8, border: '1px solid' },
        standardError: {
          backgroundColor: alpha(TOKENS.error, 0.1),
          borderColor: alpha(TOKENS.error, 0.3),
          color: '#F87171',
        },
        standardSuccess: {
          backgroundColor: alpha(TOKENS.success, 0.1),
          borderColor: alpha(TOKENS.success, 0.3),
          color: '#34D399',
        },
        standardWarning: {
          backgroundColor: alpha(TOKENS.warning, 0.1),
          borderColor: alpha(TOKENS.warning, 0.3),
          color: TOKENS.gold,
        },
      },
    },

    MuiSkeleton: {
      defaultProps: { animation: 'wave' },
      styleOverrides: {
        root: {
          backgroundColor: alpha(TOKENS.bgElevated, 0.8),
          '&::after': {
            background: `linear-gradient(90deg, transparent, ${alpha(TOKENS.border, 0.8)}, transparent)`,
          },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: TOKENS.bgElevated,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 6,
          fontSize: '0.8125rem',
          color: TOKENS.textPrimary,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        },
        arrow: { color: TOKENS.bgElevated },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: TOKENS.border },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 200ms ease',
          '&:hover': {
            backgroundColor: alpha(TOKENS.textPrimary, 0.06),
          },
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: TOKENS.bgSurface,
          backgroundImage: 'none',
          borderBottom: `1px solid ${TOKENS.border}`,
          boxShadow: 'none',
        },
      },
    },
  },
});

export default theme;
