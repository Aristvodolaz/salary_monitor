-- =============================================
-- Исправление формулы расчета amount
-- Теперь: amount = count * rate (используя округленные АЕИ)
-- =============================================

USE SalaryMonitor;
GO

PRINT 'Начало пересчета amount для всех операций...';
PRINT '';

-- Обновляем amount используя округленный count и rate из тарифов
UPDATE o
SET o.amount = o.count * t.rate
FROM operations o
LEFT JOIN tariffs t ON 
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
WHERE t.rate IS NOT NULL;

PRINT 'Пересчет завершен!';
PRINT '';

-- Проверка: вывести несколько примеров
PRINT 'Примеры пересчитанных сумм:';
PRINT '';

SELECT TOP 10
    operation_date,
    operation_type,
    count AS aei_count,
    t.rate,
    amount AS calculated_amount,
    count * t.rate AS verification
FROM operations o
LEFT JOIN tariffs t ON 
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
WHERE operation_date >= '2026-01-29'
ORDER BY operation_date DESC;

GO
