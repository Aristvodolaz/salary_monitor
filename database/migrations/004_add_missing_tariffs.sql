-- Добавление тарифов для новых типов операций
USE SalaryMonitor;
GO

INSERT INTO tariffs (warehouse_code, operation_type, rate) VALUES
('ALL', 'ПМ Приёмка', 3.5),
('ALL', 'ПМ Размещение', 2.8),
('ALL', 'ПМ Пополнение', 2.5),
('ALL', 'ПМ Погрузка', 3.2),
('ALL', 'ПМ Инвентаризация', 2.0),
('ALL', 'ПМ Работа с HU', 2.3);
GO

-- Проверка: вывести все тарифы
SELECT operation_type, rate 
FROM tariffs 
ORDER BY operation_type;
GO
