-- ═══════════════════════════════════════════════════════════════
--  Миграция 011: добавить wcr_code и aarea в таблицу operations
-- ═══════════════════════════════════════════════════════════════
--
--  Зачем:
--    - wcr_code: сохранять оригинальный WCR-код из SAP (RPL1/RPL2/RPL3/...)
--      для отладки и будущей фильтрации по сотруднику/зоне
--    - aarea: зона активности (Activity Area) из SAP WHOSet.Aarea —
--      позволит отфильтровать только ФС-зону (salary-relevant)
--
--  Проблема, которую решаем (обнаружена при анализе февраля 2026):
--    RPL1 для некоторых сотрудников (Тупелекин, Таженов, Захаров, Турсунов)
--    является salary-relevant и должен попадать в ФС_Коробочная.
--    Для других сотрудников (Денисов, Гозиев и пр.) RPL1 не является
--    salary-relevant — это репленишмент в другой зоне склада.
--    Поле Aarea в SAP позволит различить эти случаи при следующем синке.
-- ═══════════════════════════════════════════════════════════════

-- 1. Добавляем колонки
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'operations' AND COLUMN_NAME = 'wcr_code'
)
  ALTER TABLE operations ADD wcr_code NVARCHAR(10) NULL;

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'operations' AND COLUMN_NAME = 'aarea'
)
  ALTER TABLE operations ADD aarea NVARCHAR(10) NULL;

-- 2. Индекс для быстрого поиска по wcr_code
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_operations_wcr_code' AND object_id = OBJECT_ID('operations')
)
  CREATE INDEX IX_operations_wcr_code ON operations (wcr_code) WHERE wcr_code IS NOT NULL;

-- 3. Информация
SELECT
  'Миграция 011 применена' AS status,
  COUNT(*) AS total_operations,
  SUM(CASE WHEN wcr_code IS NOT NULL THEN 1 ELSE 0 END) AS with_wcr_code,
  SUM(CASE WHEN aarea IS NOT NULL THEN 1 ELSE 0 END) AS with_aarea
FROM operations;
