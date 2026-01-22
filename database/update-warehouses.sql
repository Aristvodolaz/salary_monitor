-- =============================================
-- Обновление названий складов
-- =============================================

USE SPOe_rc;
GO

-- Обновляем названия складов
UPDATE warehouses SET name = 'СК Поларис' WHERE code = '01SS';
UPDATE warehouses SET name = 'СК ДМ офисный товар' WHERE code = '02DQ';
UPDATE warehouses SET name = 'РРЦ Южный Урал' WHERE code = '02SR';
UPDATE warehouses SET name = 'СК Пермь' WHERE code = '0SK1';
UPDATE warehouses SET name = 'СК Омск' WHERE code = '0SK2';
UPDATE warehouses SET name = 'СК Новосибирск' WHERE code = '0SK5';
UPDATE warehouses SET name = 'СК Шушары' WHERE code = '0SK6';
UPDATE warehouses SET name = 'СК Урал-Каскад' WHERE code = '0SK8';
UPDATE warehouses SET name = 'СК Урал-Мебель' WHERE code = '0SK9';
UPDATE warehouses SET name = 'РСД 4 ФУС' WHERE code = 'RR04';
GO

PRINT 'Названия складов обновлены!';
PRINT '';

-- Проверка результата
SELECT code, name FROM warehouses ORDER BY code;
GO
