import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OperationsPage from './pages/OperationsPage';
import AdminPage from './pages/AdminPage';
import Layout from './components/Layout';

function App() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === 'admin';

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 1.5,
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <CircularProgress size={28} />
        <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)' }}>
          Загрузка...
        </Typography>
      </Box>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to={isAdmin ? '/admin' : '/'} />} />
      
      <Route element={<Layout />}>
        <Route
          path="/"
          element={user ? (isAdmin ? <Navigate to="/admin" replace /> : <DashboardPage />) : <Navigate to="/login" />}
        />
        <Route
          path="/operations"
          element={user ? (isAdmin ? <Navigate to="/admin" replace /> : <OperationsPage />) : <Navigate to="/login" />}
        />
        <Route 
          path="/admin" 
          element={user?.role === 'admin' ? <AdminPage /> : <Navigate to="/" />} 
        />
      </Route>
    </Routes>
  );
}

export default App;

