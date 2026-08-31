import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class SalaryService {
  constructor(
    private db: DatabaseService,
    private usersService: UsersService,
  ) {}

  private async userIdFilter(userId: number, employeeId?: string) {
    const ids = await this.usersService.findMatchingUserIds(employeeId, userId);
    return this.usersService.toUserIdIn(ids);
  }

  /**
   * Получить зарплату за вчера
   */
  async getSalaryYesterday(userId: number, employeeId?: string) {
    const { sql: inSql, params: inParams } = await this.userIdFilter(userId, employeeId);
    const query = `
      SELECT
        SUM(operations_count) as operations_count,
        SUM(total_aei) as total_aei,
        SUM(base_amount) as base_amount,
        SUM(total_amount) as total_amount,
        MAX(date) as date,
        MAX(employee_id) as employee_id,
        MAX(fio) as fio,
        MAX(warehouse_code) as warehouse_code,
        MAX(warehouse_name) as warehouse_name
      FROM v_salary_by_day
      WHERE user_id IN (${inSql})
        AND date = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
    `;

    const result = await this.db.queryOne(query, inParams);

    return {
      total_amount: result?.total_amount || 0,
      operations_count: result?.operations_count || 0,
      total_aei: result?.total_aei || 0,
      date: result?.date || new Date(Date.now() - 86400000).toISOString().split('T')[0],
    };
  }

  /**
   * Получить зарплату за текущий месяц
   */
  async getSalaryCurrentMonth(userId: number, employeeId?: string) {
    const { sql: inSql, params: inParams } = await this.userIdFilter(userId, employeeId);
    const query = `
      SELECT
        SUM(operations_count) as operations_count,
        SUM(total_aei) as total_aei,
        SUM(base_amount) as base_amount,
        SUM(total_amount) as total_amount,
        AVG(avg_quality_coefficient) as avg_quality_coefficient,
        MAX(year) as year,
        MAX(month) as month,
        MAX(period_start) as period_start,
        MAX(employee_id) as employee_id,
        MAX(fio) as fio,
        MAX(warehouse_code) as warehouse_code,
        MAX(warehouse_name) as warehouse_name
      FROM v_salary_by_month
      WHERE user_id IN (${inSql})
        AND year = YEAR(GETDATE())
        AND month = MONTH(GETDATE())
    `;

    const result = await this.db.queryOne(query, inParams);

    return {
      total_amount: result?.total_amount || 0,
      operations_count: result?.operations_count || 0,
      total_aei: result?.total_aei || 0,
      period_start: result?.period_start || new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Получить зарплату за произвольный период
   */
  async getSalaryByDateRange(userId: number, startDate: string, endDate: string, employeeId?: string) {
    const { sql: inSql, params: inParams } = await this.userIdFilter(userId, employeeId);
    const query = `
      SELECT
        MAX(employee_id) as employee_id,
        MAX(fio) as fio,
        MAX(warehouse_code) as warehouse_code,
        MAX(warehouse_name) as warehouse_name,
        date,
        SUM(operations_count) as operations_count,
        SUM(total_aei) as total_aei,
        SUM(base_amount) as base_amount,
        AVG(quality_coefficient) as quality_coefficient,
        SUM(total_amount) as total_amount
      FROM v_salary_by_day
      WHERE user_id IN (${inSql})
        AND date >= @startDate
        AND date <= @endDate
      GROUP BY date
      ORDER BY date DESC
    `;

    const results = await this.db.query(query, { ...inParams, startDate, endDate });

    const totalAmount = results.reduce((sum, row) => sum + (row.total_amount || 0), 0);
    const totalOperations = results.reduce((sum, row) => sum + (row.operations_count || 0), 0);
    const totalAei = results.reduce((sum, row) => sum + (row.total_aei || 0), 0);

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      summary: {
        total_amount: totalAmount,
        operations_count: totalOperations,
        total_aei: totalAei,
        work_days: results.length,
      },
      daily_breakdown: results,
    };
  }

  /**
   * Получить статистику по зарплате за все время
   */
  async getSalaryStats(userId: number, employeeId?: string) {
    const { sql: inSql, params: inParams } = await this.userIdFilter(userId, employeeId);
    const query = `
      SELECT
        COUNT(DISTINCT CAST(operation_date AS DATE)) as total_work_days,
        COUNT(DISTINCT operation_id) as total_operations,
        SUM(aei_count) as total_aei,
        SUM(base_amount) as total_earned,
        AVG(base_amount) as avg_per_operation,
        MAX(operation_date) as last_operation_date
      FROM v_salary_details
      WHERE user_id IN (${inSql})
    `;

    return this.db.queryOne(query, inParams);
  }
}
