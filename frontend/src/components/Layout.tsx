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
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  ListAlt,
  AdminPanelSettings,
  Logout,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme';

const SIDEBAR_WIDTH = 240;

const getInitials = (fio: string) =>
  fio
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = [
    { text: 'Дашборд', icon: <Dashboard />, path: '/' },
    { text: 'Операции', icon: <ListAlt />, path: '/operations' },
  ];

  if (user?.role === 'admin') {
    menuItems.push({ text: 'Админ-панель', icon: <AdminPanelSettings />, path: '/admin' });
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
          borderBottom: `1px solid ${TOKENS.border}`,
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
            fontFamily: TOKENS.fontDisplay,
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
            color: TOKENS.textPrimary,
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
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {/* User info + logout */}
      <Box
        sx={{
          borderTop: `1px solid ${TOKENS.border}`,
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
                fontFamily: TOKENS.fontDisplay,
              }}
            >
              {getInitials(user.fio)}
            </Box>
            <Box sx={{ overflow: 'hidden' }}>
              <Typography
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: TOKENS.textPrimary,
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
                  color: TOKENS.textSecondary,
                  fontFamily: TOKENS.fontMono,
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
      {/* Desktop permanent sidebar */}
      <Drawer
        variant="permanent"
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

      {/* Mobile temporary drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
          },
        }}
        ModalProps={{ keepMounted: true }}
      >
        {sidebarContent}
      </Drawer>

      {/* Mobile top AppBar */}
      <AppBar
        position="fixed"
        sx={{
          display: { xs: 'flex', md: 'none' },
          left: 0,
          right: 0,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
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
            }}
          >
            К
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1, fontSize: '1rem' }}>
            BalanceMonitor
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: { xs: 0, md: `${SIDEBAR_WIDTH}px` },
          mt: { xs: '64px', md: 0 },
          p: { xs: 2, sm: 3 },
          minHeight: '100vh',
          backgroundColor: 'background.default',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
