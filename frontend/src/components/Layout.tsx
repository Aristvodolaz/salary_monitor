import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
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
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const drawer = (
    <Box sx={{ width: { xs: 280, sm: 250 }, pt: 3 }}>
      <Box sx={{ px: 3, mb: 3, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle1" color="text.primary" sx={{ fontWeight: 600, fontSize: { xs: '1.125rem', sm: '1rem' } }}>
          {user?.fio}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          ID: {user?.employeeId}
        </Typography>
      </Box>

      <List sx={{ px: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => {
                navigate(item.path);
                setDrawerOpen(false);
              }}
              sx={{
                borderRadius: 2,
                py: { xs: 2, sm: 1.5 },
                '&.Mui-selected': {
                  bgcolor: 'rgba(227, 30, 36, 0.1)',
                  '&:hover': {
                    bgcolor: 'rgba(227, 30, 36, 0.15)',
                  }
                }
              }}
            >
              <ListItemIcon sx={{ minWidth: { xs: 48, sm: 40 } }}>
                <Box sx={{ fontSize: { xs: 28, sm: 24 } }}>{item.icon}</Box>
              </ListItemIcon>
              <ListItemText 
                primary={item.text}
                primaryTypographyProps={{
                  fontSize: { xs: '1.125rem', sm: '1rem' },
                  fontWeight: location.pathname === item.path ? 600 : 400
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}

        <ListItem disablePadding sx={{ mt: 2 }}>
          <ListItemButton 
            onClick={handleLogout}
            sx={{
              borderRadius: 2,
              py: { xs: 2, sm: 1.5 },
              color: 'error.main',
            }}
          >
            <ListItemIcon sx={{ minWidth: { xs: 48, sm: 40 }, color: 'error.main' }}>
              <Logout sx={{ fontSize: { xs: 28, sm: 24 } }} />
            </ListItemIcon>
            <ListItemText 
              primary="Выход"
              primaryTypographyProps={{
                fontSize: { xs: '1.125rem', sm: '1rem' },
                fontWeight: 500
              }}
            />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ bgcolor: '#E31E24' }}>
        <Toolbar sx={{ minHeight: { xs: 64, sm: 64 } }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 2, p: { xs: 1.5, sm: 1 } }}
          >
            <MenuIcon sx={{ fontSize: { xs: 28, sm: 24 } }} />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontSize: { xs: '1.25rem', sm: '1.25rem' }, fontWeight: 600 }}>
            SalaryMonitor
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? 'temporary' : 'temporary'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, sm: 3 }, mt: { xs: 8, sm: 8 }, minHeight: '100vh' }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;

