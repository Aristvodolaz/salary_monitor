import { Card, CardContent, Typography, Box, Grow } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { alpha } from '@mui/material/styles';
import CurrencyDisplay from './CurrencyDisplay';
import { TOKENS } from '../theme';

interface OperationsDonutChartProps {
  data: Array<{
    operation_type: string;
    total_amount: number;
    operations_count: number;
    total_aei: number;
  }>;
  period?: string;
}

const COLORS = [
  '#E31E24',  // KOMUS Red
  '#F59E0B',  // Gold
  '#10B981',  // Emerald
  '#3B82F6',  // Blue
  '#8B5CF6',  // Violet
  '#EC4899',  // Pink
  '#06B6D4',  // Cyan
  '#F97316',  // Orange
];

const OperationsDonutChart: React.FC<OperationsDonutChartProps> = ({
  data,
  period = 'текущий месяц',
}) => {
  const chartData = data
    .filter(
      (item) =>
        item && item.total_amount !== null && item.total_amount !== undefined && item.total_amount > 0,
    )
    .map((item, index) => ({
      name: item.operation_type,
      value: parseFloat((item.total_amount || 0).toFixed(2)),
      operations: item.operations_count || 0,
      aei: item.total_aei || 0,
      color: COLORS[index % COLORS.length],
    }));

  const totalAmount = chartData.reduce((sum, item) => sum + item.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const percentage = ((d.value / totalAmount) * 100).toFixed(1);

      return (
        <Box
          sx={{
            backgroundColor: TOKENS.bgElevated,
            border: `2px solid ${d.color}`,
            borderRadius: 2,
            p: 2,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: 180,
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, mb: 1, color: d.color }}
          >
            {d.name}
          </Typography>
          <Typography
            variant="body2"
            sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: TOKENS.textPrimary }}
          >
            <CurrencyDisplay amount={d.value} />
            <Box component="span" sx={{ color: TOKENS.textSecondary, ml: 0.5 }}>
              ({percentage}%)
            </Box>
          </Typography>
          <Typography variant="body2" sx={{ color: TOKENS.textSecondary }}>
            Операций: {d.operations} · АЕИ: {d.aei}
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;

    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 28;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill={TOKENS.textSecondary}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '12px', fontWeight: 600, fontFamily: TOKENS.fontMono }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Grow in timeout={1000}>
      <Card>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: TOKENS.textPrimary }}>
              Расценки за операции
            </Typography>
            <Typography variant="caption" sx={{ color: TOKENS.textSecondary }}>
              Период: {period}
            </Typography>
          </Box>

          {chartData.length > 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: { xs: 'stretch', md: 'center' },
                gap: 3,
              }}
            >
              {/* Donut chart */}
              <Box
                sx={{
                  flex: { xs: 'none', md: 1 },
                  width: '100%',
                  minHeight: { xs: 250, md: 280 },
                }}
              >
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomLabel}
                      outerRadius={100}
                      innerRadius={62}
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={1400}
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          style={{
                            filter: `drop-shadow(0 4px 8px ${alpha(entry.color, 0.3)})`,
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>

              {/* Legend */}
              <Box sx={{ flex: { xs: 'none', md: 1 }, width: '100%' }}>
                {chartData.map((item) => (
                  <Box
                    key={item.name}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 1.5,
                      py: 1.25,
                      mb: 0.75,
                      borderRadius: 1.5,
                      border: `1px solid ${TOKENS.border}`,
                      transition: 'all 200ms ease',
                      cursor: 'default',
                      '&:hover': {
                        backgroundColor: alpha(item.color, 0.07),
                        borderColor: alpha(item.color, 0.35),
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: item.color,
                          flexShrink: 0,
                          boxShadow: `0 0 6px ${alpha(item.color, 0.6)}`,
                        }}
                      />
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, color: TOKENS.textPrimary, lineHeight: 1.3 }}
                        >
                          {item.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: TOKENS.textSecondary, fontSize: '0.75rem' }}
                        >
                          {item.operations} операций
                        </Typography>
                      </Box>
                    </Box>
                    <Typography
                      sx={{
                        fontWeight: 700,
                        color: item.color,
                        fontFamily: TOKENS.fontMono,
                        fontSize: '0.9375rem',
                        whiteSpace: 'nowrap',
                        ml: 1,
                      }}
                    >
                      <CurrencyDisplay amount={item.value} variant="compact" />
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="body2" sx={{ color: TOKENS.textSecondary }}>
                Нет данных для отображения
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Grow>
  );
};

export default OperationsDonutChart;
