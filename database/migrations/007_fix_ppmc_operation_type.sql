-- =============================================
-- Migration 007: Исправление типа операции для PPMC
-- =============================================
-- ПРОБЛЕМА: PPMC определялся как "МС Коробочная комплектация"
-- ПРАВИЛЬНО: PPMC должен быть "МС Штучн.компл.однострочн"
-- 
-- Паттерн: все коды с префиксом PP* относятся к "Штучн.компл.однострочн":
--   PPM2 → М2 Штучн.компл.однострочн
--   PPM3 → М3 Штучн.компл.однострочн
--   PPM4 → М4 Штучн.компл.однострочн
--   PPM5 → М5 Штучн.компл.однострочн
--   PPMC → МС Штучн.компл.однострочн (ИСПРАВЛЕНИЕ!)
-- =============================================

USE SalaryMonitor;
GO

PRINT '🔄 Исправление типа операции для PPMC...';

-- Проверяем текущее состояние
SELECT 
    wcr_code, 
    operation_type, 
    participant_area,
    description
FROM wcr_mapping 
WHERE wcr_code = 'PPMC';

-- Обновляем PPMC на правильный тип
UPDATE wcr_mapping
SET 
    operation_type = 'МС Штучн.компл.однострочн',
    description = 'МС: однострочная штучная комплектация PPMC',
    updated_at = GETDATE()
WHERE wcr_code = 'PPMC';

PRINT '✅ PPMC обновлен: "МС Коробочная комплектация" → "МС Штучн.компл.однострочн"';

-- Проверяем результат
SELECT 
    wcr_code, 
    operation_type, 
    participant_area,
    description
FROM wcr_mapping 
WHERE wcr_code = 'PPMC';

-- Показываем все PP* коды для проверки консистентности
PRINT '';
PRINT '📋 Все PP* коды (должны быть "Штучн.компл.однострочн"):';
SELECT 
    wcr_code, 
    operation_type, 
    participant_area
FROM wcr_mapping 
WHERE wcr_code LIKE 'PP%'
ORDER BY participant_area, wcr_code;

GO

PRINT '';
PRINT '✅ Migration 007 completed: PPMC operation type fixed';
PRINT '⚠️  ВАЖНО: Необходимо пересинхронизировать данные за период, где использовался PPMC!';
PRINT '   Команда: npm run sync:period -- 2026-02-01 2026-02-28';
GO
