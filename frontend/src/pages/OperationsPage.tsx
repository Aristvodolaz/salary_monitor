import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Grid,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { operationsAPI } from '../services/api';
import { format } from 'date-fns';
import CurrencyDisplay from '../components/CurrencyDisplay';

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

  if (loading && operations.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
        Мои операции
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="date"
                label="Дата начала"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="date"
                label="Дата окончания"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<Search />}
                onClick={handleSearch}
              >
                Поиск
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Операция</TableCell>
                <TableCell align="right">АЕИ</TableCell>
                <TableCell align="right">Расценка</TableCell>
                <TableCell align="right">Сумма</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {operations.map((op) => (
                <TableRow key={op.operation_id}>
                  <TableCell>
                    {format(new Date(op.operation_date), 'dd.MM.yyyy HH:mm')}
                  </TableCell>
                  <TableCell>{op.operation_type}</TableCell>
                  <TableCell align="right">{op.aei_count}</TableCell>
                  <TableCell align="right"><CurrencyDisplay amount={op.rate || 0} /></TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="bold" color="primary.main">
                      <CurrencyDisplay amount={op.base_amount || 0} />
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

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
          labelRowsPerPage="Строк на странице:"
        />
      </Card>
    </Box>
  );
};

export default OperationsPage;

