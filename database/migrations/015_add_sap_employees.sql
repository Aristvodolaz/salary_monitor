-- =============================================
-- Migration 015: справочник сотрудников из SAP z_employee (OData4)
-- =============================================

USE SalaryMonitor;
GO

IF OBJECT_ID('sap_employees', 'U') IS NULL
BEGIN
    CREATE TABLE sap_employees (
        id                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        lgnum              NVARCHAR(10)  NOT NULL,   -- склад (WHOSet.Lgnum)
        rsrc               NVARCHAR(100) NOT NULL,   -- ресурс SAP (Processor / Rsrc)
        personnel_number   NVARCHAR(50)  NOT NULL,   -- табельный номер
        employee_name      NVARCHAR(255) NOT NULL,   -- ФИО из SAP
        jobgr              NVARCHAR(20)  NULL,       -- код должности
        jobgr_text         NVARCHAR(255) NULL,       -- название должности
        is_active          BIT           NOT NULL CONSTRAINT DF_sap_emp_active DEFAULT 1,
        synced_at          DATETIME      NOT NULL CONSTRAINT DF_sap_emp_synced DEFAULT GETDATE(),
        created_at         DATETIME      NOT NULL CONSTRAINT DF_sap_emp_created DEFAULT GETDATE(),
        updated_at         DATETIME      NOT NULL CONSTRAINT DF_sap_emp_updated DEFAULT GETDATE()
    );

    CREATE UNIQUE INDEX ux_sap_employees_wh_pers
        ON sap_employees(lgnum, personnel_number);

    CREATE INDEX idx_sap_employees_personnel
        ON sap_employees(personnel_number);

    CREATE INDEX idx_sap_employees_rsrc
        ON sap_employees(lgnum, rsrc);

    PRINT N'Таблица sap_employees создана';
END
ELSE
BEGIN
    PRINT N'Таблица sap_employees уже существует';
END
GO
