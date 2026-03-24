import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  IconButton,
  Collapse,
  InputAdornment,
  Chip,
  Tooltip,
  Skeleton,
  TableSortLabel,
} from '@mui/material';
import {
  Download,
  Refresh,
  People,
  Assignment,
  Inventory2,
  AccountBalance,
  Search,
  Clear,
  KeyboardArrowDown,
  KeyboardArrowUp,
  KeyboardArrowRight,
  FirstPage,
  LastPage,
  NavigateBefore,
  NavigateNext,
  BugReport,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { adminAPI } from '../services/api';
import { format, subDays, startOfMonth } from 'date-fns';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { TOKENS } from '../theme';
import { DebugPanel, type DebugPanelData } from '../components/admin/DebugPanel';
import { OperationDetails } from '../components/admin/OperationDetails';

// ── Helpers ────────────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month' | 'custom';

const today = () => format(new Date(), 'yyyy-MM-dd');

const PERIOD_PRESETS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'custom', label: 'Период' },
];

const getInitials = (fio: string) =>
  fio.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

// Highlight matched text
const HighlightText = ({ text, query }: { text: string; query: string }) => {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <Box
        component="mark"
        sx={{
          backgroundColor: 'var(--color-red-muted)',
          color: 'var(--color-red)',
          borderRadius: '2px',
          px: 0.25,
          fontWeight: 700,
        }}
      >
        {text.slice(idx, idx + query.length)}
      </Box>
      {text.slice(idx + query.length)}
    </>
  );
};

// ── Skeleton for expanded row ──────────────────────────────────────────────────
const ExpandedSkeleton = () => (
  <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
    {Array.from({ length: 4 }).map((_, i) => (
      <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Skeleton width={120} height={14} />
        <Skeleton width={160} height={14} sx={{ flex: 1 }} />
        <Skeleton width={60} height={14} />
        <Skeleton width={80} height={14} />
      </Box>
    ))}
  </Box>
);

// ── Expanded Employee Row (Уровень 2 — Агрегаты операций) ─────────────────────
interface ExpandedRowProps {
  employeeId: string | number;
  startDate: string;
  endDate: string;
}

