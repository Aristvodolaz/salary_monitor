-- =============================================
-- Migration 022: журнал изменений расценок склада (wcr_warehouse_rate_log)
-- =============================================
-- Нужен для отката ставки к прошлому значению из интерфейса «Тарифы склада».
-- old_rate / new_rate = NULL означает «общая ставка» (индивидуальной нет).
-- Идемпотентно. Без таблицы приложение работает, но откат недоступен.
-- =============================================

USE SalaryMonitor;
GO

IF OBJECT_ID('wcr_warehouse_rate_log', 'U') IS NULL
BEGIN
    CREATE TABLE wcr_warehouse_rate_log (
        id             INT PRIMARY KEY IDENTITY(1,1),
        warehouse_code NVARCHAR(10)  NOT NULL,
        wcr_code       NVARCHAR(50)  NOT NULL,
        old_rate       DECIMAL(9,2)  NULL,
        new_rate       DECIMAL(9,2)  NULL,
        effective_from DATE          NOT NULL,
        action         NVARCHAR(20)  NOT NULL,   -- set | reset | rollback
        changed_by     INT           NULL,       -- users.id админа
        changed_at     DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_wcr_wh_rate_log_wh FOREIGN KEY (warehouse_code) REFERENCES warehouses(code)
    );
    CREATE INDEX idx_wcr_wh_rate_log_lookup ON wcr_warehouse_rate_log(warehouse_code, wcr_code, id DESC);
    PRINT N'  wcr_warehouse_rate_log создана';
END
ELSE
    PRINT N'  wcr_warehouse_rate_log уже существует';
GO
