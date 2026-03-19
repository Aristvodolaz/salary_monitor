-- Migration 005: Add PDO2 WCR mapping
-- PDO2 = Коробочное комплектование, Стеллаж ДО микс (ФС ДО коробочный микс)
-- Tariff: "ДО Коробочная комплектация" = 7.1 руб/АЕИ (already exists in tariffs)
-- Confirmed 2026-03-19

IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = 'PDO2')
BEGIN
    INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active, description)
    VALUES (
        'PDO2',
        'ДО Коробочная комплектация',
        'ДО',
        1,
        'Коробочное комплектование Стеллаж ДО микс. Подтверждено 2026-03-19'
    );
    PRINT 'PDO2 added → ДО Коробочная комплектация (rate=7.1)';
END
ELSE
BEGIN
    UPDATE wcr_mapping
    SET operation_type = 'ДО Коробочная комплектация',
        participant_area = 'ДО',
        is_active = 1,
        description = 'Коробочное комплектование Стеллаж ДО микс. Подтверждено 2026-03-19'
    WHERE wcr_code = 'PDO2';
    PRINT 'PDO2 updated → ДО Коробочная комплектация (rate=7.1)';
END
GO
