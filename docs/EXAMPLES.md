# Примеры использования API

## 🔐 Авторизация

### Вход по штрих-коду

```bash
curl -X POST http://localhost:3000/api/auth/barcode \
  -H "Content-Type: application/json" \
  -d '{"employeeId": "00000001"}'
```

**Ответ:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "employeeId": "00000001",
    "fio": "Иванов Иван Иванович",
    "role": "employee",
    "warehouseId": 1
  }
}
```

Сохраните `access_token` для последующих запросов.

---

## 💰 Получение зарплаты

### Зарплата за текущий месяц

```bash
curl -X GET "http://localhost:3000/api/salary?period=month" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Зарплата за вчера

```bash
curl -X GET "http://localhost:3000/api/salary?period=yesterday" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Зарплата за произвольный период

```bash
curl -X GET "http://localhost:3000/api/salary?period=custom&startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Ответ:**
```json
{
  "period": {
    "start": "2024-01-01",
    "end": "2024-01-31"
  },
  "summary": {
    "total_amount": 15678.90,
    "operations_count": 120,
    "total_aei": 6400,
    "work_days": 22
  },
  "daily_breakdown": [
    {
      "date": "2024-01-31",
      "total_amount": 712.50,
      "operations_count": 6,
      "total_aei": 290
    }
  ]
}
```

### Общая статистика

```bash
curl -X GET "http://localhost:3000/api/salary/stats" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📋 Операции

### Список операций (с пагинацией)

```bash
curl -X GET "http://localhost:3000/api/operations?limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Фильтрация по датам

```bash
curl -X GET "http://localhost:3000/api/operations?startDate=2024-01-01&endDate=2024-01-31&limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Группировка по типам операций

```bash
curl -X GET "http://localhost:3000/api/operations/by-type?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Ответ:**
```json
[
  {
    "operation_type": "Приемка",
    "operations_count": 25,
    "total_aei": 4500,
    "total_amount": 2250.00,
    "avg_amount": 90.00
  },
  {
    "operation_type": "Отборка",
    "operations_count": 20,
    "total_aei": 3600,
    "total_amount": 2160.00,
    "avg_amount": 108.00
  }
]
```

---

## 👤 Информация о пользователе

```bash
curl -X GET "http://localhost:3000/api/users/me" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Ответ:**
```json
{
  "id": 1,
  "employee_id": "00000001",
  "fio": "Иванов Иван Иванович",
  "warehouse_id": 1,
  "warehouse_code": "01SS",
  "warehouse_name": "Склад Солнечногорск",
  "role": "employee",
  "is_active": true
}
```

---

## 👨‍💼 Админ-панель (требуется роль admin)

### Список сотрудников склада

```bash
curl -X GET "http://localhost:3000/api/admin/employees" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Зарплаты всех сотрудников за период

```bash
curl -X GET "http://localhost:3000/api/admin/salary?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Ответ:**
```json
[
  {
    "user_id": 1,
    "employee_id": "00000001",
    "fio": "Иванов Иван Иванович",
    "work_days": 22,
    "total_operations": 120,
    "total_aei": 6400,
    "total_amount": 15678.90
  },
  {
    "user_id": 2,
    "employee_id": "00000002",
    "fio": "Петров Петр Петрович",
    "work_days": 21,
    "total_operations": 110,
    "total_aei": 5800,
    "total_amount": 14234.50
  }
]
```

### Экспорт в CSV

```bash
curl -X GET "http://localhost:3000/api/admin/export?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -o salary_export.csv
```

### Статистика склада

```bash
curl -X GET "http://localhost:3000/api/admin/stats" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Ответ:**
```json
{
  "active_employees": 45,
  "operation_types": 5,
  "total_aei": 125000,
  "total_amount": 487650.50,
  "total_operations": 1850
}
```

---

## 📊 Примеры SQL-запросов

### Зарплата сотрудника за месяц

```sql
SELECT * 
FROM v_salary_by_month
WHERE employee_id = '00000001'
  AND year = 2024
  AND month = 1;
```

### Топ-10 сотрудников по заработку

```sql
SELECT TOP 10
  employee_id,
  fio,
  total_salary,
  total_operations
FROM v_top_performers
ORDER BY total_salary DESC;
```

### Статистика по операциям за день

