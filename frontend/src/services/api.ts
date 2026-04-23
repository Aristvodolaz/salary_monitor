import axios from 'axios';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface OperationSummary {
  operation_type: string;
  participant_area: string;
  operations_count: number;
  total_aei: number;
  total_amount: number;
  avg_rate: number;
  first_date: string;
  last_date: string;
}

export interface OperationRecord {
  operation_id: number;
  operation_date: string;
  aei_count: number;
  rate: number;
  base_amount: number;
  participant_area?: string;
}

export interface OperationDetailsResponse {
  records: OperationRecord[];
  pagination: { total: number; limit: number; offset: number };
}

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
  getOperations: (params: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    api.get('/operations', { params }),
  getOperationsByType: (startDate?: string, endDate?: string) =>
    api.get('/operations/by-type', { params: { startDate, endDate } }),
};

export const adminAPI = {
  getWarehouses: () => api.get<{ id: number; code: string; name: string }[]>('/admin/warehouses'),
  getEmployees: (warehouseId?: number) =>
    api.get('/admin/employees', { params: { warehouseId } }),
  getWarehouseSalary: (startDate: string, endDate: string, warehouseId?: number) =>
    api.get('/admin/salary', { params: { startDate, endDate, warehouseId } }),
  exportSalary: (startDate: string, endDate: string, warehouseId?: number) =>
    api.get('/admin/export', { params: { startDate, endDate, warehouseId }, responseType: 'blob' }),
  getStats: (params?: { warehouseId?: number; startDate?: string; endDate?: string }) =>
    api.get('/admin/stats', { params }),
  getEmployeeOperations: (
    employeeId: string | number,
    startDate: string,
    endDate: string,
    limit = 50,
    offset = 0,
  ) =>
    api.get(`/admin/employees/${employeeId}/operations`, {
      params: { startDate, endDate, limit, offset },
    }),
  getEmployeeOperationsSummary: (
    employeeId: string | number,
    startDate: string,
    endDate: string,
  ) =>
    api.get<OperationSummary[]>(`/admin/employees/${employeeId}/operations/summary`, {
      params: { startDate, endDate },
    }),
  getEmployeeOperationDetails: (
    employeeId: string | number,
    operationType: string,
    participantArea: string,
    startDate: string,
    endDate: string,
    limit = 20,
    offset = 0,
  ) =>
    api.get<OperationDetailsResponse>(`/admin/employees/${employeeId}/operations/details`, {
      params: { startDate, endDate, operationType, participantArea, limit, offset },
    }),
  exportExcel: (params: {
    startDate: string;
    endDate: string;
    employeeId?: number;
    warehouseId?: number;
  }) =>
    api.get('/admin/export/excel', {
      params,
      responseType: 'blob',
      timeout: 300000, // 5 мин — стриминг по сотрудникам
    }),
};

export const normsAPI = {
  // ── Блок 1: АЕИ-нормативы (приёмка, размещение, пополнение) ─────────────────
  getNorms: () => api.get('/norms'),
  getStats: (startDate: string, endDate: string, warehouseCode?: string) =>
    api.get('/norms/stats', { params: { startDate, endDate, warehouseCode } }),
  saveStatsSnapshot: (body: { startDate: string; endDate: string; warehouseCode?: string }) =>
    api.post('/norms/stats/snapshot', body),
  // ── Блок 2: Продуктовые задачи (комплектация) ────────────────────────────────
  getPickingNorms: () => api.get('/norms/picking'),
  getPickingStats: (startDate: string, endDate: string, warehouseCode?: string) =>
    api.get('/norms/picking/stats', { params: { startDate, endDate, warehouseCode } }),
  // ── Сотрудники ───────────────────────────────────────────────────────────────
  getEmployees: (startDate: string, endDate: string) =>
    api.get('/norms/employees', { params: { startDate, endDate } }),
  getEmployeeDetail: (userId: number, startDate: string, endDate: string) =>
    api.get(`/norms/employees/${userId}/detail`, { params: { startDate, endDate } }),
  saveEmployeesSnapshot: (body: { startDate: string; endDate: string }) =>
    api.post('/norms/employees/snapshot', body),
};

export const usersAPI = {
  getMe: () => api.get('/users/me'),
};

export const sapAPI = {
  syncYesterday: () => api.post('/sap/sync'),
  syncPeriod: (start: string, end: string) =>
    api.post('/sap/sync-period', { start, end }, { timeout: 600_000 }), // до 10 мин
};

export default api;

