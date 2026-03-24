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
} from '@mui/material';
import { Search, FilterAltOff } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { operationsAPI } from '../services/api';
import { format } from 'date-fns';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { PageHeader } from '../components/ui/PageHeader';
import { SkeletonTable } from '../components/ui/SkeletonTable';
import { EmptyState } from '../components/ui/EmptyState';
// ── Operation Card (mobile view) ───────────────────────────────────────────────
interface OperationCardProps {
  op: {
    operation_id: string | number;
    operation_date: string;
    operation_type: string;
    aei_count: number;
    rate: number;
    base_amount: number;
  };
}

const OperationCard = ({ op }: OperationCardProps) => {
  const isLarge = (op.base_amount || 0) >= 10000;

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
      {/* Header: date + operation ID */}
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

      {/* Body */}
      <Box sx={{ px: 1.5, pt: 1, pb: 1.25 }}>
        {/* Operation type */}
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

        {/* Amount — prominent, full width */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
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
          />
        </Box>

        {/* Footer: AEI + Rate chips */}
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
              Расц.
            </Typography>
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                fontWeight: 600,
              }}
            >
              <CurrencyDisplay amount={op.rate || 0} variant="compact" />
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// ── Skeleton Card (mobile loading) ─────────────────────────────────────────────
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

// ── Operations Page ────────────────────────────────────────────────────────────
const OperationsPage = () => {
  const [operations, setOperations] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('operation_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    loadOperations();
  }, [page, rowsPerPage, sortBy, sortOrder]);

  const loadOperations = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await operationsAPI.getOperations({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
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

  const handleSearch = () => {
    setPage(0);
    loadOperations();
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    setPage(0);
    setTimeout(loadOperations, 0);
  };

  const hasFilter = startDate || endDate;

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
      <PageHeader title="Мои операции" />

      {/* Filter bar — stacks on mobile */}
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
            Применить
          </Button>
          {hasFilter && (
            <Button
              variant="text"
              size="small"
              startIcon={<FilterAltOff />}
              onClick={handleClear}
            >
              Сбросить
            </Button>
          )}
        </Box>
        <Box sx={{ ml: { xs: 0, sm: 'auto' } }}>
          <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)' }}>
            {loading ? '...' : `Найдено: ${total}`}
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── MOBILE: Card list ── */}
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
                    Сбросить фильтр
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

      {/* ── DESKTOP: Table ── */}
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
                    Сбросить фильтр
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sortDirection={sortBy === 'operation_date' ? sortOrder : false}>
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
                    <TableCell align="right" sortDirection={sortBy === 'aei_count' ? sortOrder : false}>
                      <TableSortLabel
                        active={sortBy === 'aei_count'}
                        direction={sortBy === 'aei_count' ? sortOrder : 'asc'}
                        onClick={() => handleSort('aei_count')}
                      >
                        АЕИ
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sortDirection={sortBy === 'rate' ? sortOrder : false}>
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
                      sx={{ color: 'var(--color-gold) !important' }}
                    >
                      <TableSortLabel
                        active={sortBy === 'base_amount'}
                        direction={sortBy === 'base_amount' ? sortOrder : 'asc'}
                        onClick={() => handleSort('base_amount')}
                      >
                        Сумма
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {operations.map((op) => (
                    <TableRow key={op.operation_id}>
                      <TableCell sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                        {format(new Date(op.operation_date), 'dd.MM.yyyy HH:mm')}
                      </TableCell>
                      <TableCell>{op.operation_type}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'var(--font-mono)' }}>
                        {op.aei_count}
                      </TableCell>
                      <TableCell align="right">
                        <CurrencyDisplay amount={op.rate || 0} variant="compact" />
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
                          <CurrencyDisplay amount={op.base_amount || 0} variant="compact" />
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

      {/* Pagination — shared between both views */}
      {!loading && operations.length > 0 && (
        <Box
          sx={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: isMobile ? 2 : '0 0 8px 8px',
            mt: isMobile ? 1 : 0,
            borderTop: isMobile ? undefined : 'none',
          }}
        >
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
            sx={{ color: 'var(--color-text-secondary)' }}
          />
        </Box>
      )}
    </Box>
  );
};

export default OperationsPage;
