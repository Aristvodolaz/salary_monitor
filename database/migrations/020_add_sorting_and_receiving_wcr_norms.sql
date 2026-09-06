-- =============================================
-- Migration 020: IN01/IN02/IN03 в wcr_norms (без тарифа, amount = 0)
-- =============================================
-- IN01 — «Участок сортировки» (метрика в эталонном своде «Число СЗ» — по факту
--        1 запись WHOSet = 1 заказ, т.е. count(*) операций за период).
-- IN02/IN03 — встречаются в своде «Выработка комплектация» с малым объёмом
--        (десятки единиц/мес) — приёмка, отдельная от IN01.
--
-- Ни у одного нет действующей ставки ₽ ни в одном справочнике — не выдумываем,
-- amount = 0 до появления тарифа. Это только чтобы объёмы (АЕИ-block/count)
-- перестали пропадать из operations — код уже поддерживает этот путь
-- (resolveOperation → wcrNormsMap fallback, тот же механизм, что и для RPL1-5
-- в 018_rpl_wcr_norms_and_views.sql).
--
-- ВАЖНО: пока не подтверждено вживую (нет доступа к SAP с этой машины), что
-- ZsumAmountItm (operations.count) для IN01 действительно равен 1 на запись,
-- как «Число СЗ» в своде. Если после ближайшего синка total_aei по IN01 не
-- совпадёт с числом заказов из свода — метрику придётся считать иначе
-- (COUNT(*) по sap_order_id, а не SUM(count)), это уже правка кода, не БД.
-- =============================================

USE SalaryMonitor;
GO

IF NOT EXISTS (SELECT 1 FROM wcr_norms WHERE wcr_code = N'IN01')
    INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
    VALUES (N'IN01', N'Участок сортировки (Число СЗ)', N'Сортировка', NULL, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_norms WHERE wcr_code = N'IN02')
    INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
    VALUES (N'IN02', N'Приёмка', N'Приёмка', NULL, 1);

IF NOT EXISTS (SELECT 1 FROM wcr_norms WHERE wcr_code = N'IN03')
    INSERT INTO wcr_norms (wcr_code, description, norm_type, norm_value, is_active)
    VALUES (N'IN03', N'Приёмка', N'Приёмка', NULL, 1);

PRINT N'✅ Migration 020: IN01/IN02/IN03 добавлены в wcr_norms, amount = 0 до появления тарифа';
GO
