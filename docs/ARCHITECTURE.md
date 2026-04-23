# Архитектура системы мониторинга зарплат (SalaryMonitor)

## Обзор системы

SalaryMonitor — система расчёта сдельной оплаты труда складских сотрудников.
Данные приходят из SAP EWM (OData v2), обрабатываются по справочнику WCR-кодов
и записываются в MSSQL. Фронтенд показывает статистику и отчёты.

```
SAP EWM (WHOSet OData) → NestJS backend → MSSQL (SalaryMonitor)
                                   ↑
                           Vue 3 Frontend
```

---

## Структура проекта

```
selary/
├── backend/               NestJS (Node.js, TypeScript)
│   ├── src/
│   │   ├── sap-integration/  Синхронизация с SAP
│   │   ├── norms/            Нормативы WCR + выработка сотрудников
│   │   ├── operations/       CRUD операций
│   │   ├── salary/           Расчёт зарплаты
│   │   ├── users/            Сотрудники
│   │   ├── admin/            Административные функции
│   │   ├── auth/             JWT-аутентификация
│   │   └── database/         mssql pool-сервис
│   ├── import_sap_march.js   Скрипт разового импорта (вне NestJS)
│   └── resync_march.js       Скрипт пересинка
├── database/
│   ├── schema.sql            Базовая схема (warehouses, users, operations, tariffs…)
│   ├── migrations/           Все ALTER/INSERT миграции (001–018)
│   └── views.sql             SQL-представления
└── frontend/                 Vue 3 + Vite
```

---

## Поток данных из SAP

### SAP OData endpoint

```
GET /sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV/WHOSet
    ?$filter=(Lgnum eq 'PPMC' and ConfirmedDate ge datetime'...' and ConfirmedDate le datetime'...')
    &$format=json
```

### Ключевые поля WHOSet

| SAP-поле       | Назначение                                           |
|----------------|------------------------------------------------------|
| `Lgnum`        | Код склада (PPMC, PDO2 и др.)                       |
| `Employeeid`   | Табельный номер (ШК, 8 цифр с лидирующими нулями)   |
| `CreatedBy`    | Fallback если Employeeid = 00000000                 |
| `McName1/2`    | Имя и фамилия сотрудника                            |
| `Wcr`          | WCR-код операции (напр. P_MZ01_G, INB_MZ01)         |
| `ZsumAmountItm`| **АЕИ** (единицы приёмки/хранения) — Блок 1         |
| `ZprodWtItm`   | **Продуктовые задачи** (комплектация) — Блок 2       |
| `Actdura`      | Фактическое время выполнения (минуты)               |
| `ConfirmedDate`| Дата подтверждения `/Date(timestamp)/`              |
| `Who`          | ID SAP-заказа (sap_order_id)                        |
| `Aarea`        | Зона активности                                     |

### Пагинация OData v2

SAP возвращает **~1000 записей** на страницу. Следующая страница — в поле `d.__next`.
Без обхода `__next` теряются все записи после первой страницы (критический баг, исправлен).

```javascript
while (nextUrl) {
  const data = await fetchPage(nextUrl);
  results.push(...data.results);
  nextUrl = data.__next ?? null;  // пагинация!
}
```

---

## Два блока операций

Система различает два типа операций по разным счётчикам из SAP:

### Блок 1: АЕИ (Приёмка и Хранение)

- **SAP-поле**: `ZsumAmountItm` → `aei_count` / `count` в БД
- **WCR-коды**: 57 кодов `INB_*`, `INT_*`, `REPL_*`, `REPLO_*`, `RPL_*`, `RPLO_*`, `INV_*`, `UNLOAD`
- **participant_area**: `'Приемка и Хранение'` (в wcr_mapping)
- **Расчёт суммы**: `aei_count × rate`
- **Норматив**: АЕИ/час (из wcr_norms.norm_value)

### Блок 2: Комплектация (Picking)

