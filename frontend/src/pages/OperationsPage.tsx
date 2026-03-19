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
} from '@mui/material';
import { Search, FilterAltOff } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { operationsAPI } from '../services/api';
import { format } from 'date-fns';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { PageHeader } from '../components/ui/PageHeader';
import { SkeletonTable } from '../components/ui/SkeletonTable';
import { EmptyState } from '../components/ui/EmptyState';
import { TOKENS } from '../theme';

const OperationsPage = () => {
  const [operations, setOperations] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadOperations();
  }, [page, rowsPerPage]);

  const loadOperations = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await operationsAPI.getOperations({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: rowsPerPage,
        offset: page * rowsPerPage,
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
    // trigger reload after state update
    setTimeout(loadOperations, 0);
  };

  const hasFilter = startDate || endDate;

  return (
    <Box>
      <PageHeader title="Мои операции" />

      {/* Inline filter bar */}
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
        <Box sx={{ ml: 'auto' }}>
          <Typography variant="body2" sx={{ color: TOKENS.textSecondary }}>
            {loading ? '...' : `Найдено: ${total}`}
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box
        sx={{
          backgroundColor: TOKENS.bgSurface,
          border: `1px solid ${TOKENS.border}`,
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
                  <TableCell>Дата</TableCell>
                  <TableCell>Операция</TableCell>
                  <TableCell align="right">АЕИ</TableCell>
                  <TableCell align="right">Расценка</TableCell>
                  <TableCell align="right" sx={{ color: `${TOKENS.gold} !important` }}>
                    Сумма
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {operations.map((op) => (
                  <TableRow key={op.operation_id}>
                    <TableCell sx={{ fontFamily: TOKENS.fontMono, fontSize: '0.875rem' }}>
                      {format(new Date(op.operation_date), 'dd.MM.yyyy HH:mm')}
                    </TableCell>
                    <TableCell>{op.operation_type}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: TOKENS.fontMono }}>
                      {op.aei_count}
                    </TableCell>
                    <TableCell align="right">
                      <CurrencyDisplay amount={op.rate || 0} variant="compact" />
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
                        <CurrencyDisplay amount={op.base_amount || 0} variant="compact" />
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {!loading && operations.length > 0 && (
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
            labelRowsPerPage="Строк:"
            rowsPerPageOptions={[10, 25, 50]}
          />
        )}
      </Box>
    </Box>
  );
};

export default OperationsPage;
