import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Container,
} from '@mui/material';
import { QrCodeScanner } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

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
    <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 3 } }}>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          py: { xs: 4, sm: 0 }
        }}
      >
        <Card sx={{ width: '100%', maxWidth: 400, boxShadow: { xs: 'none', sm: 3 } }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 4 } }}>
              <QrCodeScanner sx={{ fontSize: { xs: 80, sm: 60 }, color: 'primary.main', mb: 2 }} />
              <Typography variant="h4" component="h1" gutterBottom sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' }, fontWeight: 700 }}>
                SalaryMonitor
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '1rem', sm: '0.875rem' } }}>
                Войдите, отсканировав штрих-код или введя Employee ID
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleLogin}>
              <TextField
                fullWidth
                label="Employee ID (Штрих-код)"
                variant="outlined"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                autoFocus
                required
                inputProps={{
                  style: { fontSize: '1.125rem' },
                  inputMode: 'numeric'
                }}
                InputLabelProps={{
                  style: { fontSize: '1rem' }
                }}
                sx={{ 
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    fontSize: { xs: '1.125rem', sm: '1rem' },
                    py: { xs: 0.5, sm: 0 }
                  }
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || !employeeId}
                sx={{
                  py: { xs: 2, sm: 1.5 },
                  fontSize: { xs: '1.125rem', sm: '1rem' },
                  fontWeight: 600
                }}
              >
                {loading ? 'Вход...' : 'Войти'}
              </Button>
            </form>

            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '0.75rem' } }}>
                Для теста: 00000001, 00000002, 00000099 (admin)
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default LoginPage;

