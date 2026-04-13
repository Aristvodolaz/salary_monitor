-- ============================================================
-- 013_add_norms_operations.sql
-- Отдельная таблица для нормативных операций (АЕИ + комплектация).
-- Не связана с основной таблицей operations — данные заливаются
-- отдельным синком только по WCR-кодам из wcr_norms + wcr_picking_norms.
-- ============================================================

IF OBJECT_ID('norms_operations', 'U') IS NULL
BEGIN
  CREATE TABLE norms_operations (
    id               INT           IDENTITY(1,1) PRIMARY KEY,
    user_id          INT           NOT NULL REFERENCES users(id),
    warehouse_code   NVARCHAR(10)  NOT NULL,
    wcr_code         NVARCHAR(50)  NULL,
    operation_type   NVARCHAR(100) NOT NULL,
    participant_area  NVARCHAR(100) NULL,
    [count]          INT           NOT NULL DEFAULT 0,   -- АЕИ (ZsumAmountItm)
    prod_count       INT           NULL     DEFAULT 0,   -- задачи комплектации (ZprodWtItm)
    actdura          FLOAT         NULL,                 -- минуты
    operation_date   DATETIME      NOT NULL,
    amount           FLOAT         NULL,                 -- count * tariff.rate
    sap_order_id     NVARCHAR(50)  NULL,
    aarea            NVARCHAR(50)  NULL,
    created_at       DATETIME      DEFAULT GETDATE(),
    updated_at       DATETIME      DEFAULT GETDATE()
  );

  PRINT 'norms_operations: таблица создана';
END
ELSE
  PRINT 'norms_operations: уже существует, пропускаем';
GO

-- Индексы
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_norms_ops_user_date' AND object_id = OBJECT_ID('norms_operations'))
  CREATE INDEX IX_norms_ops_user_date ON norms_operations(user_id, operation_date);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_norms_ops_wh_date' AND object_id = OBJECT_ID('norms_operations'))
  CREATE INDEX IX_norms_ops_wh_date ON norms_operations(warehouse_code, operation_date);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_norms_ops_wcr' AND object_id = OBJECT_ID('norms_operations'))
  CREATE INDEX IX_norms_ops_wcr ON norms_operations(wcr_code);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_norms_ops_sap_order' AND object_id = OBJECT_ID('norms_operations'))
  CREATE INDEX IX_norms_ops_sap_order ON norms_operations(sap_order_id, operation_type);
GO

SELECT
  OBJECT_ID('norms_operations', 'U') AS table_oid,
  (SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID('norms_operations')) AS index_count;
GO
