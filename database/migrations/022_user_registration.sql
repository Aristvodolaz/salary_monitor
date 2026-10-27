-- =============================================
-- Migration 022: мини-регистрация (password_hash)
-- =============================================
USE SalaryMonitor;
GO

IF COL_LENGTH('users', 'password_hash') IS NULL
    ALTER TABLE users ADD password_hash NVARCHAR(100) NULL;
GO

IF COL_LENGTH('users', 'registered_at') IS NULL
    ALTER TABLE users ADD registered_at DATETIME NULL;
GO
