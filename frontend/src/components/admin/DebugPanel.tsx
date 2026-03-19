import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
} from '@mui/material';
import {
  BugReport,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Close,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { TOKENS } from '../../theme';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface DebugPanelData {
  allEmployees: any[];
  filteredEmployees: any[];
  selectedEmployee: any | null;
  startDate: string;
  endDate: string;
  periodLabel: string;
  searchQuery: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtAmount = (n: number) =>
  n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatRow = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      py: 0.5,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}
  >
    <Typography
      sx={{
        fontSize: '0.6875rem',
        fontWeight: 500,
        color: 'rgba(255,255,255,0.45)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {label}
    </Typography>
    <Typography
      sx={{
        fontSize: '0.8125rem',
        fontWeight: 700,
        color: accent ? TOKENS.gold : 'rgba(255,255,255,0.85)',
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      {value}
    </Typography>
  </Box>
);

// ── Debug Panel ────────────────────────────────────────────────────────────────
interface DebugPanelProps {
  data: DebugPanelData;
  onClose: () => void;
}

const PANEL_BG = '#0D1017';
const PANEL_BORDER = 'rgba(255,255,255,0.08)';
const PANEL_SURFACE = 'rgba(255,255,255,0.04)';

export const DebugPanel = ({ data, onClose }: DebugPanelProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState(0);

  const totals = useMemo(() => {
    const allTotal = data.allEmployees.reduce((s, e) => s + (e.total_amount || 0), 0);
    const allOps = data.allEmployees.reduce((s, e) => s + (e.total_operations || 0), 0);
    const allAei = data.allEmployees.reduce((s, e) => s + (e.total_aei || 0), 0);
    const filteredTotal = data.filteredEmployees.reduce((s, e) => s + (e.total_amount || 0), 0);
    const filteredOps = data.filteredEmployees.reduce((s, e) => s + (e.total_operations || 0), 0);
    return { allTotal, allOps, allAei, filteredTotal, filteredOps };
  }, [data.allEmployees, data.filteredEmployees]);

  const emp = data.selectedEmployee;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: { xs: '56px', md: 0 },
        left: 0,
        right: 0,
        zIndex: 1400,
        backgroundColor: PANEL_BG,
        borderTop: `1px solid ${PANEL_BORDER}`,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
        transition: 'height 250ms cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        maxHeight: collapsed ? 40 : 280,
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: 40,
          px: 2,
          borderBottom: collapsed ? 'none' : `1px solid ${PANEL_BORDER}`,
          gap: 1.5,
          flexShrink: 0,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <BugReport sx={{ fontSize: 14, color: alpha(TOKENS.gold, 0.8) }} />
        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            flexGrow: 1,
          }}
        >
          Debug Panel
        </Typography>

        {/* Quick stats in header */}
        {collapsed && (
          <Box sx={{ display: 'flex', gap: 2, mr: 2 }}>
            {[
              { label: 'Сотр.', value: data.filteredEmployees.length },
              { label: 'Операций', value: fmt(totals.filteredOps) },
              { label: 'Сумма', value: `${fmtAmount(totals.filteredTotal)} К` },
            ].map((s) => (
              <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>
                  {s.label}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                  {s.value}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
            sx={{ color: 'rgba(255,255,255,0.3)', p: 0.25 }}
          >
            {collapsed ? <KeyboardArrowUp sx={{ fontSize: 16 }} /> : <KeyboardArrowDown sx={{ fontSize: 16 }} />}
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            sx={{ color: 'rgba(255,255,255,0.3)', p: 0.25 }}
          >
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Box>

      {/* Body */}
      {!collapsed && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: 240, overflow: 'hidden' }}>
          {/* Tabs */}
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              minHeight: 36,
              px: 1,
              borderBottom: `1px solid ${PANEL_BORDER}`,
              '& .MuiTab-root': {
                minHeight: 36,
                fontSize: '0.6875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.35)',
                padding: '0 12px',
                '&.Mui-selected': { color: TOKENS.gold },
              },
              '& .MuiTabs-indicator': { backgroundColor: TOKENS.gold, height: 2 },
            }}
          >
            <Tab label="Общее" />
            <Tab label="Сотрудник" />
            <Tab label="Период" />
          </Tabs>

          {/* Tab content */}
          <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
            {/* Tab 0 — General */}
            {tab === 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                <Box sx={{ backgroundColor: PANEL_SURFACE, borderRadius: 1, p: 1.5 }}>
                  <Typography sx={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                    Все сотрудники
                  </Typography>
                  <StatRow label="Всего" value={data.allEmployees.length} />
                  <StatRow label="Отфильтровано" value={data.filteredEmployees.length} />
                  {data.searchQuery && (
                    <StatRow label="Запрос" value={`"${data.searchQuery}"`} />
                  )}
                </Box>
                <Box sx={{ backgroundColor: PANEL_SURFACE, borderRadius: 1, p: 1.5 }}>
                  <Typography sx={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                    Агрегаты (все)
                  </Typography>
                  <StatRow label="Операций" value={fmt(totals.allOps)} />
                  <StatRow label="АЕИ" value={fmt(totals.allAei)} />
                  <StatRow label="Сумма" value={`${fmtAmount(totals.allTotal)} К`} accent />
                </Box>
                <Box sx={{ backgroundColor: PANEL_SURFACE, borderRadius: 1, p: 1.5 }}>
                  <Typography sx={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                    Агрегаты (фильтр)
                  </Typography>
                  <StatRow label="Операций" value={fmt(totals.filteredOps)} />
                  <StatRow label="Сумма" value={`${fmtAmount(totals.filteredTotal)} К`} accent />
                  <StatRow
                    label="Δ от общего"
                    value={
                      totals.allTotal > 0
                        ? `${((totals.filteredTotal / totals.allTotal) * 100).toFixed(1)}%`
                        : '—'
                    }
                  />
                </Box>
              </Box>
            )}

            {/* Tab 1 — Selected employee */}
            {tab === 1 && (
              <Box>
                {emp ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <Box sx={{ backgroundColor: PANEL_SURFACE, borderRadius: 1, p: 1.5 }}>
                      <Typography sx={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                        Идентификация
                      </Typography>
                      <StatRow label="Имя" value={emp.fio} />
                      <StatRow label="ID" value={emp.user_id} />
                      <StatRow label="ШК" value={emp.employee_id} />
                    </Box>
                    <Box sx={{ backgroundColor: PANEL_SURFACE, borderRadius: 1, p: 1.5 }}>
                      <Typography sx={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                        Показатели
                      </Typography>
                      <StatRow label="Раб. дней" value={emp.work_days} />
                      <StatRow label="Операций" value={fmt(emp.total_operations || 0)} />
                      <StatRow label="АЕИ" value={fmt(emp.total_aei || 0)} />
                      <StatRow label="Сумма" value={`${fmtAmount(emp.total_amount || 0)} К`} accent />
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>
                      Нажмите на строку сотрудника для выбора
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {/* Tab 2 — Period */}
            {tab === 2 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Box sx={{ backgroundColor: PANEL_SURFACE, borderRadius: 1, p: 1.5 }}>
                  <Typography sx={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                    Выбранный период
                  </Typography>
                  <StatRow label="Тип" value={data.periodLabel} />
                  <StatRow label="Начало" value={data.startDate} />
                  <StatRow label="Конец" value={data.endDate} />
                </Box>
                <Box sx={{ backgroundColor: PANEL_SURFACE, borderRadius: 1, p: 1.5 }}>
                  <Typography sx={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                    Итоги за период
                  </Typography>
                  <StatRow label="Сотрудников" value={data.allEmployees.length} />
                  <StatRow label="Всего операций" value={fmt(totals.allOps)} />
                  <StatRow label="Всего АЕИ" value={fmt(totals.allAei)} />
                  <StatRow label="Выплачено" value={`${fmtAmount(totals.allTotal)} К`} accent />
                  {data.allEmployees.length > 0 && (
                    <StatRow
                      label="Ср. на сотр."
                      value={`${fmtAmount(totals.allTotal / data.allEmployees.length)} К`}
                    />
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
