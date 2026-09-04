import React, { useState, useEffect, useMemo } from 'react';
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
  Button,
  Chip,
  Skeleton,
  TextField,
  Grid,
} from '@mui/material';
import { Refresh, KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { normsAPI } from '../services/api';
import { PageHeader } from '../components/ui/PageHeader';

// ── Types ──────────────────────────────────────────────────────────────────────

interface NormsEmployee {
  user_id: number;
  employee_id: string;
  fio: string;
  work_days: number;
  total_aei: number;
  aei_amount: number;
  total_prod: number;
  picking_amount: number;
  total_packing: number;
  packing_amount: number;
  total_amount: number;
}

interface EmployeeDetail {
  aei: {
    wcr_code: string;
    description: string;
    norm_type: string;
    total_aei: number;
    total_amount: number;
    operations_count: number;
    first_date: string;
    last_date: string;
  }[];
  picking: {
    wcr_code: string;
    description: string;
    participant_area: string;
    picking_type: string;
    rate: number | null;
    total_prod: number;
    total_amount: number;
    operations_count: number;
    first_date: string;
    last_date: string;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const prevMonth = subMonths(new Date(), 1);
const MARCH_START = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
const MARCH_END   = format(endOfMonth(prevMonth),   'yyyy-MM-dd');

const PICKING_TYPE_COLORS: Record<string, string> = {
  'Коробочная комплектация': '#3B82F6',
  'Штучная комплектация':    '#10B981',
  'Упаковка':                '#F59E0B',
  'Штучн.компл.однострочн':  '#8B5CF6',
};

const fmt = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString('ru-RU');

// ── Sub-components ─────────────────────────────────────────────────────────────

const HeaderCell = ({ children, sx = {} }: { children: React.ReactNode; sx?: object }) => (
  <TableCell
    sx={{
      fontWeight: 600,
      fontSize: '0.75rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--color-text-secondary)',
      backgroundColor: 'var(--color-bg-surface)',
      borderBottom: '1px solid var(--color-border)',
      whiteSpace: 'nowrap',
      py: 1.5,
      ...sx,
    }}
  >
    {children}
  </TableCell>
);

const SkeletonRows = ({ cols }: { cols: number }) => (
  <>
    {Array.from({ length: 8 }).map((_, i) => (
      <TableRow key={i}>
        {Array.from({ length: cols }).map((__, j) => (
          <TableCell key={j}>
            <Skeleton variant="text" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

const ExpandedEmployeeDetail = ({
  userId,
  startDate,
  endDate,
}: {
  userId: number;
  startDate: string;
  endDate: string;
}) => {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    normsAPI.getEmployeeDetail(userId, startDate, endDate)
      .then((r) => { if (!cancelled) setDetail(r.data); })
      .catch(() => { if (!cancelled) setError('Ошибка загрузки детализации'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, startDate, endDate]);

  if (loading) return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {[1,2,3].map((i) => <Skeleton key={i} height={28} />)}
    </Box>
  );
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!detail || (detail.aei.length === 0 && detail.picking.length === 0)) {
    return <Box sx={{ p: 2, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Нет данных за период</Box>;
  }

  return (
    <Box sx={{ px: 2.5, pb: 2, pt: 1 }}>
      {/* АЕИ-операции */}
      {detail.aei.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', mb: 1 }}>
            АЕИ-операции (блок 1)
          </Typography>
          {detail.aei.map((row) => (
            <Box
              key={row.wcr_code}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 1.5, py: 0.75, mb: 0.5,
                borderRadius: 1.5,
                backgroundColor: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', minWidth: 90, color: 'var(--color-text-primary)' }}>
                {row.wcr_code}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', flex: 1, color: 'var(--color-text-primary)' }}>
                {row.description}
              </Typography>
              <Chip label={row.norm_type} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', minWidth: 70, textAlign: 'right' }}>
                {fmtInt(row.total_aei)} АЕИ
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', minWidth: 90, textAlign: 'right', color: '#10B981' }}>
                {fmt(row.total_amount)} ₽
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Picking-операции */}
      {detail.picking.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', mb: 1 }}>
            Комплектация (блок 2, АЕИ × ставка норм)
          </Typography>
          {detail.picking.map((row) => (
            <Box
              key={row.wcr_code}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 1.5, py: 0.75, mb: 0.5,
                borderRadius: 1.5,
                backgroundColor: alpha('#3B82F6', 0.04),
                border: `1px solid ${alpha('#3B82F6', 0.2)}`,
              }}
            >
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', minWidth: 90, color: 'var(--color-text-primary)' }}>
                {row.wcr_code}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', flex: 1 }}>
                {row.description}
              </Typography>
              <Chip
                label={row.participant_area}
                size="small"
                sx={{ fontSize: '0.65rem', height: 18, fontWeight: 700,
                  backgroundColor: alpha(PICKING_TYPE_COLORS[row.picking_type] ?? '#6B7194', 0.15),
                  color: PICKING_TYPE_COLORS[row.picking_type] ?? 'var(--color-text-secondary)',
                }}
              />
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', minWidth: 80, textAlign: 'right' }}>
                {fmtInt(row.total_prod)} АЕИ
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', minWidth: 90, textAlign: 'right', color: '#3B82F6' }}>
                {fmt(row.total_amount)} ₽
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// ── NormsPage ──────────────────────────────────────────────────────────────────

const NormsPage = () => {
  const [employees, setEmployees] = useState<NormsEmployee[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [startDate, setStartDate] = useState(MARCH_START);
  const [endDate, setEndDate]     = useState(MARCH_END);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch]       = useState('');
  const [sortBy, setSortBy]       = useState<keyof NormsEmployee>('total_amount');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');

  const load = (s?: string, e?: string) => {
    const from = s ?? startDate;
    const to   = e ?? endDate;
    setLoading(true);
    setError(null);
    setExpandedId(null);
    normsAPI.getEmployees(from, to)
      .then((r) => setEmployees(r.data))
      .catch(() => setError('Ошибка загрузки данных сотрудников'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter((e) =>
      e.fio.toLowerCase().includes(q) || e.employee_id.includes(q),
    );
  }, [employees, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortBy] as number | string;
      const bv = b[sortBy] as number | string;
      if (typeof av === 'string') {
        const r = av.localeCompare(bv as string, 'ru');
        return sortDir === 'asc' ? r : -r;
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [filtered, sortBy, sortDir]);

  const handleSort = (col: keyof NormsEmployee) => {
    if (sortBy === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(col); setSortDir(col === 'fio' ? 'asc' : 'desc'); }
  };

  const SortLabel = ({ col, children }: { col: keyof NormsEmployee; children: React.ReactNode }) => (
    <Box
      component="span"
      onClick={() => handleSort(col)}
      sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5,
        color: sortBy === col ? 'var(--color-text-primary)' : undefined,
        '&:hover': { color: 'var(--color-text-primary)' },
      }}
    >
      {children}
      {sortBy === col && (
        sortDir === 'asc' ? <KeyboardArrowUp sx={{ fontSize: 14 }} /> : <KeyboardArrowDown sx={{ fontSize: 14 }} />
      )}
    </Box>
  );

  // Summary totals
  const totals = useMemo(() => ({
    employees: filtered.length,
    aei_amount:     filtered.reduce((s, e) => s + e.aei_amount, 0),
    picking_amount: filtered.reduce((s, e) => s + e.picking_amount, 0),
    packing_amount: filtered.reduce((s, e) => s + (e.packing_amount || 0), 0),
    total_amount:   filtered.reduce((s, e) => s + e.total_amount, 0),
  }), [filtered]);

  return (
    <Box sx={{ pb: { xs: '56px', md: 0 } }}>
      <PageHeader
        title="Приемка и Хранение"
      />

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Summary Cards */}
      {!loading && employees.length > 0 && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={2.4}>
            <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, p: { xs: 2, md: 2.5 }, height: '100%' }}>
              <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', mb: 1.5 }}>
                Сотрудников
              </Typography>
              <Typography sx={{ fontSize: { xs: '1.25rem', md: '1.75rem' }, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                {totals.employees}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, p: { xs: 2, md: 2.5 }, height: '100%' }}>
              <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', mb: 1.5 }}>
                АЕИ
              </Typography>
              <Typography sx={{ fontSize: { xs: '1.25rem', md: '1.75rem' }, fontWeight: 700, color: '#10B981', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                {fmt(totals.aei_amount)} ₽
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, p: { xs: 2, md: 2.5 }, height: '100%' }}>
              <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', mb: 1.5 }}>
                Комплектация
              </Typography>
              <Typography sx={{ fontSize: { xs: '1.25rem', md: '1.75rem' }, fontWeight: 700, color: '#3B82F6', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                {fmt(totals.picking_amount)} ₽
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, p: { xs: 2, md: 2.5 }, height: '100%' }}>
              <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', mb: 1.5 }}>
                Упаковка
              </Typography>
              <Typography sx={{ fontSize: { xs: '1.25rem', md: '1.75rem' }, fontWeight: 700, color: '#8B5CF6', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                {fmt(totals.packing_amount)} ₽
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-gold)', borderRadius: 2, p: { xs: 2, md: 2.5 }, height: '100%', boxShadow: `0 0 24px ${alpha('#F59E0B', 0.12)}` }}>
              <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', mb: 1.5 }}>
                Итого
              </Typography>
              <Typography sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 700, color: 'var(--color-gold)', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                {fmt(totals.total_amount)} ₽
              </Typography>
            </Box>
          </Grid>
        </Grid>
      )}

      {/* Controls */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          alignItems: { xs: 'stretch', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          flexWrap: 'wrap',
          mb: 2,
          p: 2,
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          boxShadow: '0 2px 10px rgba(15,17,40,0.04)',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField label="С" type="date" size="small" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 150 } }} />
          <TextField label="По" type="date" size="small" value={endDate}
            onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 150 } }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, ml: { xs: 0, sm: 'auto' } }}>
          <Button variant="contained" size="small" startIcon={<Refresh />} onClick={() => load()} disabled={loading}>
            Обновить
          </Button>
        </Box>
      </Box>

      {/* Search bar */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Поиск по имени или ШК сотрудника..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{
            '& .MuiInputBase-input::placeholder': { color: 'var(--color-text-muted)' },
            '& .MuiOutlinedInput-root': { backgroundColor: 'var(--color-bg-surface)' },
          }}
        />
        {search && !loading && (
          <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: 'var(--color-text-secondary)' }}>
            Найдено: {filtered.length} из {employees.length} сотрудников
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 3, pt: 2.5, pb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '1rem' }}>
              Заработок по нормативам (АЕИ и комплектация)
            </Typography>
            {!loading && (
              <Typography variant="caption" sx={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Сотрудников: {filtered.length}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" sx={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            {startDate} — {endDate}
          </Typography>
        </Box>

        <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <HeaderCell sx={{ width: 40, p: '12px 8px' }}>{''}</HeaderCell>
                <HeaderCell><SortLabel col="fio">Сотрудник</SortLabel></HeaderCell>
                <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="work_days">Дней</SortLabel></HeaderCell>
                <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="total_aei">АЕИ</SortLabel></HeaderCell>
                <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="aei_amount">Сумма АЕИ, ₽</SortLabel></HeaderCell>
                <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="total_prod">АЕИ компл.</SortLabel></HeaderCell>
                <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="picking_amount">Сумма компл., ₽</SortLabel></HeaderCell>
                <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="total_packing">АЕИ упак.</SortLabel></HeaderCell>
                <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="packing_amount">Сумма упак., ₽</SortLabel></HeaderCell>
                <HeaderCell sx={{ textAlign: 'right', color: 'var(--color-gold)' }}><SortLabel col="total_amount">Итого, ₽</SortLabel></HeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <SkeletonRows cols={10} />
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ textAlign: 'center', py: 4, color: 'var(--color-text-secondary)' }}>
                    {employees.length === 0 ? 'Нажмите «Обновить» для получения данных' : 'Ничего не найдено'}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((emp) => (
                  <React.Fragment key={emp.user_id}>
                    <TableRow
                      onClick={() => setExpandedId(expandedId === emp.user_id ? null : emp.user_id)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: alpha('#EF4444', 0.04) },
                        ...(expandedId === emp.user_id && {
                          backgroundColor: alpha('#EF4444', 0.04),
                          '& .MuiTableCell-root': { borderBottom: 'none' },
                        }),
                      }}
                    >
                      <TableCell sx={{ textAlign: 'center', py: 0.5 }}>
                        {expandedId === emp.user_id
                          ? <KeyboardArrowUp fontSize="small" sx={{ color: 'var(--color-text-secondary)' }} />
                          : <KeyboardArrowDown fontSize="small" sx={{ color: 'var(--color-text-secondary)' }} />
                        }
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {emp.fio}
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                          ШК: {emp.employee_id}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>{emp.work_days}</TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {emp.total_aei > 0 ? fmtInt(emp.total_aei) : '—'}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', color: '#10B981', fontWeight: emp.aei_amount > 0 ? 700 : 400 }}>
                        {emp.aei_amount > 0 ? fmt(emp.aei_amount) : '—'}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {emp.total_prod > 0 ? fmtInt(emp.total_prod) : '—'}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', color: '#3B82F6', fontWeight: emp.picking_amount > 0 ? 700 : 400 }}>
                        {emp.picking_amount > 0 ? fmt(emp.picking_amount) : '—'}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {emp.total_packing > 0 ? fmtInt(emp.total_packing) : '—'}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', color: '#8B5CF6', fontWeight: emp.packing_amount > 0 ? 700 : 400 }}>
                        {emp.packing_amount > 0 ? fmt(emp.packing_amount) : '—'}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {fmt(emp.total_amount)}
                      </TableCell>
                    </TableRow>
                    {expandedId === emp.user_id && (
                      <TableRow>
                        <TableCell colSpan={10} sx={{ p: 0, border: 'none' }}>
                          <Box sx={{
                            backgroundColor: alpha('#EF4444', 0.02),
                            borderBottom: `2px solid ${alpha('#EF4444', 0.12)}`,
                            borderLeft: `3px solid ${alpha('#EF4444', 0.4)}`,
                            pb: 1
                          }}>
                            <Box sx={{ px: 2.5, pt: 2, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Операции · {emp.fio}
                              </Typography>
                            </Box>
                            <ExpandedEmployeeDetail
                              userId={emp.user_id}
                              startDate={startDate}
                              endDate={endDate}
                            />
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default NormsPage;