- **SAP-поле**: `ZprodWtItm` → `prod_count` в БД
- **WCR-коды**: 79 кодов `P_*`, `DEF`, `PDO_*` и зональные
- **participant_area**: зона (`ФС`, `ДО`, `МС`, `М1`–`М5`, `ПМ`)
- **Расчёт суммы**: `prod_count × rate`
- **Норматив**: в wcr_picking_norms.rate

> **Правило**: если `participant_area = 'Приемка и Хранение'` → используем `aei_count`,
> иначе → используем `prod_count`.

---

## Схема базы данных

### Основные таблицы

| Таблица               | Назначение                                                    |
|-----------------------|---------------------------------------------------------------|
| `warehouses`          | Склады (code, name, is_active)                               |
| `users`               | Сотрудники (employee_id из SAP, fio, warehouse_id)           |
| `tariffs`             | Расценки по operation_type (rate, norm_aei_per_hour)         |
| `operations`          | **Все** операции из SAP (с wcr_code, count, prod_count)      |
| `norms_operations`    | Только нормативные операции (WCR из wcr_norms + wcr_picking) |
| `sync_logs`           | Лог синхронизаций с SAP                                      |
| `salary_summary`      | Итоговая зарплата за период                                  |
| `quality_matrix`      | K-коэффициент качества (ошибки → K-фактор)                   |

### Справочные таблицы WCR

| Таблица            | Назначение                                                          |
|--------------------|----------------------------------------------------------------------|
| `wcr_mapping`      | WCR-код → operation_type + participant_area (для маппинга в sync)   |
| `wcr_norms`        | Блок 1: нормативы АЕИ/час (57 кодов)                               |
| `wcr_picking_norms`| Блок 2: нормативы комплектации с rate (79 кодов)                   |

### Снимки (snapshot)

| Таблица                   | Назначение                                         |
|---------------------------|-----------------------------------------------------|
| `norms_stats_snapshot`    | Снимок статистики по WCR за период                 |
| `norms_employees_snapshot`| Снимок заработка сотрудников за период             |
| `sap_raw`                 | **RAW-дамп всех записей из SAP** (без фильтрации)  |

---

## Цепочка маппинга WCR

```
SAP: Wcr="INB_MZ01"
        ↓
wcr_mapping: INB_MZ01 → operation_type="Пополнение М1", participant_area="Приемка и Хранение"
        ↓
participant_area == "Приемка и Хранение" → cnt = aei_count (ZsumAmountItm)
        ↓
tariffs: "Пополнение М1" → rate
        ↓
amount = cnt × rate
```

---

## Синхронизация

### Автоматическая (ежедневная)

Запускается в 02:00 (CronJob), синхронизирует **вчерашний день** через `SapSchedulerService`.

### Ручная (через API)

```http
POST /api/sap/sync           # За вчера (admin)
POST /api/sap/sync-period    # Произвольный период до 31 дня
  Body: { "start": "2026-03-01", "end": "2026-03-31" }

POST /api/norms/sync         # Только нормативные коды
  Body: { "startDate": "2026-03-01", "endDate": "2026-03-31" }
```

### Алгоритм syncWarehouse

```
1. buildSyncContext: загружает userMap, tariffMap, wcrMap (3 параллельных SELECT)
2. deleteOperationsForPeriod: DELETE старых записей (идемпотентность)
3. Для каждого дня (chunk_days=1):
   a. fetchAllPages(OData url) → все страницы с пагинацией
   b. parseItem() → ParsedOperation (пропускает aei=0 AND prod=0)
   c. buildRow() → OperationRow (НИКОГДА не пропускает; amount=0 если нет тарифа)
   d. dedupMap по (userId, sapOrderId, operationType, wcrCode)
   e. bulkUpsertOperations: MERGE в таблицу operations
4. Новые сотрудники: upsertSapUsers, затем повторный проход items
```

### Уникальный ключ дедупликации

```sql
(user_id, sap_order_id, operation_type, ISNULL(wcr_code, ''))
```

---

