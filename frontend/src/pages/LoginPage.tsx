import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, Button, Typography, Alert } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme';

const LoginPage = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(employeeId);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-base)',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
      }}
    >
      {/* Left branding panel — desktop only */}
      <Box
        sx={{
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 8,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              radial-gradient(circle at 20% 50%, ${alpha(TOKENS.red, 0.07)} 0%, transparent 55%),
              radial-gradient(circle at 80% 20%, ${alpha(TOKENS.gold, 0.05)} 0%, transparent 45%),
              radial-gradient(circle at 60% 80%, ${alpha(TOKENS.red, 0.04)} 0%, transparent 40%)
            `,
          },
        }}
      >
        {/* Logo */}
        <Box
          sx={{
            width: 96,
            height: 96,
            borderRadius: '20px',
            background: `linear-gradient(135deg, ${TOKENS.red} 0%, ${TOKENS.redDim} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            fontWeight: 800,
            color: 'white',
            fontFamily: 'var(--font-display)',
            mb: 4,
            boxShadow: `0 16px 40px ${alpha(TOKENS.red, 0.4)}`,
          }}
        >
          К
        </Box>

        <Typography
          variant="h2"
          sx={{
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            mb: 1,
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          KOMUS
        </Typography>
        <Typography
          variant="h5"
          sx={{
            color: 'var(--color-text-secondary)',
            mb: 2,
            fontWeight: 400,
            textAlign: 'center',
          }}
        >
          BalanceMonitor
        </Typography>
        <Typography
          variant="body1"
          sx={{
            color: 'var(--color-text-muted)',
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 1.7,
          }}
        >
          Система контроля заработка складских сотрудников
        </Typography>

        {/* Decorative dots grid */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 48,
            right: 48,
            width: 120,
            height: 120,
            backgroundImage: `radial-gradient(circle, var(--color-border) 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
            opacity: 0.5,
          }}
        />
      </Box>

      {/* Right form panel */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: { xs: 3, sm: 6 },
          backgroundColor: { lg: 'var(--color-bg-surface)' },
          borderLeft: { lg: '1px solid var(--color-border)' },
        }}
      >
        {/* Mobile logo */}
        <Box
          sx={{
            display: { xs: 'flex', lg: 'none' },
            flexDirection: 'column',
            alignItems: 'center',
            mb: 4,
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '14px',
              background: `linear-gradient(135deg, ${TOKENS.red} 0%, ${TOKENS.redDim} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'white',
              mb: 2,
              boxShadow: `0 8px 24px ${alpha(TOKENS.red, 0.4)}`,
            }}
          >
            К
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
            BalanceMonitor
          </Typography>
        </Box>

        {/* Form card */}
        <Box
          sx={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 3,
            p: { xs: 3, sm: 4 },
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            animation: 'fadeSlideUp 0.4s ease both',
            '@keyframes fadeSlideUp': {
              from: { opacity: 0, transform: 'translateY(20px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, mb: 0.5, color: 'var(--color-text-primary)' }}
          >
            Вход в систему
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)', mb: 3 }}>
            Введите или отсканируйте ШК сотрудника
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="ШК сотрудника"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              autoFocus
              required
              inputProps={{ inputMode: 'numeric' }}
              sx={{ mb: 2.5 }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading || !employeeId}
              sx={{ py: 1.5 }}
            >
              {loading ? 'Выполняется вход...' : 'Войти'}
            </Button>
          </form>

          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 3,
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
            }}
          >
            Тест: 00000001 · 00000002 · 00000099 (admin)
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;
