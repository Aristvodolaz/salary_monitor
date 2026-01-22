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
  CircularProgress,
  Alert,
  TextField,
  Button,
  Grid,
  Chip,
} from '@mui/material';
import { Download, Refresh } from '@mui/icons-material';
import { adminAPI } from '../services/api';
import { format, subMonths } from 'date-fns';

const AdminPage = () => {
  const [, setEmployees] = useState<any[]>([]);
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
      const [employeesRes, salaryRes, statsRes] = await Promise.all([
        adminAPI.getEmployees(),
        adminAPI.getWarehouseSalary(startDate, endDate),
        adminAPI.getStats(),
      ]);

      setEmployees(employeesRes.data);
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
    } catch (err: any) {
      setError('Ошибка экспорта данных');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
        Админ-панель
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Статистика склада */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Активных сотрудников
              </Typography>
              <Typography variant="h4">{stats?.active_employees || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Всего операций
              </Typography>
              <Typography variant="h4">{stats?.total_operations || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Всего АЕИ
              </Typography>
              <Typography variant="h4">{stats?.total_aei || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Сумма выплат
              </Typography>
              <Typography variant="h4">
                {(stats?.total_amount || 0).toFixed(0)} ₽
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Фильтры и экспорт */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="date"
                label="Дата начала"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="date"
                label="Дата окончания"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<Refresh />}
                onClick={loadData}
              >
                Обновить
              </Button>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Download />}
                onClick={handleExport}
              >
                Экспорт CSV
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Таблица зарплат сотрудников */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Зарплаты сотрудников за период
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee ID</TableCell>
                  <TableCell>ФИО</TableCell>
                  <TableCell align="right">Рабочих дней</TableCell>
                  <TableCell align="right">Операций</TableCell>
                  <TableCell align="right">АЕИ</TableCell>
                  <TableCell align="right">Сумма</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {salaryData.map((emp) => (
                  <TableRow key={emp.user_id}>
                    <TableCell>
                      <Chip label={emp.employee_id} size="small" />
                    </TableCell>
                    <TableCell>{emp.fio}</TableCell>
                    <TableCell align="right">{emp.work_days}</TableCell>
                    <TableCell align="right">{emp.total_operations}</TableCell>
                    <TableCell align="right">{emp.total_aei}</TableCell>
                    <TableCell align="right">
                      <Typography fontWeight="bold" color="primary.main">
                        {(emp.total_amount || 0).toFixed(2)} ₽
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AdminPage;

