# API Документация SalaryMonitor

## 🔐 Авторизация

Все API endpoints (кроме `/auth/barcode`) требуют JWT токен в заголовке:

```
Authorization: Bearer <token>
```

---

## Auth API

### POST `/api/auth/barcode`

Авторизация по штрих-коду (Employee ID).

**Request Body:**
```json
{
  "employeeId": "00000001"
}
```

**Response (200 OK):**
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

**Errors:**
- `401 Unauthorized`: Пользователь не найден или заблокирован

---

## Salary API

### GET `/api/salary`

Получить зарплату за период.

**Query Parameters:**
- `period` (string): `yesterday` | `month` | `custom`
- `startDate` (string, optional): Дата начала (для `custom`)
- `endDate` (string, optional): Дата окончания (для `custom`)

**Example:**
```
GET /api/salary?period=month
```

**Response (200 OK):**

Для `yesterday` или `month`:
```json
{
  "user_id": 1,
  "employee_id": "00000001",
  "fio": "Иванов Иван Иванович",
  "warehouse_code": "01SS",
  "warehouse_name": "Склад Солнечногорск",
  "total_amount": 5432.50,
  "operations_count": 45,
  "total_aei": 2150
}
```

Для `custom`:
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

### GET `/api/salary/stats`

Получить общую статистику за все время.

**Response (200 OK):**
```json
{
  "total_work_days": 120,
  "total_operations": 650,
  "total_aei": 32000,
  "total_earned": 67890.50,
  "avg_per_operation": 104.45,
  "last_operation_date": "2024-01-31T15:30:00.000Z"
}
```

---

## Operations API

### GET `/api/operations`

Получить список операций пользователя.

**Query Parameters:**
- `startDate` (string, optional): Дата начала
- `endDate` (string, optional): Дата окончания
- `limit` (number, optional): Количество записей (по умолчанию 100, макс 500)
- `offset` (number, optional): Смещение для пагинации (по умолчанию 0)

**Example:**
```
GET /api/operations?limit=25&offset=0
```

**Response (200 OK):**
```json
{
  "operations": [
    {
      "operation_id": 1,
      "user_id": 1,
      "employee_id": "00000001",
      "fio": "Иванов Иван Иванович",
      "warehouse_code": "01SS",
      "warehouse_name": "Склад Солнечногорск",
      "operation_type": "Приемка",
      "aei_count": 150,
      "operation_date": "2024-01-31T10:30:00.000Z",
      "rate": 0.50,
      "base_amount": 75.00,
      "quality_coefficient": 1.0,
      "final_amount": 75.00
    }
  ],
  "pagination": {
    "total": 650,
    "limit": 25,
    "offset": 0,
    "hasMore": true
  }
}
```

### GET `/api/operations/by-type`

Получить группировку операций по типам.

**Query Parameters:**
- `startDate` (string, optional)
- `endDate` (string, optional)

**Response (200 OK):**
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

## Admin API

**Требуется роль:** `admin`

### GET `/api/admin/employees`

Получить список сотрудников склада.

**Query Parameters:**
- `warehouseId` (number, optional): ID склада (по умолчанию склад админа)

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "employee_id": "00000001",
    "fio": "Иванов Иван Иванович",
    "warehouse_id": 1,
    "warehouse_code": "01SS",
    "warehouse_name": "Склад Солнечногорск",
    "role": "employee",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### GET `/api/admin/salary`

Получить зарплаты всех сотрудников склада за период.

**Query Parameters:**
- `startDate` (string, required): Дата начала
- `endDate` (string, required): Дата окончания
- `warehouseId` (number, optional): ID склада

**Example:**
```
GET /api/admin/salary?startDate=2024-01-01&endDate=2024-01-31
```

**Response (200 OK):**
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
  }
]
```

### GET `/api/admin/export`

Экспорт данных о зарплатах в CSV.

**Query Parameters:**
- `startDate` (string, required)
- `endDate` (string, required)
- `warehouseId` (number, optional)

**Response (200 OK):**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="salary_export.csv"

"Employee ID","ФИО","Рабочих дней","Операций","АЕИ","Сумма"
"00000001","Иванов Иван Иванович","22","120","6400","15678.90"
```

### GET `/api/admin/stats`

Статистика склада (за последний месяц).

**Query Parameters:**
- `warehouseId` (number, optional)

**Response (200 OK):**
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

## Users API

### GET `/api/users/me`

Получить информацию о текущем пользователе.

**Response (200 OK):**
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

## Коды ошибок

| Код | Описание                          |
|-----|-----------------------------------|
| 200 | OK - Успешный запрос              |
| 400 | Bad Request - Невалидные данные   |
| 401 | Unauthorized - Не авторизован     |
| 403 | Forbidden - Недостаточно прав     |
| 404 | Not Found - Ресурс не найден      |
| 500 | Internal Server Error - Ошибка сервера |

**Пример ошибки:**
```json
{
  "statusCode": 401,
  "message": "Пользователь не найден",
  "error": "Unauthorized"
}
```

---

## Rate Limiting

В production рекомендуется настроить rate limiting:

- **Авторизация**: 5 запросов / минута
- **API endpoints**: 60 запросов / минута
- **Экспорт**: 10 запросов / минута

---

## Версионирование

Текущая версия API: **v1**

В будущем при необходимости можно добавить префикс `/api/v2/...`

