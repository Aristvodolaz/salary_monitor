-- =============================================
-- Пересчет таблицы salary_summary из operations
-- =============================================

USE SalaryMonitor;
GO

-- Очищаем старые данные
TRUNCATE TABLE salary_summary;
GO

-- Заполняем из v_salary_by_month
INSERT INTO salary_summary (
  user_id,
  period_start,
  period_end,
  total_amount,
  quality_coefficient,
  errors_count
)
SELECT 
  user_id,
  period_start,
  EOMONTH(period_start) as period_end,  -- Последний день месяца
  total_amount,
  avg_quality_coefficient,
  0 as errors_count  -- Пока нет данных об ошибках
FROM v_salary_by_month;
GO

PRINT 'Таблица salary_summary пересчитана!';
PRINT '';
SELECT COUNT(*) as total_records FROM salary_summary;
GO
