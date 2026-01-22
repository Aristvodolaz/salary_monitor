-- =============================================
-- SalaryMonitor Database Schema
-- MS SQL Server 2016+
-- =============================================

USE master;
GO

-- Создание базы данных (если не существует)
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'SalaryMonitor')
BEGIN
    CREATE DATABASE SalaryMonitor;
END;
GO

USE SalaryMonitor;
GO

-- =============================================
-- Таблица: Склады
-- =============================================
IF OBJECT_ID('warehouses', 'U') IS NOT NULL DROP TABLE warehouses;
GO

CREATE TABLE warehouses (
    id INT PRIMARY KEY IDENTITY(1,1),
    code NVARCHAR(10) UNIQUE NOT NULL,
    name NVARCHAR(255) NOT NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE()
);
GO

CREATE INDEX idx_warehouses_code ON warehouses(code);
GO

-- =============================================
-- Таблица: Пользователи
-- =============================================
IF OBJECT_ID('users', 'U') IS NOT NULL DROP TABLE users;
GO

CREATE TABLE users (
    id INT PRIMARY KEY IDENTITY(1,1),
    employee_id NVARCHAR(50) UNIQUE NOT NULL,  -- ШК из SAP (Employeeid)
    fio NVARCHAR(255) NOT NULL,
    warehouse_id INT NOT NULL,
    role NVARCHAR(50) DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);
GO

CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_users_warehouse_id ON users(warehouse_id);
CREATE INDEX idx_users_role ON users(role);
GO

-- =============================================
-- Таблица: Тарифы (расценки)
-- =============================================
IF OBJECT_ID('tariffs', 'U') IS NOT NULL DROP TABLE tariffs;
GO

CREATE TABLE tariffs (
    id INT PRIMARY KEY IDENTITY(1,1),
    warehouse_code NVARCHAR(10) NOT NULL,
    operation_type NVARCHAR(100) NOT NULL,
    rate FLOAT NOT NULL,                         -- расценка за 1 АЕИ
    norm_aei_per_hour INT,                       -- норма АЕИ в час
    is_active BIT DEFAULT 1,
    valid_from DATE DEFAULT CAST(GETDATE() AS DATE),
    valid_to DATE,
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (warehouse_code) REFERENCES warehouses(code)
);
GO

CREATE INDEX idx_tariffs_warehouse_operation ON tariffs(warehouse_code, operation_type);
CREATE INDEX idx_tariffs_dates ON tariffs(valid_from, valid_to);
GO

-- =============================================
-- Таблица: Операции (из SAP)
-- =============================================
IF OBJECT_ID('operations', 'U') IS NOT NULL DROP TABLE operations;
GO

CREATE TABLE operations (
    id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    warehouse_code NVARCHAR(10) NOT NULL,
    operation_type NVARCHAR(100) NOT NULL,
    count INT NOT NULL,                          -- количество АЕИ
    operation_date DATETIME NOT NULL,
    amount FLOAT,                                -- рассчитанная сумма
    sap_order_id NVARCHAR(100),                 -- ID заказа из SAP
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (warehouse_code) REFERENCES warehouses(code)
);
GO

CREATE INDEX idx_operations_user_date ON operations(user_id, operation_date);
CREATE INDEX idx_operations_warehouse ON operations(warehouse_code);
CREATE INDEX idx_operations_date ON operations(operation_date);
CREATE INDEX idx_operations_sap_order ON operations(sap_order_id);
GO

-- =============================================
-- Таблица: Матрица качества
-- =============================================
IF OBJECT_ID('quality_matrix', 'U') IS NOT NULL DROP TABLE quality_matrix;
GO

CREATE TABLE quality_matrix (
    errors_count INT PRIMARY KEY,
    k_value FLOAT NOT NULL,                      -- коэффициент качества
    description NVARCHAR(255)
);
GO

-- =============================================
-- Таблица: Сводка по зарплате
-- =============================================
IF OBJECT_ID('salary_summary', 'U') IS NOT NULL DROP TABLE salary_summary;
GO

CREATE TABLE salary_summary (
    id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_amount FLOAT NOT NULL,
    quality_coefficient FLOAT DEFAULT 1.0,
    errors_count INT DEFAULT 0,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
GO

CREATE INDEX idx_salary_user_period ON salary_summary(user_id, period_start, period_end);
GO

-- =============================================
-- Таблица: Логи синхронизации с SAP
-- =============================================
IF OBJECT_ID('sync_logs', 'U') IS NOT NULL DROP TABLE sync_logs;
GO

CREATE TABLE sync_logs (
    id INT PRIMARY KEY IDENTITY(1,1),
    warehouse_code NVARCHAR(10),
    sync_start DATETIME NOT NULL,
    sync_end DATETIME,
    status NVARCHAR(50) CHECK (status IN ('running', 'success', 'failed')),
    records_processed INT DEFAULT 0,
    error_message NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE()
);
GO

CREATE INDEX idx_sync_logs_warehouse ON sync_logs(warehouse_code);
CREATE INDEX idx_sync_logs_date ON sync_logs(sync_start);
GO

PRINT 'Database schema created successfully!';

