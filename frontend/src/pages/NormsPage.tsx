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
  Tabs,
  Tab,
  Tooltip,
  TableSortLabel,
} from '@mui/material';
import { Refresh, TableChart, BarChart, Download, LocalShipping, People, KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { normsAPI } from '../services/api';
import { PageHeader } from '../components/ui/PageHeader';

// ── Types ──────────────────────────────────────────────────────────────────────

// ── Picking types (блок 2) ─────────────────────────────────────────────────────

interface WcrPickingNorm {
  id: number;
  wcr_code: string;
  participant_area: string;
  description_old: string;
  description_new: string;
  picking_type: string;
  norm_label: string;
  rate: number | null;
}

interface PickingStat {
  wcr_code: string;
  participant_area: string;
  description_new: string;
  picking_type: string;
  norm_label: string;
  rate: number | null;
  total_prod: number;
  total_operations: number;
  calc_amount: number | null;
}

interface WcrNorm {
  id: number;
  wcr_code: string;
  description: string;
  norm_type: string;
  norm_value: number | null;
}

interface MarchStat {
  wcr_code: string;
  description: string;
  norm_type: string;
  norm_value: number | null;
  total_aei: number;
  total_operations: number;
  total_actdura_min: number;
  actual_aei_per_hour: number | null;
  norm_pct: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const normChipColor = (pct: number | null): 'default' | 'success' | 'warning' | 'error' => {
  if (pct === null) return 'default';
  if (pct >= 100) return 'success';
  if (pct >= 80) return 'warning';
  return 'error';
};

const normChipLabel = (pct: number | null): string => {
  if (pct === null) return '—';
  return `${pct.toFixed(1)} %`;
};

const prevMonth = subMonths(new Date(), 1);
const MARCH_START = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
const MARCH_END   = format(endOfMonth(prevMonth),   'yyyy-MM-dd');

/** Быстрый выбор календарного марта 2026 (нормы + операции за этот месяц) */
const CAL_MARCH_2026 = { start: '2026-03-01', end: '2026-03-31' };

type StatsSortKey =
  | 'wcr_code'
  | 'description'
  | 'norm_type'
  | 'total_aei'
  | 'total_operations'
  | 'actual_aei_per_hour'
  | 'norm_value'
  | 'norm_pct';

// ── CSV (UTF-8 BOM + `;` — удобно открывать в Excel с русской локалью) ─────────

function escapeCsvCell(v: string): string {
  if (v.includes(';') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function buildNormsStatsCsv(rows: MarchStat[], periodLabel: string): string {
  const header = [
    'Период',
    'WCR-код',
    'Описание',
    'Тип норматива',
    'Факт АЕИ',
    'Операций',
    'Факт АЕИ/ч',
    'Норма АЕИ/ч',
    'Выполнение %',
  ].join(';');

  const num = (n: number | null) =>
    n === null || n === undefined ? '' : String(n).replace('.', ',');

  const lines = rows.map((s) =>
    [
      escapeCsvCell(periodLabel),
      escapeCsvCell(s.wcr_code),
      escapeCsvCell(s.description),
      escapeCsvCell(s.norm_type),
      num(s.total_aei),
      num(s.total_operations),
      num(s.actual_aei_per_hour),
      num(s.norm_value),
      s.norm_pct === null ? '' : String(s.norm_pct).replace('.', ','),
    ].join(';'),
  );

  return '\uFEFF' + [header, ...lines].join('\r\n');
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

// ── NormsReferenceTab ──────────────────────────────────────────────────────────

const NormsReferenceTab = () => {
  const [norms, setNorms]   = useState<WcrNorm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    normsAPI.getNorms()
      .then((r) => setNorms(r.data))
      .catch(() => setError('Не удалось загрузить нормативы'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      norms.filter(
        (n) =>
          !search ||
          n.wcr_code.toLowerCase().includes(search.toLowerCase()) ||
          n.description.toLowerCase().includes(search.toLowerCase()) ||
          n.norm_type.toLowerCase().includes(search.toLowerCase()),
      ),
    [norms, search],
  );

  // Group by norm_type for visual separation
  const grouped = useMemo(() => {
    const map = new Map<string, WcrNorm[]>();
    filtered.forEach((n) => {
      if (!map.has(n.norm_type)) map.set(n.norm_type, []);
      map.get(n.norm_type)!.push(n);
    });
    return map;
  }, [filtered]);

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <TextField
        size="small"
        placeholder="Поиск по коду, описанию, типу норматива..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, width: 380 }}
      />
      <TableContainer
        sx={{
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <HeaderCell>WCR-код</HeaderCell>
              <HeaderCell>Описание</HeaderCell>
              <HeaderCell>Тип норматива</HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>Норма, АЕИ/час</HeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <SkeletonRows cols={4} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4, color: 'var(--color-text-secondary)' }}>
                  Ничего не найдено
                </TableCell>
              </TableRow>
            ) : (
              Array.from(grouped.entries()).map(([type, rows]) => (
                <React.Fragment key={type}>
                  {/* Group header */}
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      sx={{
                        backgroundColor: alpha('#6B7194', 0.07),
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        py: 0.75,
                        px: 2,
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      {type}
                    </TableCell>
                  </TableRow>
                  {rows.map((n) => (
                    <TableRow
                      key={n.wcr_code}
                      sx={{
                        '&:hover': { backgroundColor: 'var(--color-bg-hover)' },
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text-primary)' }}>
                        {n.wcr_code}
                      </TableCell>
                      <TableCell sx={{ color: 'var(--color-text-primary)', fontSize: '0.85rem' }}>
                        {n.description}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={n.norm_type}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                        {n.norm_value !== null ? n.norm_value : (
                          <Typography component="span" sx={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                            нет норматива
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {!loading && (
        <Typography variant="caption" sx={{ color: 'var(--color-text-secondary)', mt: 1, display: 'block' }}>
          Итого: {norms.length} WCR-кодов
        </Typography>
      )}
    </Box>
  );
};

function compareStats(a: MarchStat, b: MarchStat, key: StatsSortKey, order: 'asc' | 'desc'): number {
  const dir = order === 'asc' ? 1 : -1;
  const cmpNum = (x: number | null, y: number | null): number => {
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir;
  };
  switch (key) {
    case 'wcr_code':
      return a.wcr_code.localeCompare(b.wcr_code, 'ru') * dir;
    case 'description':
      return a.description.localeCompare(b.description, 'ru') * dir;
    case 'norm_type':
      return a.norm_type.localeCompare(b.norm_type, 'ru') * dir;
    case 'total_aei':
      return (a.total_aei - b.total_aei) * dir;
    case 'total_operations':
      return (a.total_operations - b.total_operations) * dir;
    case 'actual_aei_per_hour':
      return cmpNum(a.actual_aei_per_hour, b.actual_aei_per_hour);
    case 'norm_value':
      return cmpNum(a.norm_value, b.norm_value);
    case 'norm_pct':
      return cmpNum(a.norm_pct, b.norm_pct);
    default:
      return 0;
  }
}

// ── StatsTab ───────────────────────────────────────────────────────────────────

const StatsTab = () => {
  const [stats, setStats]     = useState<MarchStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [startDate, setStartDate] = useState(MARCH_START);
  const [endDate, setEndDate]     = useState(MARCH_END);
  const [sortBy, setSortBy]       = useState<StatsSortKey>('norm_type');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const load = (from?: string, to?: string) => {
    const s = from ?? startDate;
    const e = to ?? endDate;
    setLoading(true);
    setError(null);
    normsAPI.getStats(s, e)
      .then((r) => setStats(r.data))
      .catch(() => setError('Не удалось загрузить статистику'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedStats = useMemo(() => {
    if (stats.length === 0) return [];
    return [...stats].sort((a, b) => compareStats(a, b, sortBy, sortOrder));
  }, [stats, sortBy, sortOrder]);

  const handleSort = (column: StatsSortKey) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const exportCsv = () => {
    if (sortedStats.length === 0) return;
    const periodLabel = `${startDate} — ${endDate}`;
    const csv = buildNormsStatsCsv(sortedStats, periodLabel);
    const safe = `${startDate}_${endDate}`.replace(/[^0-9_-]/g, '');
    downloadCsv(`norms_wcr_stats_${safe}.csv`, csv);
  };

  const saveToDb = () => {
    setSavingSnapshot(true);
    setSnapshotMsg(null);
    setError(null);
    normsAPI
      .saveStatsSnapshot({ startDate, endDate })
      .then((res) => {
        const d = res.data as { inserted: number; deleted: number };
        setSnapshotMsg(`Снимок записан в БД: вставлено ${d.inserted} строк (удалено старых: ${d.deleted}).`);
      })
      .catch(() => setError('Не удалось сохранить снимок в БД'))
      .finally(() => setSavingSnapshot(false));
  };

  const setPresetMarch2026 = () => {
    const { start, end } = CAL_MARCH_2026;
    setStartDate(start);
    setEndDate(end);
    load(start, end);
  };

  const setPresetPrevMonth = () => {
    const d = subMonths(new Date(), 1);
    const start = format(startOfMonth(d), 'yyyy-MM-dd');
    const end = format(endOfMonth(d), 'yyyy-MM-dd');
    setStartDate(start);
    setEndDate(end);
    load(start, end);
  };

  const setPresetCurrMonth = () => {
    const d = new Date();
    const start = format(startOfMonth(d), 'yyyy-MM-dd');
    const end = format(endOfMonth(d), 'yyyy-MM-dd');
    setStartDate(start);
    setEndDate(end);
    load(start, end);
  };

  // Only rows with operations
  const withOps   = stats.filter((s) => s.total_operations > 0);
  const withNorms = withOps.filter((s) => s.norm_pct !== null);
  const avgPct    = withNorms.length
    ? Math.round(withNorms.reduce((s, r) => s + r.norm_pct!, 0) / withNorms.length * 10) / 10
    : null;

  return (
    <Box>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="С"
          type="date"
          size="small"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="По"
          type="date"
          size="small"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <Button
          variant="contained"
          size="small"
          startIcon={<Refresh />}
          onClick={() => load()}
          disabled={loading}
        >
          Обновить
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Download />}
          onClick={exportCsv}
          disabled={loading || sortedStats.length === 0}
        >
          CSV
        </Button>
        <Tooltip title="Записать текущую статистику в таблицу norms_stats_snapshot (идемпотентно за период)">
          <span>
            <Button
              variant="outlined"
              size="small"
              color="secondary"
              onClick={saveToDb}
              disabled={loading || savingSnapshot}
            >
              {savingSnapshot ? 'Запись…' : 'В БД'}
            </Button>
          </span>
        </Tooltip>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ color: 'var(--color-text-secondary)', mr: 0.5 }}>
            Период:
          </Typography>
          <Chip size="small" label="Март 2026" onClick={setPresetMarch2026} variant="outlined" sx={{ cursor: 'pointer' }} />
          <Chip size="small" label="Прошлый месяц" onClick={setPresetPrevMonth} variant="outlined" sx={{ cursor: 'pointer' }} />
          <Chip size="small" label="Текущий месяц" onClick={setPresetCurrMonth} variant="outlined" sx={{ cursor: 'pointer' }} />
        </Box>

        {avgPct !== null && (
          <Chip
            label={`Средн. выполнение: ${avgPct} %`}
            color={avgPct >= 100 ? 'success' : avgPct >= 80 ? 'warning' : 'error'}
            size="small"
          />
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {snapshotMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSnapshotMsg(null)}>{snapshotMsg}</Alert>}

      <TableContainer
        sx={{
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <HeaderCell>
                <TableSortLabel
                  active={sortBy === 'wcr_code'}
                  direction={sortBy === 'wcr_code' ? sortOrder : 'asc'}
                  onClick={() => handleSort('wcr_code')}
                >
                  WCR-код
                </TableSortLabel>
              </HeaderCell>
              <HeaderCell>
                <TableSortLabel
                  active={sortBy === 'description'}
                  direction={sortBy === 'description' ? sortOrder : 'asc'}
                  onClick={() => handleSort('description')}
                >
                  Описание
                </TableSortLabel>
              </HeaderCell>
              <HeaderCell>
                <TableSortLabel
                  active={sortBy === 'norm_type'}
                  direction={sortBy === 'norm_type' ? sortOrder : 'asc'}
                  onClick={() => handleSort('norm_type')}
                >
                  Тип
                </TableSortLabel>
              </HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>
                <TableSortLabel
                  active={sortBy === 'total_aei'}
                  direction={sortBy === 'total_aei' ? sortOrder : 'asc'}
                  onClick={() => handleSort('total_aei')}
                  sx={{ flexDirection: 'row-reverse', ml: 'auto' }}
                >
                  Факт АЕИ
                </TableSortLabel>
              </HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>
                <TableSortLabel
                  active={sortBy === 'total_operations'}
                  direction={sortBy === 'total_operations' ? sortOrder : 'asc'}
                  onClick={() => handleSort('total_operations')}
                  sx={{ flexDirection: 'row-reverse', ml: 'auto' }}
                >
                  Операций
                </TableSortLabel>
              </HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>
                <TableSortLabel
                  active={sortBy === 'actual_aei_per_hour'}
                  direction={sortBy === 'actual_aei_per_hour' ? sortOrder : 'asc'}
                  onClick={() => handleSort('actual_aei_per_hour')}
                  sx={{ flexDirection: 'row-reverse', ml: 'auto' }}
                >
                  Факт АЕИ/ч
                </TableSortLabel>
              </HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>
                <TableSortLabel
                  active={sortBy === 'norm_value'}
                  direction={sortBy === 'norm_value' ? sortOrder : 'asc'}
                  onClick={() => handleSort('norm_value')}
                  sx={{ flexDirection: 'row-reverse', ml: 'auto' }}
                >
                  Норма АЕИ/ч
                </TableSortLabel>
              </HeaderCell>
              <HeaderCell sx={{ textAlign: 'center' }}>
                <TableSortLabel
                  active={sortBy === 'norm_pct'}
                  direction={sortBy === 'norm_pct' ? sortOrder : 'asc'}
                  onClick={() => handleSort('norm_pct')}
                >
                  Выполнение
                </TableSortLabel>
              </HeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <SkeletonRows cols={8} />
            ) : stats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4, color: 'var(--color-text-secondary)' }}>
                  Нет данных за выбранный период
                </TableCell>
              </TableRow>
            ) : (
              sortedStats.map((s) => {
                const hasOps = s.total_operations > 0;
                return (
                  <TableRow
                    key={s.wcr_code}
                    sx={{
                      opacity: hasOps ? 1 : 0.4,
                      '&:hover': { backgroundColor: 'var(--color-bg-hover)' },
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text-primary)' }}>
                      {s.wcr_code}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.82rem', maxWidth: 260 }}>
                      {s.description}
                    </TableCell>
                    <TableCell>
                      <Chip label={s.norm_type} size="small" variant="outlined" sx={{ fontSize: '0.68rem', height: 18 }} />
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {hasOps ? s.total_aei.toLocaleString('ru-RU') : '—'}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {hasOps ? s.total_operations.toLocaleString('ru-RU') : '—'}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {s.actual_aei_per_hour !== null ? s.actual_aei_per_hour : '—'}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {s.norm_value !== null ? s.norm_value : (
                        <Typography component="span" sx={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>
                          нет
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Tooltip
                        title={
                          s.norm_pct === null
                            ? (s.norm_value === null ? 'Норматив не задан' : 'Нет данных о времени')
                            : `${s.actual_aei_per_hour} / ${s.norm_value} АЕИ/ч`
                        }
                      >
                        <Chip
                          label={normChipLabel(s.norm_pct)}
                          color={normChipColor(s.norm_pct)}
                          size="small"
                          sx={{ fontSize: '0.72rem', minWidth: 70 }}
                        />
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!loading && stats.length > 0 && (
        <Typography variant="caption" sx={{ color: 'var(--color-text-secondary)', mt: 1, display: 'block' }}>
          Показано: {stats.length} кодов, с операциями: {withOps.length}
        </Typography>
      )}
    </Box>
  );
};

// ── PickingReferenceTab ────────────────────────────────────────────────────────

const PICKING_TYPE_COLORS: Record<string, string> = {
  'Коробочная комплектация': '#3B82F6',
  'Штучная комплектация':    '#10B981',
  'Упаковка':                '#F59E0B',
  'Штучн.компл.однострочн':  '#8B5CF6',
};

const PickingReferenceTab = () => {
  const [norms, setNorms]     = useState<WcrPickingNorm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    setLoading(true);
    normsAPI.getPickingNorms()
      .then((r) => setNorms(r.data))
      .catch(() => setError('Не удалось загрузить справочник комплектации'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      norms.filter(
        (n) =>
          !search ||
          n.wcr_code.toLowerCase().includes(search.toLowerCase()) ||
          n.description_new.toLowerCase().includes(search.toLowerCase()) ||
          n.participant_area.toLowerCase().includes(search.toLowerCase()) ||
          n.picking_type.toLowerCase().includes(search.toLowerCase()),
      ),
    [norms, search],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, WcrPickingNorm[]>();
    filtered.forEach((n) => {
      if (!map.has(n.participant_area)) map.set(n.participant_area, []);
      map.get(n.participant_area)!.push(n);
    });
    return map;
  }, [filtered]);

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Для кодов из этого справочника зарплата рассчитывается по <strong>продуктовым задачам (ZprodWtItm)</strong>, а не по АЕИ.
      </Alert>
      <TextField
        size="small"
        placeholder="Поиск по коду, описанию, участку, типу..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, width: 400 }}
      />
      <TableContainer sx={{ border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <HeaderCell>WCR-код</HeaderCell>
              <HeaderCell>Участок</HeaderCell>
              <HeaderCell>Новое название</HeaderCell>
              <HeaderCell>Тип комплектации</HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>Расценка, руб/задача</HeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <SkeletonRows cols={5} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: 'var(--color-text-secondary)' }}>
                  Ничего не найдено
                </TableCell>
              </TableRow>
            ) : (
              Array.from(grouped.entries()).map(([area, rows]) => (
                <React.Fragment key={area}>
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      sx={{
                        backgroundColor: alpha('#6B7194', 0.07),
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        py: 0.75,
                        px: 2,
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      Участок: {area}
                    </TableCell>
                  </TableRow>
                  {rows.map((n) => (
                    <TableRow
                      key={n.wcr_code}
                      sx={{ '&:hover': { backgroundColor: 'var(--color-bg-hover)' }, transition: 'background-color 0.15s' }}
                    >
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text-primary)' }}>
                        {n.wcr_code}
                      </TableCell>
                      <TableCell>
                        <Chip label={n.participant_area} size="small" sx={{ fontSize: '0.7rem', height: 20, fontWeight: 700 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.82rem' }}>{n.description_new}</TableCell>
                      <TableCell>
                        <Chip
                          label={n.picking_type}
                          size="small"
                          sx={{
                            fontSize: '0.68rem',
                            height: 18,
                            backgroundColor: alpha(PICKING_TYPE_COLORS[n.picking_type] ?? '#6B7194', 0.15),
                            color: PICKING_TYPE_COLORS[n.picking_type] ?? 'var(--color-text-secondary)',
                            border: 'none',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                        {n.rate !== null ? n.rate.toLocaleString('ru-RU', { minimumFractionDigits: 1 }) : (
                          <Typography component="span" sx={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>
                            нет
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {!loading && (
        <Typography variant="caption" sx={{ color: 'var(--color-text-secondary)', mt: 1, display: 'block' }}>
          Итого: {norms.length} кодов комплектации
        </Typography>
      )}
    </Box>
  );
};

// ── PickingStatsTab ────────────────────────────────────────────────────────────

const PickingStatsTab = () => {
  const [stats, setStats]     = useState<PickingStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [startDate, setStartDate] = useState(MARCH_START);
  const [endDate, setEndDate]     = useState(MARCH_END);

  const load = (from?: string, to?: string) => {
    const s = from ?? startDate;
    const e = to ?? endDate;
    setLoading(true);
    setError(null);
    normsAPI.getPickingStats(s, e)
      .then((r) => setStats(r.data))
      .catch(() => setError('Не удалось загрузить статистику комплектации'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setPresetMarch2026 = () => {
    setStartDate(CAL_MARCH_2026.start); setEndDate(CAL_MARCH_2026.end);
    load(CAL_MARCH_2026.start, CAL_MARCH_2026.end);
  };
  const setPresetPrevMonth = () => {
    const d = subMonths(new Date(), 1);
    const s = format(startOfMonth(d), 'yyyy-MM-dd');
    const e = format(endOfMonth(d),   'yyyy-MM-dd');
    setStartDate(s); setEndDate(e); load(s, e);
  };

  const withOps = stats.filter((s) => s.total_operations > 0);
  const totalProd = withOps.reduce((acc, s) => acc + s.total_prod, 0);
  const totalAmount = withOps.reduce((acc, s) => acc + (s.calc_amount ?? 0), 0);

  // Grouped by participant_area
  const grouped = useMemo(() => {
    const map = new Map<string, PickingStat[]>();
    stats.forEach((s) => {
      if (!map.has(s.participant_area)) map.set(s.participant_area, []);
      map.get(s.participant_area)!.push(s);
    });
    return map;
  }, [stats]);

  const exportCsv = () => {
    if (stats.length === 0) return;
    const header = ['Участок', 'WCR-код', 'Название', 'Тип', 'Продуктовых задач', 'Операций', 'Расценка', 'Сумма'].join(';');
    const lines = stats.map((s) =>
      [
        s.participant_area,
        s.wcr_code,
        s.description_new,
        s.picking_type,
        s.total_prod,
        s.total_operations,
        s.rate !== null ? String(s.rate).replace('.', ',') : '',
        s.calc_amount !== null ? String(s.calc_amount).replace('.', ',') : '',
      ].join(';'),
    );
    const content = '\uFEFF' + [header, ...lines].join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `picking_stats_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Показаны <strong>продуктовые задачи (ZprodWtItm)</strong> из SAP — отдельно от АЕИ.
      </Alert>

      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField label="С" type="date" size="small" value={startDate}
          onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="По" type="date" size="small" value={endDate}
          onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="contained" size="small" startIcon={<Refresh />} onClick={() => load()} disabled={loading}>
          Загрузить
        </Button>
        <Button size="small" variant="outlined" onClick={setPresetMarch2026}>Март 2026</Button>
        <Button size="small" variant="outlined" onClick={setPresetPrevMonth}>Пред. месяц</Button>
        <Button size="small" variant="outlined" startIcon={<Download />} onClick={exportCsv} disabled={stats.length === 0}>
          CSV
        </Button>

        {totalProd > 0 && (
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
            <Chip label={`Задач: ${totalProd.toLocaleString('ru-RU')}`} size="small" color="primary" />
            {totalAmount > 0 && (
              <Chip
                label={`≈ ${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₽`}
                size="small"
                color="success"
              />
            )}
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer sx={{ border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <HeaderCell>WCR-код</HeaderCell>
              <HeaderCell>Участок</HeaderCell>
              <HeaderCell>Название</HeaderCell>
              <HeaderCell>Тип</HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>Прод. задач</HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>Операций</HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>Расценка</HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}>Сумма, ₽</HeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <SkeletonRows cols={8} />
            ) : stats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4, color: 'var(--color-text-secondary)' }}>
                  Нет данных
                </TableCell>
              </TableRow>
            ) : (
              Array.from(grouped.entries()).map(([area, rows]) => {
                const areaTotal = rows.reduce((s, r) => s + r.total_prod, 0);
                const areaAmount = rows.reduce((s, r) => s + (r.calc_amount ?? 0), 0);
                return (
                  <React.Fragment key={area}>
                    {/* Area group header */}
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        sx={{
                          backgroundColor: alpha('#6B7194', 0.07),
                          color: 'var(--color-text-secondary)',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          py: 0.75,
                          px: 2,
                          borderBottom: '1px solid var(--color-border)',
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Участок: {area}</span>
                          <span>
                            Задач: {areaTotal.toLocaleString('ru-RU')}
                            {areaAmount > 0 && ` · ${areaAmount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`}
                          </span>
                        </Box>
                      </TableCell>
                    </TableRow>
                    {rows.map((s) => {
                      const hasOps = s.total_operations > 0;
                      return (
                        <TableRow
                          key={s.wcr_code}
                          sx={{
                            opacity: hasOps ? 1 : 0.4,
                            '&:hover': { backgroundColor: 'var(--color-bg-hover)' },
                            transition: 'background-color 0.15s',
                          }}
                        >
                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
                            {s.wcr_code}
                          </TableCell>
                          <TableCell>
                            <Chip label={s.participant_area} size="small" sx={{ fontSize: '0.68rem', height: 18, fontWeight: 700 }} />
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.82rem', maxWidth: 220 }}>{s.description_new}</TableCell>
                          <TableCell>
                            <Chip
                              label={s.picking_type}
                              size="small"
                              sx={{
                                fontSize: '0.65rem',
                                height: 18,
                                backgroundColor: alpha(PICKING_TYPE_COLORS[s.picking_type] ?? '#6B7194', 0.15),
                                color: PICKING_TYPE_COLORS[s.picking_type] ?? 'var(--color-text-secondary)',
                                border: 'none',
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: hasOps ? 700 : 400 }}>
                            {hasOps ? s.total_prod.toLocaleString('ru-RU') : '—'}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {hasOps ? s.total_operations.toLocaleString('ru-RU') : '—'}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {s.rate !== null ? s.rate.toLocaleString('ru-RU', { minimumFractionDigits: 1 }) : '—'}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', color: s.calc_amount ? 'var(--color-success, #10B981)' : undefined }}>
                            {s.calc_amount !== null && s.calc_amount > 0
                              ? s.calc_amount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })
                              : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!loading && stats.length > 0 && (
        <Typography variant="caption" sx={{ color: 'var(--color-text-secondary)', mt: 1, display: 'block' }}>
          Показано: {stats.length} кодов, с задачами: {withOps.length}
        </Typography>
      )}
    </Box>
  );
};

// ── NormsEmployeesTab ──────────────────────────────────────────────────────────

interface NormsEmployee {
  user_id: number;
  employee_id: string;
  fio: string;
  work_days: number;
  total_aei: number;
  aei_amount: number;
  total_prod: number;
  picking_amount: number;
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

const fmt = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString('ru-RU');

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
            Комплектация (блок 2, продуктовые задачи)
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
                {fmtInt(row.total_prod)} задач
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

const NormsEmployeesTab = () => {
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
    total_amount:   filtered.reduce((s, e) => s + e.total_amount, 0),
  }), [filtered]);

  return (
    <Box>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField label="С" type="date" size="small" value={startDate}
          onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="По" type="date" size="small" value={endDate}
          onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="contained" size="small" startIcon={<Refresh />} onClick={() => load()} disabled={loading}>
          Загрузить
        </Button>
        <Button size="small" variant="outlined" onClick={() => {
          setStartDate(CAL_MARCH_2026.start); setEndDate(CAL_MARCH_2026.end);
          load(CAL_MARCH_2026.start, CAL_MARCH_2026.end);
        }}>Март 2026</Button>
        <TextField
          size="small" placeholder="Поиск по ФИО / ШК..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ ml: 'auto', width: 240 }}
        />
      </Box>

      {/* Summary */}
      {!loading && employees.length > 0 && (
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Chip label={`Сотрудников: ${totals.employees}`} size="small" />
          <Chip label={`АЕИ: ${fmt(totals.aei_amount)} ₽`} size="small" color="success" variant="outlined" />
          <Chip label={`Комплектация: ${fmt(totals.picking_amount)} ₽`} size="small" color="primary" variant="outlined" />
          <Chip label={`Итого: ${fmt(totals.total_amount)} ₽`} size="small" color="warning" />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer sx={{ border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <HeaderCell sx={{ width: 40 }}>{''}</HeaderCell>
              <HeaderCell><SortLabel col="fio">Сотрудник</SortLabel></HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="work_days">Дней</SortLabel></HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="total_aei">АЕИ</SortLabel></HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="aei_amount">Сумма АЕИ, ₽</SortLabel></HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="total_prod">Задач</SortLabel></HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="picking_amount">Сумма компл., ₽</SortLabel></HeaderCell>
              <HeaderCell sx={{ textAlign: 'right' }}><SortLabel col="total_amount">Итого, ₽</SortLabel></HeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <SkeletonRows cols={8} />
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4, color: 'var(--color-text-secondary)' }}>
                  {employees.length === 0 ? 'Нажмите «Загрузить» для получения данных' : 'Ничего не найдено'}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((emp) => (
                <React.Fragment key={emp.user_id}>
                  <TableRow
                    onClick={() => setExpandedId(expandedId === emp.user_id ? null : emp.user_id)}
                    sx={{
                      cursor: 'pointer',
                      backgroundColor: expandedId === emp.user_id ? alpha('#F59E0B', 0.06) : undefined,
                      '&:hover': { backgroundColor: expandedId === emp.user_id ? alpha('#F59E0B', 0.09) : 'var(--color-bg-hover)' },
                      transition: 'background-color 0.15s',
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
                    <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {fmt(emp.total_amount)}
                    </TableCell>
                  </TableRow>
                  {expandedId === emp.user_id && (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ p: 0, backgroundColor: 'var(--color-bg-surface)' }}>
                        <ExpandedEmployeeDetail
                          userId={emp.user_id}
                          startDate={startDate}
                          endDate={endDate}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!loading && sorted.length > 0 && (
        <Typography variant="caption" sx={{ color: 'var(--color-text-secondary)', mt: 1, display: 'block' }}>
          Показано: {sorted.length} из {employees.length} сотрудников
        </Typography>
      )}
    </Box>
  );
};

// ── NormsPage ──────────────────────────────────────────────────────────────────

const NormsPage = () => {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="Нормативы WCR"
        subtitle="Справочник нормативов по WCR-кодам и статистика операций за период"
      />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: '1px solid var(--color-border)' }}
      >
        <Tab icon={<TableChart fontSize="small" />} iconPosition="start" label="Справочник (АЕИ)" />
        <Tab icon={<BarChart fontSize="small" />} iconPosition="start" label="Статистика (АЕИ)" />
        <Tab icon={<LocalShipping fontSize="small" />} iconPosition="start" label="Справочник (комплектация)" />
        <Tab icon={<BarChart fontSize="small" />} iconPosition="start" label="Статистика (комплектация)" />
        <Tab icon={<People fontSize="small" />} iconPosition="start" label="Сотрудники" />
      </Tabs>

      {tab === 0 && <NormsReferenceTab />}
      {tab === 1 && <StatsTab />}
      {tab === 2 && <PickingReferenceTab />}
      {tab === 3 && <PickingStatsTab />}
      {tab === 4 && <NormsEmployeesTab />}
    </Box>
  );
};

export default NormsPage;