```sql
SELECT 
  operation_type,
  COUNT(*) as operations_count,
  SUM(count) as total_aei,
  SUM(amount) as total_amount
FROM operations
WHERE operation_date >= CAST(GETDATE() AS DATE)
  AND operation_date < DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
GROUP BY operation_type;
```

### Проверка логов синхронизации

```sql
SELECT 
  warehouse_code,
  sync_start,
  sync_end,
  status,
  records_processed,
  DATEDIFF(SECOND, sync_start, sync_end) as duration_seconds
FROM sync_logs
ORDER BY sync_start DESC;
```

---

## 🧪 Тестовые сценарии

### Сценарий 1: Вход и просмотр зарплаты

```javascript
// 1. Авторизация
const loginRes = await fetch('http://localhost:3000/api/auth/barcode', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ employeeId: '00000001' })
});
const { access_token } = await loginRes.json();

// 2. Получение зарплаты
const salaryRes = await fetch('http://localhost:3000/api/salary?period=month', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
const salary = await salaryRes.json();
console.log('Зарплата за месяц:', salary.total_amount);
```

### Сценарий 2: Админ смотрит статистику

```javascript
// 1. Вход как админ
const loginRes = await fetch('http://localhost:3000/api/auth/barcode', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ employeeId: '00000099' })
});
const { access_token } = await loginRes.json();

// 2. Получение списка сотрудников
const employeesRes = await fetch('http://localhost:3000/api/admin/employees', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
const employees = await employeesRes.json();
console.log('Сотрудников на складе:', employees.length);

// 3. Статистика склада
const statsRes = await fetch('http://localhost:3000/api/admin/stats', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
const stats = await statsRes.json();
console.log('Общая сумма выплат:', stats.total_amount);
```

---

## 🔧 Полезные скрипты

### Добавление нового пользователя

```sql
INSERT INTO users (employee_id, fio, warehouse_id, role)
VALUES ('12345678', 'Новый Сотрудник Иванов', 1, 'employee');
```

### Добавление тарифа

```sql
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from)
VALUES ('01SS', 'Пересортица', 0.65, 170, '2024-01-01');
```

### Добавление операции вручную

```sql
DECLARE @user_id INT = (SELECT id FROM users WHERE employee_id = '00000001');
DECLARE @rate FLOAT = (SELECT rate FROM tariffs WHERE warehouse_code = '01SS' AND operation_type = 'Приемка' AND is_active = 1);

INSERT INTO operations (user_id, warehouse_code, operation_type, count, operation_date, amount)
VALUES (@user_id, '01SS', 'Приемка', 200, GETDATE(), 200 * @rate);
```

### Пересчет зарплаты за период

```sql
-- Обновить суммы операций на основе актуальных тарифов
UPDATE o
SET o.amount = o.count * t.rate
FROM operations o
INNER JOIN tariffs t 
  ON o.warehouse_code = t.warehouse_code 
  AND o.operation_type = t.operation_type
WHERE o.operation_date >= '2024-01-01'
  AND t.is_active = 1;
```

---

## 📱 Примеры для мобильного приложения

### React Native / Expo

```javascript
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

// Авторизация
const login = async (barcode) => {
  const response = await axios.post(`${API_URL}/auth/barcode`, {
    employeeId: barcode
  });
  await AsyncStorage.setItem('token', response.data.access_token);
  return response.data.user;
};

// Получение зарплаты
const getSalary = async (period = 'month') => {
  const token = await AsyncStorage.getItem('token');
  const response = await axios.get(`${API_URL}/salary`, {
    params: { period },
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

// Сканирование ШК
import { BarCodeScanner } from 'expo-barcode-scanner';

const handleBarCodeScanned = async ({ data }) => {
  const user = await login(data);
  console.log('Вход выполнен:', user.fio);
};
```

---

## 💡 Советы

1. **Кэширование**: Для улучшения производительности кэшируйте запросы зарплаты на 5-10 минут
2. **Оптимистичные обновления**: Обновляйте UI сразу, не ждите ответа сервера
3. **Offline-режим**: Храните последние данные локально для работы без интернета
4. **Push-уведомления**: Уведомляйте о начислении зарплаты в конце дня
5. **Аналитика**: Добавьте графики с помощью Chart.js или Recharts

---

Готово! 🎉