const ExpandedEmployeeRow = ({ employeeId, startDate, endDate }: ExpandedRowProps) => {
  const [summaries, setSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedOps, setExpandedOps] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    adminAPI
      .getEmployeeOperationsSummary(Number(employeeId), startDate, endDate)
      .then((res) => {
        if (!cancelled) setSummaries(res.data || []);
      })
      .catch((err) => {
        if (!cancelled) {
          const status = err.response?.status;
          setError(
            status === 404
              ? 'Эндпоинт /operations/summary не реализован на сервере'
              : err.response?.data?.message || 'Ошибка загрузки операций'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [employeeId, startDate, endDate]);

  const handleToggleOp = (key: string) => {
    setExpandedOps((prev) => {
      const next = new Map(prev);
      next.set(key, !prev.get(key));
      return next;
    });
  };

  if (loading) return <ExpandedSkeleton />;

  if (error) {
    return (
      <Box sx={{ p: 2.5 }}>
        <Alert severity="info" sx={{ fontSize: '0.8125rem' }}>{error}</Alert>
      </Box>
    );
  }

  if (summaries.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Нет операций за выбранный период
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: 2.5, pb: 2, pt: 1.5 }}>
      {summaries.map((summary) => {
        const key = `${employeeId}-${summary.operation_type}-${summary.participant_area || ''}`;
        return (
          <Box key={key} sx={{ mb: 0.75 }}>
            {/* Уровень 2 — Агрегат операции (кликабельная строка) */}
            <Box
              onClick={() => handleToggleOp(key)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                borderRadius: 1.5,
                backgroundColor: expandedOps.get(key)
                  ? alpha(TOKENS.gold, 0.06)
                  : 'var(--color-bg-elevated)',
                border: `1px solid ${expandedOps.get(key) ? alpha(TOKENS.gold, 0.25) : 'var(--color-border-subtle)'}`,
                cursor: 'pointer',
                transition: 'all 150ms ease',
                '&:hover': {
                  backgroundColor: alpha(TOKENS.gold, 0.04),
                  borderColor: alpha(TOKENS.gold, 0.2),
                },
              }}
            >
              {/* Иконка раскрытия */}
              <IconButton
                size="small"
                sx={{ color: 'var(--color-text-muted)', p: 0.25, pointerEvents: 'none' }}
              >
                {expandedOps.get(key)
                  ? <KeyboardArrowDown fontSize="small" />
                  : <KeyboardArrowRight fontSize="small" />}
              </IconButton>

              {/* Формат: "Пополнение — 26987 АЕИ — 15896 руб" */}
              <Typography sx={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                flex: 1,
              }}>
                {summary.operation_type} — {summary.total_aei} АЕИ — <CurrencyDisplay amount={summary.total_amount || 0} variant="compact" />
              </Typography>

              {summary.participant_area && (
                <Chip
                  label={summary.participant_area}
                  size="small"
                  sx={{
                    fontSize: '0.625rem',
                    height: 18,
                    backgroundColor: alpha(TOKENS.info, 0.1),
                    color: TOKENS.info,
                    border: `1px solid ${alpha(TOKENS.info, 0.2)}`,
                  }}
                />
              )}

              <Typography sx={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-mono)',
              }}>
                {summary.operations_count} оп.
              </Typography>
            </Box>

            {/* Уровень 3 — Детализация (раскрывается при клике) */}
            <Collapse in={expandedOps.get(key)} timeout={200} unmountOnExit>
              {expandedOps.get(key) && (
                <Box
                  sx={{
                    ml: 3,
                    mt: 0.75,
                    borderLeft: `2px solid ${alpha(TOKENS.gold, 0.2)}`,
                    pl: 1.5,
                  }}
                >
                  <OperationDetails
                    employeeId={Number(employeeId)}
                    operationType={summary.operation_type}
                    participantArea={summary.participant_area || ''}
                    startDate={startDate}
                    endDate={endDate}
                  />
                </Box>
              )}
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
};

// ── Custom Pagination ──────────────────────────────────────────────────────────
interface PaginationProps {
  count: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (p: number) => void;
  onRowsPerPageChange: (rpp: number) => void;
}

const CustomPagination = ({
  count,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
}: PaginationProps) => {
  const [jumpVal, setJumpVal] = useState('');
  const totalPages = Math.max(1, Math.ceil(count / rowsPerPage));
  const from = count === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min((page + 1) * rowsPerPage, count);

  const handleJump = () => {
    const p = parseInt(jumpVal, 10) - 1;
    if (!isNaN(p) && p >= 0 && p < totalPages) onPageChange(p);
    setJumpVal('');
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1,
        px: 2,
        py: 1.25,
        borderTop: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-elevated)',
      }}
    >
      {/* Range info + rows per page */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
          {from}–{to} из {count}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {[10, 25, 50, 100].map((rpp) => (
            <Chip
              key={rpp}
              label={rpp}
              size="small"
              onClick={() => { onRowsPerPageChange(rpp); onPageChange(0); }}
              variant={rowsPerPage === rpp ? 'filled' : 'outlined'}
              color={rowsPerPage === rpp ? 'primary' : 'default'}
              sx={{ fontSize: '0.6875rem', height: 24, cursor: 'pointer' }}
            />
          ))}
        </Box>
      </Box>

      {/* Navigation controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="Первая страница">
          <span>
            <IconButton size="small" disabled={page === 0} onClick={() => onPageChange(0)}>
              <FirstPage fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Назад">
          <span>
            <IconButton size="small" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
              <NavigateBefore fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* Page indicator */}
        <Typography sx={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', px: 1, whiteSpace: 'nowrap' }}>
          {page + 1} / {totalPages}
        </Typography>

        <Tooltip title="Вперёд">
          <span>
            <IconButton size="small" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>
              <NavigateNext fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Последняя страница">
          <span>
            <IconButton size="small" disabled={page >= totalPages - 1} onClick={() => onPageChange(totalPages - 1)}>
              <LastPage fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* Jump to page */}
        {totalPages > 5 && (
          <TextField
            size="small"
            value={jumpVal}
            onChange={(e) => setJumpVal(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            onBlur={handleJump}
            placeholder="Стр."
            sx={{
              ml: 0.5,
              width: 60,
              '& .MuiInputBase-input': {
                fontSize: '0.8125rem',
                textAlign: 'center',
                py: 0.5,
                px: 1,
              },
            }}
          />
        )}
      </Box>
    </Box>
  );
};

// ── Admin Page ─────────────────────────────────────────────────────────────────
const AdminPage = () => {
  const [salaryData, setSalaryData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Period
  const [period, setPeriod] = useState<Period>('month');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(today());

  // Search
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortBy, setSortBy] = useState<
    'fio' | 'work_days' | 'total_operations' | 'total_aei' | 'total_amount'
  >('total_amount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Expandable rows
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  // Debug panel
  const [debugVisible, setDebugVisible] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    setExpandedId(null);

    try {
      const [salaryRes, statsRes] = await Promise.all([
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

  // ── Search debounce ──────────────────────────────────────────────────────────
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearch(val);
      setPage(0);
    }, 300);
  };

  // ── Period presets ───────────────────────────────────────────────────────────
  const applyPeriod = useCallback((p: Period) => {
    setPeriod(p);
    setPage(0);
    const t = today();
    if (p === 'today') { setStartDate(t); setEndDate(t); }
    else if (p === 'week') { setStartDate(format(subDays(new Date(), 6), 'yyyy-MM-dd')); setEndDate(t); }
    else if (p === 'month') { setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd')); setEndDate(t); }
    // 'custom' — keep existing dates, show pickers
  }, []);

  const periodLabel =
    period === 'today' ? 'Сегодня'
    : period === 'week' ? 'Неделя'
    : period === 'month' ? 'Месяц'
    : 'Кастомный';

  // ── Filtered + paginated data ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return salaryData;
    const q = search.toLowerCase();
    return salaryData.filter(
      (emp) =>
        emp.fio?.toLowerCase().includes(q) ||
        String(emp.employee_id || '').includes(q) ||
        String(emp.user_id || '').includes(q),
    );
  }, [salaryData, search]);

  const sorted = useMemo(() => {
    const data = [...filtered];
    data.sort((a, b) => {
      const left = a?.[sortBy];
      const right = b?.[sortBy];

      if (sortBy === 'fio') {
        const result = String(left || '').localeCompare(String(right || ''), 'ru');
        return sortOrder === 'asc' ? result : -result;
      }

      const leftNumber = Number(left || 0);
      const rightNumber = Number(right || 0);
      if (leftNumber === rightNumber) return 0;
      return sortOrder === 'asc' ? leftNumber - rightNumber : rightNumber - leftNumber;
    });
    return data;
  }, [filtered, sortBy, sortOrder]);

  const pageData = useMemo(
    () => sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage),
    [sorted, page, rowsPerPage],
  );

  const handleSort = (
    column: 'fio' | 'work_days' | 'total_operations' | 'total_aei' | 'total_amount',
  ) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortOrder(column === 'fio' ? 'asc' : 'desc');
  };

  // ── Expand/collapse row ──────────────────────────────────────────────────────
  const handleToggleExpand = (emp: any) => {
    if (expandedId === emp.user_id) {
      setExpandedId(null);
      setSelectedEmployee(null);
    } else {
      setExpandedId(emp.user_id);
      setSelectedEmployee(emp);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────────
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

  const handleExportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    setError('');
    try {
      const params: { startDate: string; endDate: string; employeeId?: number } = { startDate, endDate };
      if (expandedId !== null) params.employeeId = Number(expandedId);
      const response = await adminAPI.exportExcel(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `salary_${startDate}_${endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message?.includes('timeout') ? 'Таймаут. Попробуйте выгрузить по одному сотруднику.' : 'Ошибка экспорта Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Stat cards ───────────────────────────────────────────────────────────────
  const statCards = [
    { label: 'Активных сотрудников', icon: People, value: stats?.active_employees || 0, color: TOKENS.info },
    { label: 'Всего операций', icon: Assignment, value: stats?.total_operations || 0, color: TOKENS.gold },
    { label: 'Всего АЕИ', icon: Inventory2, value: stats?.total_aei || 0, color: TOKENS.success },
    {
      label: 'Сумма выплат',
      icon: AccountBalance,
      value: <CurrencyDisplay amount={stats?.total_amount || 0} decimals={0} />,
      color: TOKENS.red,
      hero: true,
    },
  ];

  // ── Debug panel data ─────────────────────────────────────────────────────────
  const debugData: DebugPanelData = {
    allEmployees: salaryData,
    filteredEmployees: filtered,
    selectedEmployee,
    startDate,
    endDate,
    periodLabel,
    searchQuery: search,
  };

  const bottomOffset = debugVisible ? { xs: '296px', md: '240px' } : { xs: '56px', md: 0 };

  return (
    <Box sx={{ pb: bottomOffset }}>
      <PageHeader
        title="Админ-панель"
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Панель отладки">
              <IconButton
                size="small"
                onClick={() => setDebugVisible((v) => !v)}
                sx={{
                  color: debugVisible ? TOKENS.gold : 'var(--color-text-muted)',
                  backgroundColor: debugVisible ? alpha(TOKENS.gold, 0.1) : 'transparent',
                  border: `1px solid ${debugVisible ? alpha(TOKENS.gold, 0.3) : 'var(--color-border)'}`,
                }}
              >
                <BugReport fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* ── Stat cards ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card, i) => (
          <Grid item xs={6} md={3} key={i}>
            <Box
              sx={{
                backgroundColor: 'var(--color-bg-surface)',
                border: `1px solid ${card.hero ? card.color : 'var(--color-border)'}`,
                borderRadius: 2,
                p: { xs: 2, md: 2.5 },
                height: '100%',
                ...(card.hero && { boxShadow: `0 0 24px ${alpha(card.color, 0.12)}` }),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
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
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {card.label}
                </Typography>
              </Box>
              <Typography
                sx={{
                  fontSize: { xs: '1.25rem', md: card.hero ? '1.5rem' : '1.75rem' },
                  fontWeight: 700,
                  color: card.hero ? card.color : 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.2,
                }}
              >
                {loading ? '—' : card.value}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── Period selector + date pickers ── */}
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
        }}
      >
        {/* Period chips */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {PERIOD_PRESETS.map((preset) => (
            <Chip
              key={preset.value}
              label={preset.label}
              size="small"
              onClick={() => applyPeriod(preset.value)}
              color={period === preset.value ? 'primary' : 'default'}
              variant={period === preset.value ? 'filled' : 'outlined'}
              sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}
            />
          ))}
        </Box>

        {/* Custom date pickers — always visible but highlighted for 'custom' */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            type="date"
            label="С"
            size="small"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPeriod('custom'); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: '100%', sm: 150 } }}
          />
          <TextField
            type="date"
            label="По"
            size="small"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPeriod('custom'); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: '100%', sm: 150 } }}
          />
        </Box>

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1, ml: { xs: 0, sm: 'auto' } }}>
          <Button variant="contained" size="small" startIcon={<Refresh />} onClick={loadData}>
            Обновить
          </Button>
          <Button
            variant="contained"
            color="secondary"
            size="small"
            startIcon={<Download />}
            onClick={handleExport}
          >
            CSV
          </Button>
          <Tooltip title={expandedId ? `Excel: только ${selectedEmployee?.fio}` : 'Excel: все сотрудники'}>
            <span>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Download />}
                onClick={handleExportExcel}
                disabled={exportingExcel}
              >
                {exportingExcel ? 'Выгрузка…' : 'Excel'}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Search bar ── */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Поиск по имени или ШК сотрудника..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: 'var(--color-text-muted)' }} />
              </InputAdornment>
            ),
            endAdornment: searchInput ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => { setSearchInput(''); setSearch(''); setPage(0); }}
                  edge="end"
                >
                  <Clear sx={{ fontSize: 16 }} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{
            '& .MuiInputBase-input::placeholder': { color: 'var(--color-text-muted)' },
          }}
        />
        {search && !loading && (
          <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: 'var(--color-text-secondary)' }}>
            Найдено: {filtered.length} из {salaryData.length} сотрудников
          </Typography>
        )}
      </Box>

      {/* ── Employee table ── */}
      <Box
        sx={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 3, pt: 2.5, pb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '1rem' }}>
            Зарплаты за период
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            {periodLabel} · {startDate} — {endDate}
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ p: 2 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 2, mb: 1.5, alignItems: 'center' }}>
                <Skeleton variant="circular" width={34} height={34} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="40%" height={14} />
                  <Skeleton width="25%" height={12} sx={{ mt: 0.5 }} />
                </Box>
                <Skeleton width={60} height={14} />
                <Skeleton width={60} height={14} />
                <Skeleton width={60} height={14} />
                <Skeleton width={90} height={24} />
              </Box>
            ))}
          </Box>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Сотрудники не найдены' : 'Нет данных за выбранный период'}
            description={search ? `По запросу "${search}" ничего не найдено` : 'Попробуйте изменить диапазон дат'}
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40, p: '12px 8px' }} />
                  <TableCell sortDirection={sortBy === 'fio' ? sortOrder : false}>
                    <TableSortLabel
                      active={sortBy === 'fio'}
                      direction={sortBy === 'fio' ? sortOrder : 'asc'}
                      onClick={() => handleSort('fio')}
                    >
                      Сотрудник
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right" sortDirection={sortBy === 'work_days' ? sortOrder : false}>
                    <TableSortLabel
                      active={sortBy === 'work_days'}
                      direction={sortBy === 'work_days' ? sortOrder : 'asc'}
                      onClick={() => handleSort('work_days')}
                    >
                      Раб. дней
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right" sortDirection={sortBy === 'total_operations' ? sortOrder : false}>
                    <TableSortLabel
                      active={sortBy === 'total_operations'}
                      direction={sortBy === 'total_operations' ? sortOrder : 'asc'}
                      onClick={() => handleSort('total_operations')}
                    >
                      Операций
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right" sortDirection={sortBy === 'total_aei' ? sortOrder : false}>
                    <TableSortLabel
                      active={sortBy === 'total_aei'}
                      direction={sortBy === 'total_aei' ? sortOrder : 'asc'}
                      onClick={() => handleSort('total_aei')}
                    >
                      АЕИ
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    align="right"
                    sortDirection={sortBy === 'total_amount' ? sortOrder : false}
                    sx={{ color: 'var(--color-gold) !important' }}
                  >
                    <TableSortLabel
                      active={sortBy === 'total_amount'}
                      direction={sortBy === 'total_amount' ? sortOrder : 'asc'}
                      onClick={() => handleSort('total_amount')}
                    >
                      Сумма
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageData.map((emp) => {
                  const isExpanded = expandedId === emp.user_id;
                  return (
                    <React.Fragment key={emp.user_id}>
                      {/* Main row */}
                      <TableRow
                        onClick={() => handleToggleExpand(emp)}
                        sx={{
                          cursor: 'pointer',
                          '&:hover': { backgroundColor: alpha(TOKENS.red, 0.04) },
                          ...(isExpanded && {
                            backgroundColor: alpha(TOKENS.red, 0.04),
                            '& .MuiTableCell-root': { borderBottom: 'none' },
                          }),
                        }}
                      >
                        {/* Expand icon */}
                        <TableCell sx={{ p: '8px 8px 8px 16px' }}>
                          <IconButton
                            size="small"
                            sx={{ color: 'var(--color-text-muted)', p: 0.25 }}
                            onClick={(e) => { e.stopPropagation(); handleToggleExpand(emp); }}
                          >
                            {isExpanded ? (
                              <KeyboardArrowUp fontSize="small" />
                            ) : (
                              <KeyboardArrowDown fontSize="small" />
                            )}
                          </IconButton>
                        </TableCell>

                        {/* Employee cell */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box
                              sx={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                backgroundColor: 'var(--color-red-subtle)',
                                border: `1px solid ${alpha(TOKENS.red, 0.25)}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: TOKENS.red,
                                flexShrink: 0,
                                fontFamily: 'var(--font-display)',
                              }}
                            >
                              {getInitials(emp.fio)}
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                <HighlightText text={emp.fio} query={search} />
                              </Typography>
                              <Typography sx={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                                ШК: <HighlightText text={String(emp.employee_id)} query={search} />
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>

                        <TableCell align="right" sx={{ fontFamily: 'var(--font-mono)' }}>
                          {emp.work_days}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'var(--font-mono)' }}>
                          {emp.total_operations}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'var(--font-mono)' }}>
                          {emp.total_aei}
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            component="span"
                            sx={{
                              color: 'var(--color-gold)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.9375rem',
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 1,
                              backgroundColor: 'var(--color-gold-muted)',
                              display: 'inline-block',
                            }}
                          >
                            <CurrencyDisplay amount={emp.total_amount || 0} variant="compact" />
                          </Box>
                        </TableCell>
                      </TableRow>

                      {/* Expanded row */}
                      <TableRow>
                        <TableCell colSpan={6} sx={{ p: 0, border: 'none' }}>
                          <Collapse in={isExpanded} timeout={250} unmountOnExit>
                            <Box
                              sx={{
                                backgroundColor: alpha(TOKENS.red, 0.02),
                                borderBottom: `2px solid ${alpha(TOKENS.red, 0.12)}`,
                                borderLeft: `3px solid ${alpha(TOKENS.red, 0.4)}`,
                              }}
                            >
                              {/* Expanded header */}
                              <Box sx={{ px: 2.5, pt: 2, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                  Операции · {emp.fio}
                                </Typography>
                                <Chip
                                  label={`${startDate} — ${endDate}`}
                                  size="small"
                                  sx={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono)', height: 20 }}
                                />
                              </Box>

                              {isExpanded && (
                                <ExpandedEmployeeRow
                                  employeeId={emp.user_id}
                                  startDate={startDate}
                                  endDate={endDate}
                                />
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <CustomPagination
            count={filtered.length}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={setRowsPerPage}
          />
        )}
      </Box>

      {/* ── Debug Panel ── */}
      {debugVisible && (
        <DebugPanel
          data={debugData}
          onClose={() => setDebugVisible(false)}
        />
      )}
    </Box>
  );
};

export default AdminPage;
