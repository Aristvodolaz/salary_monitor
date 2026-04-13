-- =============================================
-- Migration 012: снимок статистики нормативов WCR за период (выгрузка с бэка в БД)
-- =============================================

USE SalaryMonitor;
GO

IF OBJECT_ID('norms_stats_snapshot', 'U') IS NULL
BEGIN
    CREATE TABLE norms_stats_snapshot (
        id                  BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        period_start        DATE                 NOT NULL,
        period_end          DATE                 NOT NULL,
        warehouse_code      NVARCHAR(20)         NULL,  -- NULL = свод по всем складам
        wcr_code            NVARCHAR(50)         NOT NULL,
        description         NVARCHAR(255)        NOT NULL,
        norm_type           NVARCHAR(100)        NOT NULL,
        norm_value          FLOAT                NULL,
        total_aei           INT                  NOT NULL CONSTRAINT DF_norms_snap_aei DEFAULT 0,
        total_operations    INT                  NOT NULL CONSTRAINT DF_norms_snap_ops DEFAULT 0,
        total_actdura_min   INT                  NOT NULL CONSTRAINT DF_norms_snap_dur DEFAULT 0,
        actual_aei_per_hour FLOAT                NULL,
        norm_pct            FLOAT                NULL,
        created_at          DATETIME             NOT NULL CONSTRAINT DF_norms_snap_created DEFAULT GETDATE()
    );

    CREATE INDEX idx_norms_snapshot_period_wh
        ON norms_stats_snapshot(period_start, period_end, warehouse_code);

    CREATE INDEX idx_norms_snapshot_wcr
        ON norms_stats_snapshot(wcr_code);

    PRINT N'✅ Таблица norms_stats_snapshot создана';
END
ELSE
BEGIN
    PRINT N'ℹ️  Таблица norms_stats_snapshot уже существует';
END
GO
