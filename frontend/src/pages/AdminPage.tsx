import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  TextField,
  Button,
  Grid,
} from '@mui/material';
import { Download, Refresh, People, Assignment, Inventory2, AccountBalance } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { adminAPI } from '../services/api';
import { format, subMonths } from 'date-fns';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { PageHeader } from '../components/ui/PageHeader';
import { SkeletonTable } from '../components/ui/SkeletonTable';
import { EmptyState } from '../components/ui/EmptyState';
import { TOKENS } from '../theme';

const getInitials = (fio: string) =>
  fio
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

const AdminPage = () => {
  const [salaryData, setSalaryData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [, salaryRes, statsRes] = await Promise.all([
        adminAPI.getEmployees(),
        adminAPI.getWarehouseSalary(startDate, endDate),
        adminAPI.getStats(),
      ]);

      setSalaryData(salaryRes.data);
      setStats(statsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await adminAPI.exportSalary(startDate, endDate);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `salary_export_${startDate}_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError('Ошибка экспорта данных');
    }
  };

  const statCards = [
    {
      label: 'Активных сотрудников',
      icon: People,
      value: stats?.active_employees || 0,
      color: TOKENS.info,
    },
    {
      label: 'Всего операций',
      icon: Assignment,
      value: stats?.total_operations || 0,
      color: TOKENS.gold,
    },
    {
      label: 'Всего АЕИ',
      icon: Inventory2,
      value: stats?.total_aei || 0,
      color: TOKENS.success,
    },
    {
      label: 'Сумма выплат',
      icon: AccountBalance,
      value: <CurrencyDisplay amount={stats?.total_amount || 0} decimals={0} />,
      color: TOKENS.red,
      hero: true,
    },
  ];

  return (
    <Box>
      <PageHeader title="Админ-панель" />

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Stat cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {statCards.map((card, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Box
              sx={{
                backgroundColor: TOKENS.bgSurface,
                border: `1px solid ${card.hero ? card.color : TOKENS.border}`,
                borderRadius: 2,
                p: 2.5,
                height: '100%',
                ...(card.hero && {
                  boxShadow: `0 0 24px ${alpha(card.color, 0.12)}`,
                }),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    backgroundColor: alpha(card.color, 0.12),
                    border: `1px solid ${alpha(card.color, 0.25)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: card.color,
                  }}
                >
                  <card.icon fontSize="small" />
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: TOKENS.textSecondary,
                  }}
                >
                  {card.label}
                </Typography>
              </Box>
              <Typography
                sx={{
                  fontSize: card.hero ? '1.5rem' : '1.75rem',
                  fontWeight: 700,
                  color: card.hero ? card.color : TOKENS.textPrimary,
                  fontFamily: TOKENS.fontMono,
                  lineHeight: 1.2,
                }}
              >
                {loading ? '—' : card.value}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Filter bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
          mb: 3,
          p: 2,
          backgroundColor: TOKENS.bgSurface,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 2,
        }}
      >
        <TextField
          type="date"
          label="С"
          size="small"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />
        <TextField
          type="date"
          label="По"
          size="small"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />
        <Button variant="contained" size="small" startIcon={<Refresh />} onClick={loadData}>
          Обновить
        </Button>
        <Button
          variant="contained"
          color="secondary"
          size="small"
          startIcon={<Download />}
          onClick={handleExport}
          sx={{ ml: 'auto' }}
        >
          Экспорт CSV
        </Button>
      </Box>

      {/* Employee salary table */}
      <Box
        sx={{
          backgroundColor: TOKENS.bgSurface,
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 3, pt: 2.5, pb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: TOKENS.textPrimary }}>
            Зарплаты сотрудников за период
          </Typography>
        </Box>

        {loading ? (
          <SkeletonTable rows={8} columns={6} />
        ) : salaryData.length === 0 ? (
          <EmptyState
            title="Нет данных за выбранный период"
            description="Попробуйте изменить диапазон дат и обновить"
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Сотрудник</TableCell>
                  <TableCell align="right">Раб. дней</TableCell>
                  <TableCell align="right">Операций</TableCell>
                  <TableCell align="right">АЕИ</TableCell>
                  <TableCell align="right" sx={{ color: `${TOKENS.gold} !important` }}>
                    Сумма
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {salaryData.map((emp) => (
                  <TableRow key={emp.user_id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            backgroundColor: alpha(TOKENS.red, 0.12),
                            border: `1px solid ${alpha(TOKENS.red, 0.25)}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: TOKENS.red,
                            flexShrink: 0,
                            fontFamily: TOKENS.fontDisplay,
                          }}
                        >
                          {getInitials(emp.fio)}
                        </Box>
                        <Box>
                          <Typography
                            sx={{ fontSize: '0.9375rem', fontWeight: 600, color: TOKENS.textPrimary }}
                          >
                            {emp.fio}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '0.75rem',
                              color: TOKENS.textSecondary,
                              fontFamily: TOKENS.fontMono,
                            }}
                          >
                            ШК: {emp.employee_id}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: TOKENS.fontMono }}>
                      {emp.work_days}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: TOKENS.fontMono }}>
                      {emp.total_operations}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: TOKENS.fontMono }}>
                      {emp.total_aei}
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        component="span"
                        sx={{
                          color: TOKENS.gold,
                          fontWeight: 700,
                          fontFamily: TOKENS.fontMono,
                          fontSize: '0.9375rem',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          backgroundColor: alpha(TOKENS.gold, 0.08),
                          display: 'inline-block',
                        }}
                      >
                        <CurrencyDisplay amount={emp.total_amount || 0} variant="compact" />
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
};

export default AdminPage;
