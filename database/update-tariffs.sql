-- =============================================
-- Обновление тарифов из Приложения 1
-- =============================================

USE SalaryMonitor;
GO

-- Создаем универсальный склад для общих тарифов
IF NOT EXISTS (SELECT * FROM warehouses WHERE code = 'ALL')
BEGIN
    INSERT INTO warehouses (code, name, is_active) 
    VALUES ('ALL', 'Универсальные тарифы', 1);
END
GO

-- Очищаем старые тарифы
DELETE FROM tariffs;
GO

-- М2 - Участок
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from) VALUES
('ALL', 'М2 Коробочная комплектация', 14.40, 26, '2024-01-01'),
('ALL', 'М2 Штучн.компл.однострочн', 1.80, 210, '2024-01-01'),
('ALL', 'М2 Штучная комплектация', 1.20, 305, '2024-01-01'),
('ALL', 'М2 Упаковка', 1.30, 295, '2024-01-01');

-- М3 - Участок
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from) VALUES
('ALL', 'М3 Коробочная комплектация', 7.50, 50, '2024-01-01'),
('ALL', 'М3 Штучн.компл.однострочн', 11.00, 34, '2024-01-01'),
('ALL', 'М3 Штучная комплектация', 7.00, 52, '2024-01-01');

-- М4 - Участок
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from) VALUES
('ALL', 'М4 Коробочная комплектация', 6.00, 62, '2024-01-01'),
('ALL', 'М4 Штучн.компл.однострочн', 2.90, 130, '2024-01-01'),
('ALL', 'М4 Штучная комплектация', 1.80, 210, '2024-01-01'),
('ALL', 'М4 Упаковка', 1.40, 260, '2024-01-01');

-- М5 - Участок
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from) VALUES
('ALL', 'М5 Коробочная комплектация', 5.50, 65, '2024-01-01'),
('ALL', 'М5 Штучн.компл.однострочн', 1.40, 260, '2024-01-01'),
('ALL', 'М5 Штучная комплектация', 1.10, 350, '2024-01-01'),
('ALL', 'М5 Упаковка', 1.20, 300, '2024-01-01');

-- МС - Участок
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from) VALUES
('ALL', 'МС Коробочная комплектация', 5.70, 65, '2024-01-01'),
('ALL', 'МС Штучн.компл.однострочн', 3.40, 110, '2024-01-01'),
('ALL', 'МС Штучная комплектация', 1.70, 225, '2024-01-01'),
('ALL', 'МС Упаковка', 1.80, 210, '2024-01-01');

-- ДО - Участок
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from) VALUES
('ALL', 'ДО Коробочная комплектация', 6.20, 60, '2024-01-01');

-- ФС - Участок
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from) VALUES
('ALL', 'ФС Коробочная комплектация', 7.50, 50, '2024-01-01'),
('ALL', 'ФС Штучная комплектация', 2.70, 136, '2024-01-01');

-- ПМ - Участок
INSERT INTO tariffs (warehouse_code, operation_type, rate, norm_aei_per_hour, valid_from) VALUES
('ALL', 'ПМ Упаковка', 4.20, 88, '2024-01-01');

GO

PRINT 'Тарифы обновлены из Приложения 1!';
PRINT '';
SELECT operation_type, rate, norm_aei_per_hour FROM tariffs ORDER BY operation_type;
GO
