import { Card, CardContent, Typography, Box, Fade, Grow, Tooltip as MuiTooltip } from '@mui/material';
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
import { TrendingUp, TrendingDown, InfoOutlined } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import CurrencyDisplay from './CurrencyDisplay';

interface SalaryChartProps {
  data: Array<{
    date: string;
    total_amount: number;
    operations_count?: number;
  }>;
  title?: string;
}

const SalaryChart: React.FC<SalaryChartProps> = ({ data, title = 'Динамика заработка' }) => {
  const muiTheme = useTheme();
  const textSecondary = muiTheme.palette.text.secondary;
  const borderColor = muiTheme.palette.divider;
  const bgBase = muiTheme.palette.background.default;
  const primaryColor = muiTheme.palette.primary.main;
  const accentColor = muiTheme.palette.secondary.main;
  const successColor = muiTheme.palette.success.main;
  const errorColor = muiTheme.palette.error.main;

  const chartData = data
    .filter((item) => item && item.total_amount !== null && item.total_amount !== undefined)
    .map((item) => ({
      date: format(new Date(item.date), 'dd MMM', { locale: ru }),
      fullDate: format(new Date(item.date), 'dd MMMM yyyy', { locale: ru }),
      amount: parseFloat((item.total_amount || 0).toFixed(2)),
      operations: item.operations_count || 0,
    }));

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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <Box
          sx={{
            backgroundColor: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            p: 2,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, mb: 1, color: 'var(--color-text-primary)' }}
          >
            {payload[0].payload.fullDate}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'var(--color-gold)',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mb: 0.5,
            }}
          >
            Заработок: <CurrencyDisplay amount={payload[0].value} />
          </Typography>
          {payload[0].payload.operations > 0 && (
            <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)' }}>
              Операций: {payload[0].payload.operations}
            </Typography>
          )}
        </Box>
      );
    }
    return null;
  };

  return (
    <Grow in timeout={800}>
      <Card>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 1,
              mb: 3,
            }}
          >
            <Typography
              variant="h6"
              sx={{ fontWeight: 600, color: 'var(--color-text-primary)' }}
            >
              {title}
            </Typography>

            {chartData.length >= 2 && (
              <MuiTooltip
                title="Изменение среднего заработка за последнюю неделю по сравнению с предыдущей"
                arrow
              >
                <Box
                  sx={{
                    display: { xs: 'none', sm: 'flex' },
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 99,
                    border: '1px solid',
                    borderColor: trend.isPositive
                      ? alpha(successColor, 0.4)
                      : alpha(errorColor, 0.4),
                    backgroundColor: trend.isPositive
                      ? alpha(successColor, 0.08)
                      : alpha(errorColor, 0.08),
                    color: trend.isPositive ? 'var(--color-success)' : 'var(--color-error)',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    cursor: 'help',
                  }}
                >
                  {trend.isPositive ? (
                    <TrendingUp fontSize="small" />
                  ) : (
                    <TrendingDown fontSize="small" />
                  )}
                  {trend.value}%
                  <InfoOutlined sx={{ fontSize: '0.875rem', ml: 0.3, opacity: 0.6 }} />
                </Box>
              </MuiTooltip>
            )}
          </Box>

          {chartData.length > 0 ? (
            <Fade in timeout={1000}>
              <Box>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart
                    data={chartData}
                    role="img"
                    aria-label={title}
                    margin={{ top: 16, right: 16, left: 0, bottom: 16 }}
                  >
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={primaryColor} stopOpacity={0.6} />
                        <stop offset="60%" stopColor={primaryColor} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                      </linearGradient>
                      <filter id="shadow">
                        <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.25" />
                      </filter>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={borderColor}
                      opacity={0.6}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: textSecondary, fontSize: 12, fontWeight: 500 }}
                      stroke={borderColor}
                    />
                    <YAxis
                      tick={{ fill: textSecondary, fontSize: 12, fontWeight: 500 }}
                      stroke={borderColor}
                      tickFormatter={(value) => value.toLocaleString('ru-RU')}
                      label={{
                        value: 'руб.',
                        angle: 0,
                        position: 'top',
                        offset: 10,
                        style: { fontSize: 13, fontWeight: 600, fill: textSecondary },
                      }}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ fill: alpha(primaryColor, 0.06) }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      name="Заработок"
                      stroke={primaryColor}
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorAmount)"
                      animationDuration={1500}
                      animationBegin={200}
                      dot={{
                        r: 4,
                        fill: primaryColor,
                        strokeWidth: 2,
                        stroke: bgBase,
                        filter: 'url(#shadow)',
                      }}
                      activeDot={{
                        r: 7,
                        fill: accentColor,
                        strokeWidth: 3,
                        stroke: bgBase,
                        filter: 'url(#shadow)',
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </Box>
            </Fade>
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)' }}>
                Нет данных для отображения
              </Typography>
            </Box>
          )}

          {chartData.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-around',
                mt: 3,
                pt: 3,
                borderTop: '1px solid var(--color-border)',
                gap: { xs: 1, md: 2 },
              }}
            >
              {[
                {
                  label: 'Максимум',
                  value: <CurrencyDisplay amount={Math.max(...chartData.map((d) => d.amount))} />,
                  colorVar: 'var(--color-gold)',
                },
                {
                  label: 'Средний',
                  value: (
                    <CurrencyDisplay
                      amount={chartData.reduce((sum, d) => sum + d.amount, 0) / chartData.length}
                    />
                  ),
                  colorVar: 'var(--color-text-primary)',
                },
                {
                  label: 'Дней',
                  value: chartData.length,
                  colorVar: 'var(--color-text-primary)',
                },
              ].map((stat, i) => (
                <Box key={i} sx={{ textAlign: 'center', flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      mb: 0.5,
                    }}
                  >
                    {stat.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      color: stat.colorVar,
                      fontSize: { xs: '0.9375rem', md: '1.0625rem' },
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {stat.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Grow>
  );
};

export default SalaryChart;
