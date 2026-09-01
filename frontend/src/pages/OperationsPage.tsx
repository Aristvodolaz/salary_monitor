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
  TablePagination,
  Alert,
  TextField,
  Button,
  useMediaQuery,
  TableSortLabel,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import { Search, FilterAltOff, Refresh } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { operationsAPI, salaryAPI } from '../services/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { SkeletonTable } from '../components/ui/SkeletonTable';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/SkeletonCard';

const monthStart = () => format(startOfMonth(new Date()), 'yyyy-MM-dd');
const monthEnd = () => format(endOfMonth(new Date()), 'yyyy-MM-dd');

interface OperationRow {
  operation_id: string | number;
  operation_date: string;
  operation_type: string;
  aei_count: number;
  prod_count?: number;
  is_picking?: boolean | number;
  rate: number;
  base_amount: number;
}

interface PeriodSummary {
  total_amount: number;
  operations_count: number;
  total_aei: number;
}

interface TypeShare {
  operation_type: string;
  total_amount: number;
  operations_count: number;
}

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Комплектация: АЕИ × ставка норм. Сортировка / прочие АЕИ: АЕИ × тариф. */
const earningFormula = (op: OperationRow): string | null => {
  const rate = Number(op.rate || 0);
  const aei = Number(op.aei_count || 0);
  if (rate <= 0 || aei <= 0) return null;
  return `${aei} АЕИ × ${fmtMoney(rate)}`;
};

const isPickingOp = (op: OperationRow) => {
  if (op.is_picking === 1 || op.is_picking === true) return true;
  if (op.is_picking === 0 || op.is_picking === false) return false;
  return /комплект/i.test(op.operation_type || '');
};

// ── Operation Card (mobile view) ───────────────────────────────────────────
const OperationCard = ({ op }: { op: OperationRow }) => {
  const isLarge = (op.base_amount || 0) >= 10000;
  const formula = earningFormula(op);
  const picking = isPickingOp(op);
  const prod = Number(op.prod_count || 0);

  return (
    <Box
      sx={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderLeft: '3px solid var(--color-gold)',
        borderRadius: '0 8px 8px 0',
        overflow: 'hidden',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        '&:hover': {
          borderColor: 'var(--color-border-hover)',
          borderLeftColor: 'var(--color-gold)',
          boxShadow: '0 2px 12px var(--color-gold-glow)',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1.5,
          pt: 1.25,
          pb: 0.75,
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <Typography
          sx={{
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)',
            lineHeight: 1,
          }}
        >
          {format(new Date(op.operation_date), 'dd.MM.yyyy HH:mm')}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)',
            opacity: 0.6,
          }}
        >
          #{op.operation_id}
        </Typography>
      </Box>

      <Box sx={{ px: 1.5, pt: 1, pb: 1.25 }}>
        <Typography
          sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
            mb: 1,
          }}
        >
          {op.operation_type}
        </Typography>

        <Typography
          sx={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-gold)',
            mb: 0.5,
          }}
        >
          Заработано
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 1,
            backgroundColor: 'var(--color-gold-muted)',
            borderRadius: 1.5,
            px: 1.25,
            py: isLarge ? 0.75 : 0.5,
            mb: 1,
            fontSize: isLarge ? '1.0625rem' : '0.875rem',
            fontWeight: 700,
            color: 'var(--color-gold)',
          }}
        >
          <CurrencyDisplay
            amount={op.base_amount || 0}
            variant={isLarge ? 'default' : 'compact'}
            unit="К"
          />
          {formula && (
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                fontWeight: 500,
              }}
            >
              {formula}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              backgroundColor: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 1,
              px: 1,
              py: 0.375,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                color: 'var(--color-text-muted)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              АЕИ
            </Typography>
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                fontWeight: 600,
              }}
            >
              {op.aei_count}
            </Typography>
          </Box>

          {picking && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                backgroundColor: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 1,
                px: 1,
                py: 0.375,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.625rem',
                  color: 'var(--color-text-muted)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                SAP задачи
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                {prod}
              </Typography>
            </Box>
          )}

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              backgroundColor: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 1,
              px: 1,
              py: 0.375,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                color: 'var(--color-text-muted)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Расценка
            </Typography>
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                fontWeight: 600,
              }}
            >
              {`${fmtMoney(op.rate || 0)} К / АЕИ`}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const SkeletonOperationCards = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    {Array.from({ length: 8 }).map((_, i) => (
      <Box
        key={i}
        sx={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderLeft: '3px solid var(--color-gold)',
          borderRadius: '0 8px 8px 0',
          height: 130,
          animation: 'pulse 1.5s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.5 },
          },
        }}
      />
    ))}
  </Box>
);

