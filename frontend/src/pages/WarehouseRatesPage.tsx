import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Skeleton,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Save, RestartAlt } from '@mui/icons-material';
import { format } from 'date-fns';
import { normsAPI } from '../services/api';
import { PageHeader } from '../components/ui/PageHeader';

interface RateRow {
  wcr_code: string;
  description: string;
  area: string;
  picking_type: string | null;
  default_rate: number | null;
  custom_rate: number | null;
  custom_from: string | null;
}

const fmt = (n: number | null) =>
  n === null || n === undefined ? '—' : n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => format(new Date(), 'yyyy-MM-dd');
const monthStart = () => format(new Date(), 'yyyy-MM-01');

/** Ввод ставки: допускаем запятую, максимум 2 знака. */
const parseInput = (s: string): number | null | 'invalid' => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'invalid';
  return Number(t);
};

const WarehouseRatesPage = () => {
  const [rows, setRows] = useState<RateRow[]>([]);
  const [warehouse, setWarehouse] = useState<{ code: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    normsAPI
      .getWarehouseRates()
      .then((r) => {
        setRows(r.data.rates);
        setWarehouse(r.data.warehouse);
        setEdits({});
      })
      .catch(() => setError('Не удалось загрузить тарифы склада'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.wcr_code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const submit = async (row: RateRow, value: number | null) => {
    setSaving(row.wcr_code);
    try {
      const r = await normsAPI.setWarehouseRate(row.wcr_code, value, effectiveFrom);
      const n = r.data.recalculated_operations;
      setToast({
        severity: 'success',
        msg:
          (value === null ? `${row.wcr_code}: возвращена общая ставка` : `${row.wcr_code}: ставка ${fmt(value)} сохранена`) +
          ` (пересчитано операций: ${n})`,
      });
      load();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setToast({ severity: 'error', msg: Array.isArray(m) ? m.join(', ') : m || 'Не удалось сохранить ставку' });
    } finally {
      setSaving(null);
    }
  };

  const onSave = (row: RateRow) => {
    const parsed = parseInput(edits[row.wcr_code] ?? '');
    if (parsed === 'invalid') {
      setToast({ severity: 'error', msg: 'Ставка: число с точностью до копеек, например 2,25' });
      return;
    }
    if (parsed === null) {
      setToast({ severity: 'error', msg: 'Введите ставку или нажмите «Общая», чтобы сбросить' });
      return;
    }
    submit(row, parsed);
  };

  return (
    <Box sx={{ pb: { xs: '56px', md: 0 } }}>
      <PageHeader title={warehouse ? `Тарифы склада: ${warehouse.name} (${warehouse.code})` : 'Тарифы склада'} />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Alert severity="info" sx={{ mb: 2 }}>
        Ставка (за 1 АЕИ) действует только на вашем складе. Операции до выбранной даты считаются по прежней ставке;
        суммы операций с этой даты пересчитываются (кроме закрытых расчётных периодов).
      </Alert>

      <Box
        sx={{
          display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2, p: 2,
          backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2,
        }}
      >
        <TextField
          size="small" label="Действует с" type="date" value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: monthStart(), max: today() }}
          sx={{ width: 170 }}
        />
        <TextField
          size="small" placeholder="Поиск по коду, названию, участку…" value={search}
          onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 240 }}
        />
      </Box>

      <Box sx={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 340px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {['Код', 'Операция', 'Участок', 'Общая ставка', 'Ставка склада', 'Новая ставка', ''].map((h, i) => (
                  <TableCell key={i} sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: i >= 3 && i <= 5 ? 'right' : 'left' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>Ничего не найдено</TableCell></TableRow>
              ) : (
                filtered.map((r) => {
                  const edit = edits[r.wcr_code];
                  const busy = saving === r.wcr_code;
                  const dirty = edit !== undefined && edit !== '';
                  return (
                    <TableRow key={r.wcr_code} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.wcr_code}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell>{r.area || '—'}</TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.default_rate)}</TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {r.custom_rate !== null ? (
                          <Box component="span" sx={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
                            <Chip size="small" label="свой" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />
                            <b>{fmt(r.custom_rate)}</b>
                          </Box>
                        ) : (
                          <Typography component="span" sx={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>общая</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', width: 130 }}>
                        <TextField
                          size="small" value={edit ?? ''} placeholder="0,00" disabled={busy}
                          onChange={(e) => setEdits((p) => ({ ...p, [r.wcr_code]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') onSave(r); }}
                          inputProps={{ inputMode: 'decimal', style: { textAlign: 'right', fontFamily: 'monospace' } }}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Button size="small" variant="contained" startIcon={<Save />} disabled={!dirty || busy} onClick={() => onSave(r)}>
                          Сохранить
                        </Button>
                        {r.custom_rate !== null && (
                          <Button size="small" startIcon={<RestartAlt />} disabled={busy} sx={{ ml: 0.5 }}
                            onClick={() => submit(r, null)}>
                            Общая
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default WarehouseRatesPage;
