# Отчет: Исправление типа операции PPMC

## Проблема

WCR-код **PPMC** неправильно определялся как **"МС Коробочная комплектация"**, хотя должен быть **"МС Штучн.компл.однострочн"**.

## Причина

В миграции `001_add_wcr_mapping.sql` (строка 77) PPMC был ошибочно добавлен в группу "Коробочная комплектация":

```sql
-- НЕПРАВИЛЬНО:
('PPMC', 'МС Коробочная комплектация', 'МС', 'МС: коробочная комплектация PPMC'),
```

## Паттерн PP* кодов

Все WCR-коды с префиксом `PP*` относятся к типу **"Штучн.компл.однострочн"**:

| WCR-код | Тип операции | Тариф (₽/АЕИ) | Норма (АЕИ/ч) |
|---------|--------------|---------------|---------------|
| PPM2 | М2 Штучн.компл.однострочн | 1.80 | 210 |
| PPM3 | М3 Штучн.компл.однострочн | 11.00 | 34 |
| PPM4 | М4 Штучн.компл.однострочн | 2.90 | 130 |
| PPM5 | М5 Штучн.компл.однострочн | 1.40 | 260 |
| **PPMC** | **МС Штучн.компл.однострочн** | **3.40** | **110** |

## Влияние на расчеты

### До исправления (PPMC = "МС Коробочная комплектация"):
- Тариф: **5.70 ₽/АЕИ**
- Норма: **65 АЕИ/ч**

### После исправления (PPMC = "МС Штучн.компл.однострочн"):
- Тариф: **3.40 ₽/АЕИ** ✅
- Норма: **110 АЕИ/ч** ✅

**Разница:** -2.30 ₽/АЕИ (-40.4%)

## Решение

Создана миграция `007_fix_ppmc_operation_type.sql`, которая:
1. Обновляет тип операции для PPMC
2. Проверяет консистентность всех PP* кодов
3. Выводит предупреждение о необходимости пересинхронизации

## Инструкция по применению

### 1. Применить миграцию

```bash
# Подключиться к SQL Server
sqlcmd -S PRM-SRV-MSSQL-01.komus.net,59587 -U sa -P icY2eGuyfU -d SalaryMonitor -i database/migrations/007_fix_ppmc_operation_type.sql
```

Или через Azure Data Studio / SQL Server Management Studio:
- Открыть файл `database/migrations/007_fix_ppmc_operation_type.sql`
- Выполнить скрипт

### 2. Проверить изменения

```sql
-- Проверить PPMC
SELECT wcr_code, operation_type, participant_area, description
FROM wcr_mapping 
WHERE wcr_code = 'PPMC';

-- Должно быть:
-- PPMC | МС Штучн.компл.однострочн | МС | МС: однострочная штучная комплектация PPMC

-- Проверить все PP* коды
SELECT wcr_code, operation_type, participant_area
FROM wcr_mapping 
WHERE wcr_code LIKE 'PP%'
ORDER BY participant_area, wcr_code;
```

### 3. Пересинхронизировать данные

После применения миграции необходимо пересинхронизировать данные за период, где использовался PPMC:

```bash
cd backend

# Пересинхронизация февраля 2026 (пример)
npm run sync:period -- 2026-02-01 2026-02-28

# Или для конкретного склада
npm run sync:warehouse -- 02DQ 2026-02-01 2026-02-28
```

### 4. Проверить результаты

Проверить операции с PPMC после пересинхронизации:

```sql
SELECT 
    o.operation_date,
    u.fio,
    o.operation_type,
    o.count AS aei,
    o.amount AS salary,
    o.sap_order_id
FROM operations o
JOIN users u ON o.user_id = u.id
WHERE o.sap_order_id IN (
    SELECT DISTINCT sap_order_id 
    FROM operations 
    WHERE operation_type = 'МС Штучн.компл.однострочн'
)
AND o.operation_date >= '2026-02-01'
AND o.operation_date < '2026-03-01'
ORDER BY o.operation_date, u.fio;
```

## Файлы для проверки

- ✅ `database/migrations/007_fix_ppmc_operation_type.sql` - миграция
- ✅ `database/migrations/001_add_wcr_mapping.sql` - исходная миграция (строка 77)
- ✅ `database/update-tariffs.sql` - тарифы (строка 50)

## Статус

- [x] Проблема идентифицирована
- [x] Создана миграция
- [ ] Миграция применена в БД
- [ ] Данные пересинхронизированы
- [ ] Результаты проверены

---

**Дата создания:** 2026-03-23  
**Автор:** AI Assistant  
**Приоритет:** Высокий (влияет на расчет зарплаты)