const TypeBreakdown = ({ rows, total }: { rows: TypeShare[]; total: number }) => {
  if (!rows.length || total <= 0) return null;

  return (
    <Box
      sx={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        p: 2,
        height: '100%',
      }}
    >
      <Typography
        sx={{
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
          mb: 1.5,
        }}
      >
        Из чего сложился заработок
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {rows.map((row) => {
          const share = total > 0 ? (row.total_amount / total) * 100 : 0;
          return (
            <Box key={row.operation_type}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-primary)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.operation_type}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.8125rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-gold)',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {Number(row.total_amount || 0).toLocaleString('ru-RU', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  К
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, share)}
                sx={{
                  height: 6,
                  borderRadius: 99,
                  backgroundColor: 'var(--color-bg-elevated)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: 'var(--color-gold)',
                    borderRadius: 99,
                  },
                }}
              />
              <Typography sx={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', mt: 0.25 }}>
                {row.operations_count} оп. · {share.toFixed(0)}%
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

const OperationsPage = () => {
  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(monthEnd);
  const [appliedStart, setAppliedStart] = useState(monthStart);
  const [appliedEnd, setAppliedEnd] = useState(monthEnd);
  const [sortBy, setSortBy] = useState('operation_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [byType, setByType] = useState<TypeShare[]>([]);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    loadOperations();
  }, [page, rowsPerPage, sortBy, sortOrder, appliedStart, appliedEnd]);

  useEffect(() => {
    loadSummary();
  }, [appliedStart, appliedEnd]);

  const loadOperations = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await operationsAPI.getOperations({
        startDate: appliedStart || undefined,
        endDate: appliedEnd || undefined,
        limit: rowsPerPage,
        offset: page * rowsPerPage,
        sortBy,
        sortOrder,
      });

      setOperations(response.data.operations);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка загрузки операций');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      if (appliedStart && appliedEnd) {
        const [salaryRes, typesRes] = await Promise.all([
          salaryAPI.getSalary('custom', appliedStart, appliedEnd),
          operationsAPI.getOperationsByType(appliedStart, appliedEnd),
        ]);
        setSummary(salaryRes.data.summary || salaryRes.data);
        setByType(typesRes.data || []);
      } else {
        const [statsRes, typesRes] = await Promise.all([
          salaryAPI.getStats(),
          operationsAPI.getOperationsByType(),
        ]);
        setSummary({
          total_amount: statsRes.data?.total_earned || 0,
          operations_count: statsRes.data?.total_operations || 0,
          total_aei: statsRes.data?.total_aei || 0,
        });
        setByType(typesRes.data || []);
      }
    } catch {
      setSummary(null);
      setByType([]);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSearch = () => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    setPage(0);
  };

  const handleClear = () => {
    const start = monthStart();
    const end = monthEnd();
    setStartDate(start);
    setEndDate(end);
    setAppliedStart(start);
    setAppliedEnd(end);
    setPage(0);
  };

  const parseLocalDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const hasFilter = Boolean(appliedStart || appliedEnd);
  const periodLabel =
    appliedStart && appliedEnd
      ? `${format(parseLocalDate(appliedStart), 'd MMMM', { locale: ru })} — ${format(parseLocalDate(appliedEnd), 'd MMMM yyyy', { locale: ru })}`
      : 'за всё время';

  const typeRows = [...byType]
    .filter((row) => (row.total_amount || 0) > 0)
    .sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0))
    .slice(0, 5);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortOrder('asc');
  };

  return (
    <Box>
      <PageHeader
        title="Мои операции"
        subtitle="Комплектация: АЕИ × ставка норм комплектации. Сортировка и прочие АЕИ: АЕИ × тариф. Итог сверху — за выбранные дни, с коэффициентом качества."
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: summaryLoading || typeRows.length > 0 ? '1.1fr 0.9fr' : '1fr',
          },
          gap: 2,
          mb: 3,
          alignItems: 'stretch',
        }}
      >
        {summaryLoading ? (
          <SkeletonCard />
        ) : (
          <Box>
            <StatCard
              label={`Заработано ${periodLabel}`}
              variant="hero"
              value={
                <CurrencyDisplay
                  amount={summary?.total_amount || 0}
                  variant="large"
                  unit="К"
                />
              }
              subStats={[
                { label: 'Операций', value: summary?.operations_count || 0 },
                {
                  label: 'АЕИ',
                  value: Number(summary?.total_aei || 0).toLocaleString('ru-RU'),
                },
              ]}
            />
            <Typography sx={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', mt: 1, px: 0.5 }}>
              Итог за календарные дни периода, с коэффициентом качества. Комплектация — АЕИ × ставка норм, сортировка — АЕИ × тариф.
            </Typography>
          </Box>
        )}
        {summaryLoading ? (
          <SkeletonCard />
        ) : (
          <TypeBreakdown rows={typeRows} total={summary?.total_amount || 0} />
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: { xs: 'stretch', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          flexWrap: 'wrap',
          mb: 3,
          p: 2,
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          boxShadow: '0 2px 10px rgba(15,17,40,0.04)',
        }}
      >
        <TextField
          type="date"
          label="С"
          size="small"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: '100%', sm: 160 } }}
        />
        <TextField
          type="date"
          label="По"
          size="small"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: '100%', sm: 160 } }}
        />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" size="small" startIcon={<Search />} onClick={handleSearch}>
            Показать заработок
          </Button>
          {hasFilter && (
            <Button
              variant="text"
              size="small"
              startIcon={<FilterAltOff />}
              onClick={handleClear}
            >
              Этот месяц
            </Button>
          )}
        </Box>
        <Box sx={{ ml: { xs: 0, sm: 'auto' } }}>
          <Typography
            variant="body2"
            aria-live="polite"
            sx={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}
          >
            {loading ? '...' : `Операций в списке: ${total}`}
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" startIcon={<Refresh fontSize="small" />} onClick={loadOperations}>
              Повторить
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {isMobile && (
        <>
          {loading ? (
            <SkeletonOperationCards />
          ) : operations.length === 0 ? (
            <EmptyState
              title="Операции не найдены"
              description={hasFilter ? 'Попробуйте изменить диапазон дат' : 'У вас пока нет операций'}
              action={
                hasFilter ? (
                  <Button variant="outlined" size="small" onClick={handleClear}>
                    Этот месяц
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {operations.map((op) => (
                <OperationCard key={op.operation_id} op={op} />
              ))}
            </Box>
          )}
        </>
      )}

      {!isMobile && (
        <Box
          sx={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {loading ? (
            <SkeletonTable rows={10} columns={5} />
          ) : operations.length === 0 ? (
            <EmptyState
              title="Операции не найдены"
              description={hasFilter ? 'Попробуйте изменить диапазон дат' : 'У вас пока нет операций'}
              action={
                hasFilter ? (
                  <Button variant="outlined" size="small" onClick={handleClear}>
                    Этот месяц
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)' }}>
              <Table stickyHeader sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sortDirection={sortBy === 'operation_date' ? sortOrder : false}
                      sx={{ width: 150 }}
                    >
                      <TableSortLabel
                        active={sortBy === 'operation_date'}
                        direction={sortBy === 'operation_date' ? sortOrder : 'asc'}
                        onClick={() => handleSort('operation_date')}
                      >
                        Дата
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={sortBy === 'operation_type' ? sortOrder : false}>
                      <TableSortLabel
                        active={sortBy === 'operation_type'}
                        direction={sortBy === 'operation_type' ? sortOrder : 'asc'}
                        onClick={() => handleSort('operation_type')}
                      >
                        Операция
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      align="right"
                      sortDirection={sortBy === 'aei_count' ? sortOrder : false}
                      sx={{ width: 72 }}
                    >
                      <TableSortLabel
                        active={sortBy === 'aei_count'}
                        direction={sortBy === 'aei_count' ? sortOrder : 'asc'}
                        onClick={() => handleSort('aei_count')}
                      >
                        АЕИ
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sx={{ width: 96 }}>
                      <Tooltip title="SAP ZprodWtItm. В расчёт ЗП не входит — зарплата комплектации = АЕИ × ставка норм.">
                        <span>SAP задачи</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell
                      align="right"
                      sortDirection={sortBy === 'rate' ? sortOrder : false}
                      sx={{ width: 130 }}
                    >
                      <TableSortLabel
                        active={sortBy === 'rate'}
                        direction={sortBy === 'rate' ? sortOrder : 'asc'}
                        onClick={() => handleSort('rate')}
                      >
                        Расценка
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      align="right"
                      sortDirection={sortBy === 'base_amount' ? sortOrder : false}
                      sx={{ width: 180, color: 'var(--color-gold) !important' }}
                    >
                      <Tooltip title="Комплектация: АЕИ × ставка норм. Сортировка: АЕИ × тариф.">
                        <TableSortLabel
                          active={sortBy === 'base_amount'}
                          direction={sortBy === 'base_amount' ? sortOrder : 'asc'}
                          onClick={() => handleSort('base_amount')}
                        >
                          Заработано
                        </TableSortLabel>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {operations.map((op) => (
                    <TableRow
                      key={op.operation_id}
                      sx={{
                        transition: 'background-color 120ms ease',
                        '&:hover': { backgroundColor: 'var(--color-surface-hover)' },
                      }}
                    >
                      <TableCell sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                        {format(new Date(op.operation_date), 'dd.MM.yyyy HH:mm')}
                      </TableCell>
                      <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {op.operation_type}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'var(--font-mono)' }}>
                        {op.aei_count}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'var(--font-mono)' }}>
                        {Number(op.prod_count || 0) || '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                        {fmtMoney(op.rate || 0)}{' '}
                        К/АЕИ
                      </TableCell>
                      <TableCell align="right">
                        <Box
                          sx={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            color: 'var(--color-gold)',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            px: 1.25,
                            py: 0.5,
                            borderRadius: 1,
                            backgroundColor: 'var(--color-gold-muted)',
                          }}
                        >
                          <CurrencyDisplay amount={op.base_amount || 0} variant="compact" unit="К" />
                          {earningFormula(op) && (
                            <Typography
                              sx={{
                                fontSize: '0.6875rem',
                                fontWeight: 500,
                                color: 'var(--color-text-secondary)',
                                lineHeight: 1.2,
                                mt: 0.25,
                              }}
                            >
                              {earningFormula(op)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {!loading && operations.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: isMobile ? 2 : '0 0 8px 8px',
            mt: isMobile ? 1 : 0,
            borderTop: isMobile ? undefined : 'none',
            px: 2,
          }}
        >
          <Typography
            sx={{
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--color-gold)',
              fontFamily: 'var(--font-mono)',
              py: 1,
            }}
          >
            Итого за период:{' '}
            <CurrencyDisplay amount={summary?.total_amount || 0} variant="compact" unit="К" />
          </Typography>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            labelRowsPerPage={isMobile ? '' : 'Строк:'}
            rowsPerPageOptions={isMobile ? [10, 25] : [10, 25, 50]}
            sx={{ color: 'var(--color-text-secondary)', border: 0 }}
          />
        </Box>
      )}
    </Box>
  );
};

export default OperationsPage;
