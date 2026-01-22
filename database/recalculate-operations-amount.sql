-- =============================================
-- Пересчет сумм операций БЕЗ коэффициента качества
-- Ккач будет применяться только на уровне агрегации
-- =============================================

USE SalaryMonitor;
GO

PRINT '🔄 Пересчет сумм операций...';
PRINT '';

-- Обновляем amount = count * rate (БЕЗ Ккач!)
UPDATE o
SET o.amount = o.count * t.rate,
    o.updated_at = GETDATE()
FROM operations o
INNER JOIN tariffs t ON 
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
WHERE o.amount IS NOT NULL;

PRINT '✅ Обновлено строк: ' + CAST(@@ROWCOUNT AS VARCHAR);
PRINT '';
PRINT '📊 Проверка данных:';

SELECT TOP 10
    o.id,
    u.fio,
    o.warehouse_code,
    o.operation_type,
    o.count AS aei_count,
    t.rate,
    o.amount AS new_amount,
    o.count * t.rate AS expected_amount
FROM operations o
INNER JOIN users u ON o.user_id = u.id
LEFT JOIN tariffs t ON 
    (o.warehouse_code = t.warehouse_code OR t.warehouse_code = 'ALL')
    AND o.operation_type = t.operation_type
    AND o.operation_date >= t.valid_from
    AND (t.valid_to IS NULL OR o.operation_date <= t.valid_to)
    AND t.is_active = 1
WHERE o.operation_type LIKE '%Упаковка%'
ORDER BY o.operation_date DESC;

GO

PRINT '';
PRINT '✅ Пересчет завершен!';
PRINT '⚠️ Теперь Ккач применяется только к СУММЕ за период в SQL Views';
