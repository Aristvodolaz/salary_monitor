import { Card, CardContent, Typography, Box, useTheme, Fade, Grow } from '@mui/material';
import {
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { TrendingUp, TrendingDown } from '@mui/icons-material';

interface SalaryChartProps {
  data: Array<{
    date: string;
    total_amount: number;
    operations_count?: number;
  }>;
  title?: string;
}

const SalaryChart: React.FC<SalaryChartProps> = ({ data, title = 'Динамика заработка' }) => {
  const theme = useTheme();

  // Преобразуем данные для графика
  const chartData = data
    .filter(item => item && item.total_amount !== null && item.total_amount !== undefined)
    .map((item) => ({
      date: format(new Date(item.date), 'dd MMM', { locale: ru }),
      fullDate: format(new Date(item.date), 'dd MMMM yyyy', { locale: ru }),
      amount: parseFloat((item.total_amount || 0).toFixed(2)),
      operations: item.operations_count || 0,
    }));

  // Расчет тренда
  const calculateTrend = () => {
    if (chartData.length < 2) return { value: 0, isPositive: true };
    const lastWeek = chartData.slice(-7);
    const prevWeek = chartData.slice(-14, -7);
    if (prevWeek.length === 0) return { value: 0, isPositive: true };
    
    const lastWeekAvg = lastWeek.reduce((sum, d) => sum + d.amount, 0) / lastWeek.length;
    const prevWeekAvg = prevWeek.reduce((sum, d) => sum + d.amount, 0) / prevWeek.length;
    const diff = ((lastWeekAvg - prevWeekAvg) / prevWeekAvg) * 100;
    
    return { value: Math.abs(diff).toFixed(1), isPositive: diff > 0 };
  };

  const trend = calculateTrend();

  // Кастомный тултип
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <Box
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            p: 2,
            boxShadow: 3,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
            {payload[0].payload.fullDate}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.primary.main }}>
            💰 Заработок: {payload[0].value.toLocaleString('ru-RU')} ₽
          </Typography>
          {payload[0].payload.operations > 0 && (
            <Typography variant="body2" color="text.secondary">
              📋 Операций: {payload[0].payload.operations}
            </Typography>
          )}
        </Box>
      );
    }
    return null;
  };

  return (
    <Grow in timeout={800}>
      <Card 
        sx={{ 
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 'none',
        }}
      >
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '1.125rem', md: '1.25rem' } }}>
              {title}
            </Typography>
            
            {/* Индикатор тренда */}
            {chartData.length >= 2 && (
              <Box
                sx={{
                  display: { xs: 'none', sm: 'flex' },
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: trend.isPositive ? 'success.main' : 'error.main',
                  color: trend.isPositive ? 'success.main' : 'error.main',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {trend.isPositive ? <TrendingUp fontSize="small" /> : <TrendingDown fontSize="small" />}
                {trend.value}%
              </Box>
            )}
          </Box>

          {chartData.length > 0 ? (
            <Fade in timeout={1000}>
              <Box>
                <ResponsiveContainer width="100%" height={350}>
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
                  >
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E31E24" stopOpacity={0.9} />
                        <stop offset="50%" stopColor="#E31E24" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#E31E24" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E31E24" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#B71C1C" stopOpacity={0.6} />
                      </linearGradient>
                      <filter id="shadow">
                        <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.3" />
                      </filter>
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke={theme.palette.divider} 
                      opacity={0.3}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: theme.palette.text.secondary, fontSize: 12, fontWeight: 500 }}
                      stroke={theme.palette.divider}
                    />
                    <YAxis
                      tick={{ fill: theme.palette.text.secondary, fontSize: 12, fontWeight: 500 }}
                      stroke={theme.palette.divider}
                      tickFormatter={(value) => `${value.toLocaleString('ru-RU')}`}
                      label={{ 
                        value: '₽', 
                        angle: 0, 
                        position: 'top',
                        offset: 10,
                        style: { fontSize: 14, fontWeight: 600, fill: theme.palette.text.secondary }
                      }}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(102, 126, 234, 0.1)' }} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      name="Заработок"
                      stroke={theme.palette.primary.main}
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorAmount)"
                      animationDuration={1500}
                      animationBegin={200}
                      dot={{ 
                        r: 4, 
                        fill: theme.palette.primary.main,
                        strokeWidth: 2,
                        stroke: '#fff',
                        filter: 'url(#shadow)'
                      }}
                      activeDot={{ 
                        r: 7, 
                        fill: theme.palette.secondary.main,
                        strokeWidth: 3,
                        stroke: '#fff',
                        filter: 'url(#shadow)'
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </Box>
            </Fade>
          ) : (
            <Box sx={{ textAlign: 'center', py: 5 }}>
              <Typography variant="body2" color="text.secondary">
                Нет данных для отображения
              </Typography>
            </Box>
          )}

        {/* Статистика под графиком */}
        {chartData.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 3, pt: 3, borderTop: '1px solid', borderColor: 'divider', gap: { xs: 1, md: 2 } }}>
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', md: '0.75rem' } }}>
                Максимум
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#E31E24', fontSize: { xs: '1rem', md: '1.25rem' } }}>
                {Math.max(...chartData.map(d => d.amount)).toLocaleString('ru-RU')} ₽
              </Typography>
            </Box>
            
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', md: '0.75rem' } }}>
                Средний
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '1rem', md: '1.25rem' } }}>
                {(chartData.reduce((sum, d) => sum + d.amount, 0) / chartData.length).toFixed(2)} ₽
              </Typography>
            </Box>
            
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', md: '0.75rem' } }}>
                Дней
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '1rem', md: '1.25rem' } }}>
                {chartData.length}
              </Typography>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
    </Grow>
  );
};

export default SalaryChart;
