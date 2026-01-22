import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// Добавление токена к каждому запросу
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Обработка ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API методы
export const authAPI = {
  loginByBarcode: (employeeId: string) =>
    api.post('/auth/barcode', { employeeId }),
};

export const salaryAPI = {
  getSalary: (period: 'yesterday' | 'month' | 'custom', startDate?: string, endDate?: string) =>
    api.get('/salary', { params: { period, startDate, endDate } }),
  getStats: () => api.get('/salary/stats'),
};

export const operationsAPI = {
  getOperations: (params: { startDate?: string; endDate?: string; limit?: number; offset?: number }) =>
    api.get('/operations', { params }),
  getOperationsByType: (startDate?: string, endDate?: string) =>
    api.get('/operations/by-type', { params: { startDate, endDate } }),
};

export const adminAPI = {
  getEmployees: (warehouseId?: number) =>
    api.get('/admin/employees', { params: { warehouseId } }),
  getWarehouseSalary: (startDate: string, endDate: string, warehouseId?: number) =>
    api.get('/admin/salary', { params: { startDate, endDate, warehouseId } }),
  exportSalary: (startDate: string, endDate: string, warehouseId?: number) =>
    api.get('/admin/export', { params: { startDate, endDate, warehouseId }, responseType: 'blob' }),
  getStats: (warehouseId?: number) =>
    api.get('/admin/stats', { params: { warehouseId } }),
};

export const usersAPI = {
  getMe: () => api.get('/users/me'),
};

export default api;

