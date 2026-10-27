import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, Button, Typography, Alert, MenuItem } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme';
import { authAPI } from '../services/api';

const LoginPage = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'id' | 'password' | 'register'>('id');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [lastName, setLastName] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string }[]>([]);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const resetToId = () => {
    setStep('id');
    setPassword('');
    setPassword2('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const id = employeeId.trim();
      if (step === 'id') {
        const { data } = await authAPI.check(id);
        if (data.registered) {
          setStep('password');
        } else {
          const res = await authAPI.warehouses();
          setWarehouses(res.data);
          setStep('register');
        }
      } else if (step === 'password') {
        await login(id, password);
        navigate('/');
      } else {
        if (password !== password2) {
          setError('Пароли не совпадают');
          return;
        }
        await register({ employeeId: id, warehouseId: Number(warehouseId), lastName: lastName.trim(), password });
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || err.response?.data?.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  const submitDisabled =
    loading ||
    !employeeId.trim() ||
    (step === 'password' && !password) ||
    (step === 'register' && (!warehouseId || !lastName.trim() || password.length < 6 || !password2));

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
          Система контроля баланса складских сотрудников
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
            {step === 'register' ? 'Регистрация' : 'Вход в систему'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)', mb: 3 }}>
            {step === 'register'
              ? 'Первый вход: подтвердите данные из EWM и задайте пароль'
              : step === 'password'
                ? 'Введите пароль'
                : 'Введите табельный номер сотрудника'}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Табельный номер"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              autoFocus={step === 'id'}
              required
              disabled={step !== 'id'}
              inputProps={{ inputMode: 'numeric' }}
              sx={{ mb: 2.5 }}
            />
            {step === 'register' && (
              <>
                <TextField
                  select
                  fullWidth
                  label="Склад"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(Number(e.target.value))}
                  required
                  sx={{ mb: 2.5 }}
                >
                  {warehouses.map((w) => (
                    <MenuItem key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth
                  label="Фамилия"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoFocus
                  sx={{ mb: 2.5 }}
                />
              </>
            )}
            {step !== 'id' && (
              <TextField
                fullWidth
                type="password"
                label={step === 'register' ? 'Придумайте пароль (от 6 символов)' : 'Пароль'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={step === 'password'}
                required
                autoComplete={step === 'register' ? 'new-password' : 'current-password'}
                sx={{ mb: 2.5 }}
              />
            )}
            {step === 'register' && (
              <TextField
                fullWidth
                type="password"
                label="Повторите пароль"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                autoComplete="new-password"
                sx={{ mb: 2.5 }}
              />
            )}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={submitDisabled}
              sx={{ py: 1.5 }}
            >
              {loading
                ? 'Подождите...'
                : step === 'id'
                  ? 'Далее'
                  : step === 'password'
                    ? 'Войти'
                    : 'Зарегистрироваться'}
            </Button>
          </form>

          {step !== 'id' && (
            <Button fullWidth size="small" sx={{ mt: 2 }} onClick={resetToId}>
              Другой табельный номер
            </Button>
          )}

        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;
