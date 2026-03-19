import { useState, useEffect } from 'react';
import { Box, Grid, Alert } from '@mui/material';
import { salaryAPI, operationsAPI } from '../services/api';
import { format, startOfMonth, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import SalaryChart from '../components/SalaryChart';
import OperationsDonutChart from '../components/OperationsDonutChart';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { StatCard } from '../components/ui/StatCard';
import { PageHeader } from '../components/ui/PageHeader';

const DashboardPage = () => {
  const [yesterdayData, setYesterdayData] = useState<any>(null);
  const [currentMonthData, setCurrentMonthData] = useState<any>(null);
  const [previousMonthData, setPreviousMonthData] = useState<any>(null);
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
      const chartStartDate = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
      const chartEndDate = format(new Date(), 'yyyy-MM-dd');

      const prevMonthStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
      const prevMonthEnd = format(
        new Date(new Date().getFullYear(), new Date().getMonth(), 0),
        'yyyy-MM-dd',
      );

      const [yesterdayRes, currentMonthRes, prevMonthRes, opsRes, chartDataRes] = await Promise.all([
        salaryAPI.getSalary('yesterday'),
        salaryAPI.getSalary('month'),
        salaryAPI.getSalary('custom', prevMonthStart, prevMonthEnd),
        operationsAPI.getOperationsByType(
          format(startOfMonth(new Date()), 'yyyy-MM-dd'),
          format(new Date(), 'yyyy-MM-dd'),
        ),
        salaryAPI.getSalary('custom', chartStartDate, chartEndDate),
      ]);

      setYesterdayData(yesterdayRes.data);
      setCurrentMonthData(currentMonthRes.data);
      setPreviousMonthData(prevMonthRes.data.summary || prevMonthRes.data);
      setOperationsByType(opsRes.data);
      setChartData(chartDataRes.data.daily_breakdown || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>;
  }

  const currentMonth = format(new Date(), 'LLLL yyyy', { locale: ru });
  const prevMonthLabel = format(subMonths(new Date(), 1), 'LLLL', { locale: ru });

  return (
    <Box sx={{ pb: { xs: 10, md: 3 } }}>
      <PageHeader title="Мой баланс" subtitle={currentMonth} />

      <Grid container spacing={3}>
        {/* Hero — текущий месяц (8/12 на md+) */}
        <Grid item xs={12} md={8}>
          <StatCard
            label="Текущий месяц"
            variant="hero"
            loading={loading}
            value={
              <CurrencyDisplay
                amount={currentMonthData?.total_amount || 0}
                variant="large"
              />
            }
            subStats={[
              { label: 'Операций', value: currentMonthData?.operations_count || 0 },
              { label: 'АЕИ', value: currentMonthData?.total_aei || 0 },
            ]}
          />
        </Grid>

        {/* Secondary column (4/12 на md+) */}
        <Grid item xs={12} md={4}>
          <Grid container spacing={3}>
            <Grid item xs={6} md={12}>
              <StatCard
                label="Вчера"
                variant="default"
                loading={loading}
                value={
                  <CurrencyDisplay
                    amount={yesterdayData?.total_amount || 0}
                    variant="default"
                  />
                }
                subStats={[
                  { label: 'Операций', value: yesterdayData?.operations_count || 0 },
                  { label: 'АЕИ', value: yesterdayData?.total_aei || 0 },
                ]}
              />
            </Grid>
            <Grid item xs={6} md={12}>
              <StatCard
                label={prevMonthLabel}
                variant="muted"
                loading={loading}
                value={
                  <CurrencyDisplay
                    amount={previousMonthData?.total_amount || 0}
                    variant="default"
                  />
                }
                subStats={[
                  { label: 'Операций', value: previousMonthData?.operations_count || 0 },
                  { label: 'АЕИ', value: previousMonthData?.total_aei || 0 },
                ]}
              />
            </Grid>
          </Grid>
        </Grid>

        {/* Chart */}
        <Grid item xs={12}>
          <SalaryChart
            data={chartData}
            title="Динамика заработка за последний месяц"
          />
        </Grid>

        {/* Donut */}
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
