-- =============================================
-- Migration 014: снимок заработка сотрудников по нормативам за период
-- =============================================

USE SalaryMonitor;
GO

IF OBJECT_ID('norms_employees_snapshot', 'U') IS NULL
BEGIN
    CREATE TABLE norms_employees_snapshot (
        id                  BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        period_start        DATE                 NOT NULL,
        period_end          DATE                 NOT NULL,
        warehouse_id        INT                  NOT NULL,
        user_id             INT                  NOT NULL,
        employee_id         NVARCHAR(50)         NOT NULL,
        fio                 NVARCHAR(255)        NOT NULL,
        work_days           INT                  NOT NULL CONSTRAINT DF_norms_emp_snap_days DEFAULT 0,
        total_aei           INT                  NOT NULL CONSTRAINT DF_norms_emp_snap_aei DEFAULT 0,
        aei_amount          FLOAT                NOT NULL CONSTRAINT DF_norms_emp_snap_aeiamt DEFAULT 0,
        total_prod          INT                  NOT NULL CONSTRAINT DF_norms_emp_snap_prod DEFAULT 0,
        picking_amount      FLOAT                NOT NULL CONSTRAINT DF_norms_emp_snap_pickamt DEFAULT 0,
        total_amount        FLOAT                NOT NULL CONSTRAINT DF_norms_emp_snap_totamt DEFAULT 0,
        created_at          DATETIME             NOT NULL CONSTRAINT DF_norms_emp_snap_created DEFAULT GETDATE()
    );

    CREATE INDEX idx_norms_emp_snapshot_period_wh
        ON norms_employees_snapshot(period_start, period_end, warehouse_id);

    CREATE INDEX idx_norms_emp_snapshot_user
        ON norms_employees_snapshot(user_id);

    PRINT N'✅ Таблица norms_employees_snapshot создана';
END
ELSE
BEGIN
    PRINT N'ℹ️  Таблица norms_employees_snapshot уже существует';
END
GO
