import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
} from '@mui/material';
import { TrendingUp, AccountBalance, CalendarToday } from '@mui/icons-material';
import { salaryAPI, operationsAPI } from '../services/api';
import { format, subDays, startOfMonth, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import SalaryChart from '../components/SalaryChart';
import OperationsDonutChart from '../components/OperationsDonutChart';

const DashboardPage = () => {
  const [period, setPeriod] = useState<'yesterday' | 'month'>('month');
  const [salaryData, setSalaryData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [operationsByType, setOperationsByType] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      // Даты для графика (последний месяц)
      const chartStartDate = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
      const chartEndDate = format(new Date(), 'yyyy-MM-dd');

      const [salaryRes, statsRes, opsRes, chartDataRes] = await Promise.all([
        salaryAPI.getSalary(period),
        salaryAPI.getStats(),
        operationsAPI.getOperationsByType(
          format(period === 'yesterday' ? subDays(new Date(), 1) : startOfMonth(new Date()), 'yyyy-MM-dd'),
          format(new Date(), 'yyyy-MM-dd')
        ),
        // Данные для графика за последний месяц
        salaryAPI.getSalary('custom', chartStartDate, chartEndDate),
      ]);

      setSalaryData(salaryRes.data);
      setStats(statsRes.data);
      setOperationsByType(opsRes.data);
      setChartData(chartDataRes.data.daily_breakdown || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ pb: { xs: 3, md: 0 } }}>
      {/* Заголовок и переключатель периода */}
      <Box sx={{ mb: { xs: 2, md: 3 }, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontSize: { xs: '1.5rem', md: '2rem' } }}>
          Моя зарплата
        </Typography>

        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, value) => value && setPeriod(value)}
          size="medium"
          fullWidth
          sx={{ 
            display: { xs: 'flex', sm: 'inline-flex' },
            '& .MuiToggleButton-root': {
              py: { xs: 1.5, sm: 1 },
              fontSize: { xs: '1rem', sm: '0.875rem' },
              fontWeight: 600,
            }
          }}
        >
          <ToggleButton value="yesterday">Вчера</ToggleButton>
          <ToggleButton value="month">Месяц</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={3}>
        {/* Основная карточка зарплаты */}
        <Grid item xs={12} md={4}>
          <Card 
            sx={{ 
              height: '100%',
              border: '3px solid #E31E24',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 2 } }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1, fontSize: { xs: '1rem', md: '0.875rem' } }}>
                {period === 'yesterday' ? 'Вчера' : 'Текущий месяц'}
              </Typography>
              <Typography 
                variant="h2"
                sx={{ 
                  color: '#E31E24', 
                  fontWeight: 700,
                  mb: 2,
                  fontSize: { xs: '2.5rem', md: '3rem' }
                }}
              >
                {(salaryData?.total_amount || 0).toFixed(2)} ₽
              </Typography>
              <Box sx={{ display: 'flex', gap: { xs: 4, md: 3 }, mt: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                    Операций
                  </Typography>
                  <Typography variant="h5" fontWeight="600" sx={{ fontSize: { xs: '1.5rem', md: '1.25rem' } }}>
                    {salaryData?.operations_count || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                    АЕИ
                  </Typography>
                  <Typography variant="h5" fontWeight="600" sx={{ fontSize: { xs: '1.5rem', md: '1.25rem' } }}>
                    {salaryData?.total_aei || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Статистика за все время */}
        <Grid item xs={12} sm={6} md={4}>
          <Card 
            sx={{ 
              height: '100%',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 2 } }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1, fontSize: { xs: '1rem', md: '0.875rem' } }}>
                За все время
              </Typography>
              <Typography 
                variant="h4" 
                sx={{ 
                  fontWeight: 700,
                  color: 'text.primary',
                  mb: 2,
                  fontSize: { xs: '1.75rem', md: '2.125rem' }
                }}
              >
                {(stats?.total_earned || 0).toFixed(2)} ₽
              </Typography>
              <Box sx={{ display: 'flex', gap: { xs: 4, md: 3 } }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>Дней</Typography>
                  <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>{stats?.total_work_days || 0}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>Операций</Typography>
                  <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>{stats?.total_operations || 0}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Последняя операция */}
        <Grid item xs={12} sm={6} md={4}>
          <Card 
            sx={{ 
              height: '100%',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 2 } }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1, fontSize: { xs: '1rem', md: '0.875rem' } }}>
                Последняя операция
              </Typography>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 600,
                  color: 'text.primary',
                  mb: 2,
                  fontSize: { xs: '1.125rem', md: '1rem' },
                  lineHeight: 1.4
                }}
              >
                {stats?.last_operation_date
                  ? format(new Date(stats.last_operation_date), 'dd MMMM yyyy', { locale: ru })
                  : 'Нет данных'}
              </Typography>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>Среднее за операцию</Typography>
                <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>{(stats?.avg_per_operation || 0).toFixed(2)} ₽</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* График заработка */}
        <Grid item xs={12}>
          <SalaryChart 
            data={chartData} 
            title="Динамика заработка за последний месяц"
          />
        </Grid>

        {/* Операции по типам - Круговая диаграмма */}
        <Grid item xs={12}>
          <OperationsDonutChart data={operationsByType} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;

