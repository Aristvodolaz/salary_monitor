-- =============================================
-- Migration 016: Уточнение уникального индекса для UPSERT операций
-- Добавляем wcr_code в уникальный ключ, чтобы строки одного заказа (SAP WHO)
-- с разными WCR кодами не перезаписывали друг друга при MERGE.
-- =============================================

USE SalaryMonitor;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

PRINT 'Удаление старого индекса idx_ops_upsert_key...';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_ops_upsert_key' AND object_id = OBJECT_ID('operations'))
BEGIN
    DROP INDEX idx_ops_upsert_key ON operations;
END
GO

PRINT 'Создание нового индекса idx_ops_upsert_key (user_id, sap_order_id, operation_type, wcr_code)...';
-- Используем wcr_code в уникальном ключе (игнорируем NULL для sap_order_id или wcr_code, так как MERGE для них работает как INSERT)
CREATE UNIQUE INDEX idx_ops_upsert_key
    ON operations(user_id, sap_order_id, operation_type, wcr_code)
    WHERE sap_order_id IS NOT NULL AND wcr_code IS NOT NULL;
GO

PRINT '✅ Migration 016 completed: idx_ops_upsert_key обновлен';
COMMIT TRANSACTION;
GO