## Расчёт выработки сотрудников

### Endpoint: GET /api/norms/employees

```sql
SELECT
  u.id, u.employee_id, u.fio,
  COUNT(DISTINCT DATE(operation_date)) AS work_days,
  -- Блок 1: АЕИ из wcr_norms
  SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.count END)  AS total_aei,
  SUM(CASE WHEN wn.wcr_code IS NOT NULL THEN o.amount END) AS aei_amount,
  -- Блок 2: комплектация из wcr_picking_norms
  SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN o.prod_count END) AS total_prod,
  SUM(CASE WHEN wp.wcr_code IS NOT NULL THEN o.prod_count * wp.rate END) AS picking_amount,
  aei_amount + picking_amount AS total_amount
FROM operations o
JOIN users u ON ...
LEFT JOIN wcr_norms wn ON wn.wcr_code = o.wcr_code
LEFT JOIN wcr_picking_norms wp ON wp.wcr_code = o.wcr_code
WHERE (wn.wcr_code IS NOT NULL OR wp.wcr_code IS NOT NULL)  -- только нормативные
```

---

## API endpoints

### Аутентификация

```http
POST /api/auth/login     # логин по штрих-коду → JWT
```

### Операции

```http
GET /api/operations      # список операций с фильтрами
GET /api/operations/:id  # детали операции
```

### Нормативы

```http
GET  /api/norms                          # справочник wcr_norms
GET  /api/norms/stats                    # статистика за период
GET  /api/norms/picking                  # справочник wcr_picking_norms
GET  /api/norms/picking/stats            # статистика комплектации
GET  /api/norms/employees                # выработка сотрудников
GET  /api/norms/employees/export         # CSV-экспорт (JSON → фронт конвертирует)
GET  /api/norms/employees/:id/detail     # детализация по сотруднику
POST /api/norms/stats/snapshot           # сохранить снимок статистики
POST /api/norms/employees/snapshot       # сохранить снимок выработки
POST /api/norms/sync                     # синхронизация только нормативных
```

### SAP синхронизация (только admin)

```http
POST /api/sap/sync         # за вчера
POST /api/sap/sync-period  # произвольный период
```

### Зарплата

```http
GET /api/salary            # сводка по зарплате
```

---

## Известные особенности и исправленные баги

### 1. Пагинация OData (критический)
SAP отдаёт ~1000 строк/страница. Без обхода `d.__next` терялись все записи
после первой страницы. **Исправлено**: `fetchAllPages()`.

### 2. camelCase bug participant_area
В старой версии использовалось `wcrEntry.participantArea` (undefined) вместо
`wcrEntry.participant_area`. АЕИ-суммы никогда не считались. **Исправлено**.

### 3. Потеря записей при неизвестном WCR
Раньше: неизвестный WCR → `continue` → запись терялась.
Сейчас: `buildRow()` сохраняет запись с `amount=0`, operation_type = сам wcr_code.

### 4. АЕИ-коды отсутствовали в wcr_mapping
57 АЕИ-кодов (`INB_*`, `INT_*`, `REPL_*`, `INV_*`, `UNLOAD`) были только в
`wcr_norms`, но не в `wcr_mapping`. Синк их пропускал → `aei_amount` всегда 0.
**Исправлено**: migration 017 добавляет их в `wcr_mapping` с `participant_area='Приемка и Хранение'`.

### 5. Потеря записей новых сотрудников с неизвестным WCR
Новый сотрудник + неизвестный WCR: запись пропускалась дважды.
**Исправлено**: повторный проход items после создания пользователей.

---

## Переменные окружения (.env)

```
DB_SERVER=PRM-SRV-MSSQL-01.komus.net
DB_PORT=59587
DB_USER=sa
DB_PASSWORD=...
DB_NAME=SalaryMonitor

SAP_ODATA_BASE_URL=http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV
SAP_USERNAME=SALAR_TO_PWM
SAP_PASSWORD=...

JWT_SECRET=...
```
