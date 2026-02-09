import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
// Icons removed - not used in current implementation
import { salaryAPI, operationsAPI } from '../services/api';
import { format, startOfMonth, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import SalaryChart from '../components/SalaryChart';
import OperationsDonutChart from '../components/OperationsDonutChart';
import CurrencyDisplay from '../components/CurrencyDisplay';

const DashboardPage = () => {
  // Three separate salary data states for 3 periods
  const [yesterdayData, setYesterdayData] = useState<any>(null);
  const [currentMonthData, setCurrentMonthData] = useState<any>(null);
  const [previousMonthData, setPreviousMonthData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [operationsByType, setOperationsByType] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      // Calculate date ranges
      const chartStartDate = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
      const chartEndDate = format(new Date(), 'yyyy-MM-dd');
      
      // Previous month range
      const prevMonthStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
      const prevMonthEnd = format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd');

      // Fetch all data in parallel
      const [yesterdayRes, currentMonthRes, prevMonthRes, statsRes, opsRes, chartDataRes] = await Promise.all([
        salaryAPI.getSalary('yesterday'),
        salaryAPI.getSalary('month'),
        salaryAPI.getSalary('custom', prevMonthStart, prevMonthEnd),
        salaryAPI.getStats(),
        operationsAPI.getOperationsByType(
          format(startOfMonth(new Date()), 'yyyy-MM-dd'),
          format(new Date(), 'yyyy-MM-dd')
        ),
        // Chart data for last month
        salaryAPI.getSalary('custom', chartStartDate, chartEndDate),
      ]);

      setYesterdayData(yesterdayRes.data);
      setCurrentMonthData(currentMonthRes.data);
      setPreviousMonthData(prevMonthRes.data.summary || prevMonthRes.data);
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
      {/* Заголовок */}
      <Box sx={{ mb: { xs: 2, md: 3 } }}>
        <Typography variant="h5" component="h1" sx={{ fontSize: { xs: '1.5rem', md: '2rem' } }}>
          Мой баланс
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Карточка 1: Вчера */}
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
                Вчера
              </Typography>
              <Typography 
                variant="h2"
                sx={{ 
                  color: '#E31E24', 
                  fontWeight: 700,
                  mb: 2,
                  fontSize: { xs: '2rem', md: '2.5rem' }
                }}
              >
                <CurrencyDisplay amount={yesterdayData?.total_amount || 0} variant="large" />
              </Typography>
              <Box sx={{ display: 'flex', gap: { xs: 4, md: 3 }, mt: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                    Операций
                  </Typography>
                  <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>
                    {yesterdayData?.operations_count || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                    АЕИ
                  </Typography>
                  <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>
                    {yesterdayData?.total_aei || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Карточка 2: Текущий месяц */}
        <Grid item xs={12} sm={6} md={4}>
          <Card 
            sx={{ 
              height: '100%',
              border: '3px solid #E31E24',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 2 } }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1, fontSize: { xs: '1rem', md: '0.875rem' } }}>
                Текущий месяц
              </Typography>
              <Typography 
                variant="h2"
                sx={{ 
                  color: '#E31E24', 
                  fontWeight: 700,
                  mb: 2,
                  fontSize: { xs: '2rem', md: '2.5rem' }
                }}
              >
                <CurrencyDisplay amount={currentMonthData?.total_amount || 0} variant="large" />
              </Typography>
              <Box sx={{ display: 'flex', gap: { xs: 4, md: 3 }, mt: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                    Операций
                  </Typography>
                  <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>
                    {currentMonthData?.operations_count || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                    АЕИ
                  </Typography>
                  <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>
                    {currentMonthData?.total_aei || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Карточка 3: Предыдущий месяц */}
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
                Предыдущий месяц
              </Typography>
              <Typography 
                variant="h2"
                sx={{ 
                  color: 'text.primary', 
                  fontWeight: 700,
                  mb: 2,
                  fontSize: { xs: '2rem', md: '2.5rem' }
                }}
              >
                <CurrencyDisplay amount={previousMonthData?.total_amount || 0} variant="large" />
              </Typography>
              <Box sx={{ display: 'flex', gap: { xs: 4, md: 3 }, mt: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                    Операций
                  </Typography>
                  <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>
                    {previousMonthData?.operations_count || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                    АЕИ
                  </Typography>
                  <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>
                    {previousMonthData?.total_aei || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Статистика за все время */}
        <Grid item xs={12} sm={6} md={6}>
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
                <CurrencyDisplay amount={stats?.total_earned || 0} variant="large" />
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
        <Grid item xs={12} sm={6} md={6}>
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
                <Typography variant="h6" fontWeight="600" sx={{ fontSize: { xs: '1.25rem', md: '1rem' } }}>
                  <CurrencyDisplay amount={stats?.avg_per_operation || 0} />
                </Typography>
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
          <OperationsDonutChart 
            data={operationsByType} 
            period={`текущий месяц (с ${format(startOfMonth(new Date()), 'dd.MM.yyyy', { locale: ru })})`}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;

