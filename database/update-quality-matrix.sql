-- =============================================
-- Обновление матрицы качества из Приложения 2
-- =============================================

USE SalaryMonitor;
GO

-- Очищаем старую матрицу
DELETE FROM quality_matrix;
GO

-- Новая матрица из Приложения 2
INSERT INTO quality_matrix (errors_count, k_value, description) VALUES
(0, 1.12, 'Без ошибок'),
(1, 1.10, '1 ошибка'),
(2, 1.08, '2 ошибки'),
(3, 1.06, '3 ошибки'),
(4, 1.04, '4 ошибки'),
(5, 1.02, '5 ошибок'),
(6, 1.00, '6 и более ошибок');
GO

PRINT 'Матрица качества обновлена из Приложения 2!';
PRINT '';
SELECT errors_count, k_value, description FROM quality_matrix ORDER BY errors_count;
GO
