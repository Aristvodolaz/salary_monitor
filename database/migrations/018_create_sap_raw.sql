-- =============================================
-- Migration 018: RAW-дамп записей из SAP
--
-- Таблица sap_raw хранит АБСОЛЮТНО ВСЕ записи,
-- полученные из SAP WHOSet, без какой-либо фильтрации.
--
-- Назначение:
--   - Контроль полноты импорта (сравнение с operations)
--   - Отладка: что именно пришло из SAP
--   - Аудит: какие WCR-коды встречаются, какие пропускаются
--   - Сравнение: raw_count vs processed_count по сотруднику
--
-- Поля:
--   sync_batch    — метка запуска импорта (дата+склад, напр. '2026-03-PPMC')
--   raw_*         — сырые данные из SAP без преобразований
--   parsed_*      — результат parseItem() (employee_id после нормализации)
--   wcr_known     — есть ли WCR в wcr_mapping на момент импорта
--   mapped_*      — что получилось после маппинга wcr_mapping
-- =============================================

USE SalaryMonitor;
GO

IF OBJECT_ID('sap_raw', 'U') IS NULL
BEGIN
  CREATE TABLE sap_raw (
    id               BIGINT        IDENTITY(1,1) PRIMARY KEY,

    -- Метка импорта (для группировки записей одного запуска)
    sync_batch       NVARCHAR(50)  NOT NULL,          -- напр. '2026-03-PPMC' или GUID

    -- ── RAW поля из SAP WHOSet (как пришло) ──────────────────────
    raw_lgnum        NVARCHAR(10)  NULL,              -- Lgnum (код склада)
    raw_employee_id  NVARCHAR(50)  NULL,              -- Employeeid (до нормализации)
    raw_created_by   NVARCHAR(50)  NULL,              -- CreatedBy (fallback)
    raw_mc_name1     NVARCHAR(100) NULL,              -- McName1 (имя)
    raw_mc_name2     NVARCHAR(100) NULL,              -- McName2 (фамилия)
    raw_wcr          NVARCHAR(50)  NULL,              -- Wcr (WCR-код как строка)
    raw_aei          NVARCHAR(50)  NULL,              -- ZsumAmountItm (строка)
    raw_prod         NVARCHAR(50)  NULL,              -- ZprodWtItm (строка)
    raw_actdura      NVARCHAR(50)  NULL,              -- Actdura (строка)
    raw_confirmed    NVARCHAR(50)  NULL,              -- ConfirmedDate строка /Date(ts)/
    raw_who          NVARCHAR(100) NULL,              -- Who (sap_order_id)
    raw_aarea        NVARCHAR(50)  NULL,              -- Aarea (зона)

    -- ── Результат parseItem() ─────────────────────────────────────
    parsed_employee_id  NVARCHAR(50)  NULL,           -- employee_id после нормализации
    parsed_aei_count    INT           NULL,           -- round(ZsumAmountItm)
    parsed_prod_count   INT           NULL,           -- round(ZprodWtItm)
    parsed_actdura      FLOAT         NULL,           -- Actdura как число
    parsed_date         DATETIME      NULL,           -- ConfirmedDate распарсенная
    parsed_skipped      BIT           DEFAULT 0,      -- 1 = parseItem вернул null (aei=0 AND prod=0 или нет empId)

    -- ── Результат маппинга через wcr_mapping ─────────────────────
    wcr_known           BIT           DEFAULT 0,      -- есть ли wcr в wcr_mapping
    mapped_operation_type  NVARCHAR(100) NULL,        -- operation_type из wcr_mapping (или сам wcr_code)
    mapped_participant_area NVARCHAR(100) NULL,        -- participant_area из wcr_mapping
    mapped_has_tariff   BIT           DEFAULT 0,      -- есть ли тариф для operation_type
    mapped_rate         FLOAT         NULL,           -- ставка тарифа (0 если не найден)
    mapped_amount       FLOAT         NULL,           -- рассчитанная сумма (cnt * rate)
    mapped_cnt          INT           NULL,           -- фактический счётчик (aei или prod, в зависимости от участка)

    -- ── Результат маппинга сотрудника ────────────────────────────
    user_found          BIT           DEFAULT 0,      -- нашли ли сотрудника в users
    user_id             INT           NULL,           -- id из таблицы users (если нашли)

    -- ── Служебное ─────────────────────────────────────────────────
    period_date         DATE          NULL,           -- дата запрошенного чанка
    warehouse_code      NVARCHAR(10)  NULL,           -- код склада (дублирует Lgnum для индекса)
    created_at          DATETIME      DEFAULT GETDATE()
  );

  PRINT 'sap_raw: таблица создана';
END
ELSE
  PRINT 'sap_raw: уже существует, пропускаем';
GO

-- Индексы
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sap_raw_batch' AND object_id=OBJECT_ID('sap_raw'))
  CREATE INDEX IX_sap_raw_batch ON sap_raw(sync_batch);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sap_raw_wh_date' AND object_id=OBJECT_ID('sap_raw'))
  CREATE INDEX IX_sap_raw_wh_date ON sap_raw(warehouse_code, period_date);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sap_raw_employee' AND object_id=OBJECT_ID('sap_raw'))
  CREATE INDEX IX_sap_raw_employee ON sap_raw(parsed_employee_id, period_date);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sap_raw_wcr' AND object_id=OBJECT_ID('sap_raw'))
  CREATE INDEX IX_sap_raw_wcr ON sap_raw(raw_wcr);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_sap_raw_skipped' AND object_id=OBJECT_ID('sap_raw'))
  CREATE INDEX IX_sap_raw_skipped ON sap_raw(parsed_skipped, wcr_known);
GO

SELECT
  OBJECT_ID('sap_raw', 'U') AS table_oid,
  (SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID('sap_raw')) AS index_count;
GO
