import { Card, CardContent, Typography, Box, useTheme, Grow } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import CurrencyDisplay from './CurrencyDisplay';

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
  '#E31E24',  // Красный КОМУС
  '#DC143C',  // Crimson
  '#FF6B6B',  // Светло-красный
  '#C41E3A',  // Кардинал
  '#B71C1C',  // Темно-красный
  '#EF5350',  // Коралловый
  '#E53935',  // Красный
  '#D32F2F',  // Глубокий красный
];

const OperationsDonutChart: React.FC<OperationsDonutChartProps> = ({ data, period = 'текущий месяц' }) => {
  const theme = useTheme();

  const chartData = data
    .filter(item => item && item.total_amount !== null && item.total_amount !== undefined && item.total_amount > 0)
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
      const data = payload[0].payload;
      const percentage = ((data.value / totalAmount) * 100).toFixed(1);
      
      return (
        <Box
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            border: `2px solid ${data.color}`,
            borderRadius: 3,
            p: 2,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: data.color }}>
            {data.name}
          </Typography>
          <Typography variant="body2" sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CurrencyDisplay amount={data.value} /> ({percentage}%)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            📋 Операций: {data.operations} | АЕИ: {data.aei}
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // Не показывать метки для маленьких сегментов
    
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 30;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill={theme.palette.text.primary}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '14px', fontWeight: 600 }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Grow in timeout={1000}>
      <Card
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 'none',
        }}
      >
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '1.125rem', md: '1.25rem' } }}>
              Расценки за операции
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
              Период: {period}
            </Typography>
          </Box>

          {chartData.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: 3 }}>
              {/* Круговая диаграмма */}
              <Box sx={{ flex: { xs: 'none', md: 1 }, width: '100%', minHeight: { xs: 250, md: 300 } }}>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomLabel}
                      outerRadius={100}
                      innerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={1500}
                    >
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color}
                          style={{
                            filter: 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.2))',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>

              {/* Легенда с детализацией */}
              <Box sx={{ flex: { xs: 'none', md: 1 }, width: '100%' }}>
                {chartData.map((item) => (
                  <Box
                    key={item.name}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: { xs: 2, md: 1.5 },
                      mb: 1,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      minHeight: { xs: 60, md: 'auto' },
                      '&:active': {
                        bgcolor: `${item.color}08`,
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, md: 1.5 } }}>
                      <Box
                        sx={{
                          width: { xs: 16, md: 12 },
                          height: { xs: 16, md: 12 },
                          borderRadius: '50%',
                          backgroundColor: item.color,
                          flexShrink: 0,
                        }}
                      />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '1rem', md: '0.875rem' } }}>
                          {item.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' } }}>
                          {item.operations} операций
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 600, fontSize: { xs: '1.125rem', md: '1rem' }, whiteSpace: 'nowrap' }}>
                      <CurrencyDisplay amount={item.value} />
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 5 }}>
              <Typography variant="body2" color="text.secondary">
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
