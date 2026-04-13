import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Dashboard,
  ListAlt,
  AdminPanelSettings,
  Rule,
  Logout,
  LightMode,
  DarkMode,
  SettingsBrightness,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext';
import { useThemeContext } from '../context/ThemeContext';
import { TOKENS } from '../theme';
import { useEffect, useState } from 'react';
import CommandPalette from './CommandPalette';

const SIDEBAR_WIDTH = 240;

const getInitials = (fio: string) =>
  fio
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

// ── Theme Toggle Button ────────────────────────────────────────────────────────
const ThemeToggleButton = () => {
  const { mode, toggleMode } = useThemeContext();

  const icon =
    mode === 'dark' ? <LightMode fontSize="small" /> :
    mode === 'light' ? <SettingsBrightness fontSize="small" /> :
    <DarkMode fontSize="small" />;

  const tooltip =
    mode === 'dark' ? 'Светлая тема' :
    mode === 'light' ? 'Системная тема' :
    'Тёмная тема';

  return (
    <Tooltip title={tooltip}>
      <IconButton
        onClick={toggleMode}
        size="small"
        sx={{ color: 'var(--color-text-secondary)' }}
        aria-label={tooltip}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );
};

// ── Layout ─────────────────────────────────────────────────────────────────────
const Layout = () => {
  const { user, logout } = useAuth();
  const { toggleMode } = useThemeContext();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const [paletteOpen, setPaletteOpen] = useState(false);

  const menuItems = isAdmin
    ? [
        { text: 'Админ-панель', icon: <AdminPanelSettings />, path: '/admin' },
        { text: 'Нормативы WCR', icon: <Rule />, path: '/norms' },
      ]
    : [
        { text: 'Дашборд', icon: <Dashboard />, path: '/' },
        { text: 'Операции', icon: <ListAlt />, path: '/operations' },
      ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isCmdK) return;
      event.preventDefault();
      setPaletteOpen((prev) => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const sidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: SIDEBAR_WIDTH,
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          px: 2.5,
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            background: `linear-gradient(135deg, ${TOKENS.red} 0%, ${TOKENS.redDim} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 800,
            fontSize: '0.875rem',
            fontFamily: 'var(--font-display)',
            flexShrink: 0,
            boxShadow: `0 2px 8px ${alpha(TOKENS.red, 0.4)}`,
          }}
        >
          К
        </Box>
        <Typography
          sx={{
            ml: 1.5,
            fontWeight: 700,
            fontSize: '1rem',
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          BalanceMonitor
        </Typography>
      </Box>

      {/* Nav items */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5 }}>
        <List disablePadding>
          {menuItems.map((item) => (
            <ListItemButton
              key={item.path}
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {/* Theme toggle */}
      <Box sx={{ px: 2, pb: 1 }}>
        <Divider sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
            Тема
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              component="button"
              onClick={() => setPaletteOpen(true)}
              sx={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-elevated)',
                borderRadius: 1,
                px: 0.75,
                py: 0.25,
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                '&:hover': { borderColor: 'var(--color-border-hover)', color: 'var(--color-text-secondary)' },
              }}
            >
              Ctrl+K
            </Typography>
            <ThemeToggleButton />
          </Box>
        </Box>
      </Box>

      {/* User info + logout */}
      <Box
        sx={{
          borderTop: '1px solid var(--color-border)',
          p: 2,
          flexShrink: 0,
        }}
      >
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${TOKENS.red} 0%, ${TOKENS.redDim} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'white',
                flexShrink: 0,
                fontFamily: 'var(--font-display)',
              }}
            >
              {getInitials(user.fio)}
            </Box>
            <Box sx={{ overflow: 'hidden' }}>
              <Typography
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.fio}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                ШК: {user.employeeId}
              </Typography>
            </Box>
          </Box>
        )}

        <ListItemButton
          onClick={handleLogout}
          sx={{
            borderRadius: 2,
            px: 1.5,
            py: 1,
            mx: 0,
            width: '100%',
            color: TOKENS.error,
            '&:hover': {
              backgroundColor: alpha(TOKENS.error, 0.08),
            },
            '& .MuiListItemIcon-root': {
              color: TOKENS.error,
              minWidth: 36,
            },
          }}
        >
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Выйти"
            primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
          />
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 'auto',
          width: 1,
          height: 1,
          overflow: 'hidden',
          '&:focus': {
            left: 12,
            top: 12,
            width: 'auto',
            height: 'auto',
            zIndex: (theme) => theme.zIndex.tooltip + 1,
            px: 1.5,
            py: 0.75,
            borderRadius: 1,
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            textDecoration: 'none',
          },
        }}
      >
        Перейти к основному контенту
      </Box>

      {/* Desktop permanent sidebar */}
      <Drawer
        variant="permanent"
        aria-label="Боковая навигация"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            position: 'fixed',
            height: '100vh',
            top: 0,
            left: 0,
          },
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* Mobile top AppBar — logo + title + theme toggle (no hamburger) */}
      <AppBar
        position="fixed"
        aria-label="Верхняя панель"
        sx={{
          display: { xs: 'flex', md: 'none' },
          left: 0,
          right: 0,
        }}
      >
        <Toolbar sx={{ minHeight: 56, px: 2 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '6px',
              background: `linear-gradient(135deg, ${TOKENS.red} 0%, ${TOKENS.redDim} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 800,
              fontSize: '0.75rem',
              mr: 1.5,
              flexShrink: 0,
            }}
          >
            К
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1, fontSize: '1rem' }}>
            BalanceMonitor
          </Typography>
          <ThemeToggleButton />
        </Toolbar>
      </AppBar>

      {/* Main content */}
      <Box
        id="main-content"
        component="main"
        sx={{
          flexGrow: 1,
          ml: { xs: 0, md: `${SIDEBAR_WIDTH}px` },
          mt: { xs: '56px', md: 0 },
          mb: { xs: '56px', md: 0 },
          p: { xs: 2, sm: 3 },
          minHeight: '100vh',
          backgroundColor: 'background.default',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1360, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>

      {/* Mobile bottom navigation */}
      <Paper
        component="nav"
        aria-label="Нижняя навигация"
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          borderTop: '1px solid var(--color-border)',
          borderRadius: 0,
        }}
        elevation={0}
      >
        <BottomNavigation
          value={location.pathname}
          onChange={(_, newPath) => {
            if (newPath !== '__logout__') navigate(newPath);
          }}
        >
          {!isAdmin && (
            <BottomNavigationAction
              label="Дашборд"
              icon={<Dashboard />}
              value="/"
              aria-label="Перейти на дашборд"
            />
          )}
          {!isAdmin && (
            <BottomNavigationAction
              label="Операции"
              icon={<ListAlt />}
              value="/operations"
              aria-label="Перейти на операции"
            />
          )}
          {isAdmin && (
            <BottomNavigationAction
              label="Админ"
              icon={<AdminPanelSettings />}
              value="/admin"
              aria-label="Перейти в админ-панель"
            />
          )}
          {isAdmin && (
            <BottomNavigationAction
              label="Нормативы"
              icon={<Rule />}
              value="/norms"
              aria-label="Перейти на нормативы WCR"
            />
          )}
          <BottomNavigationAction
            label="Выйти"
            icon={<Logout />}
            value="__logout__"
            onClick={handleLogout}
            aria-label="Выйти из аккаунта"
            sx={{
              color: `${alpha(TOKENS.error, 0.8)} !important`,
              '&.Mui-selected': { color: `${TOKENS.error} !important` },
            }}
          />
        </BottomNavigation>
      </Paper>
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        isAdmin={isAdmin}
        currentPath={location.pathname}
        onNavigate={(path: string) => navigate(path)}
        onLogout={handleLogout}
        onToggleTheme={toggleMode}
      />
    </Box>
  );
};

export default Layout;
