-- Добавление недостающих WCR кодов в справочник
-- Основано на анализе данных из SAP за февраль 2026

USE SalaryMonitor;
GO

-- Приёмка (Inbound)
INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area) VALUES
('IN01', 'ПМ Приёмка', 'ПМ'),
('IN03', 'ПМ Приёмка', 'ПМ'),
('IV02', 'ПМ Инвентаризация', 'ПМ');

-- Размещение (Putaway)
INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area) VALUES
('PU02', 'ПМ Размещение', 'ПМ');

-- Пополнение (Replenishment)
INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area) VALUES
('RPL1', 'ПМ Пополнение', 'ПМ'),
('RPL2', 'ПМ Пополнение', 'ПМ'),
('RPL5', 'ПМ Пополнение', 'ПМ');

-- Погрузка/Разгрузка (Unloading)
INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area) VALUES
('UL01', 'ПМ Погрузка', 'ПМ');

-- Упаковка (Packing) - дополнительные коды
INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area) VALUES
('PKST', 'ФС Упаковка', 'ФС'),
('P2ST', 'М2 Упаковка', 'М2');

-- Работа с HU (Handling Units)
INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area) VALUES
('HU2P', 'ПМ Работа с HU', 'ПМ'),
('HU01', 'ПМ Работа с HU', 'ПМ');

GO

-- Проверка: вывести все WCR коды
SELECT wcr_code, operation_type, participant_area 
FROM wcr_mapping 
ORDER BY wcr_code;
GO
