import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class SalaryService {
  constructor(
    private db: DatabaseService,
    private logger: LoggerService,
  ) {}

  /**
   * Получить зарплату за вчера
   */
  async getSalaryYesterday(userId: number) {
    const query = `
      SELECT 
        user_id,
        employee_id,
        fio,
        warehouse_code,
        warehouse_name,
        date,
        operations_count,
        total_aei,
        base_amount,
        quality_coefficient,
        total_amount
      FROM v_salary_by_day
      WHERE user_id = @userId
        AND date = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
    `;

    const result = await this.db.queryOne(query, { userId });
    
    return result || {
      total_amount: 0,
      operations_count: 0,
      total_aei: 0,
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    };
  }

  /**
   * Получить зарплату за текущий месяц
   */
  async getSalaryCurrentMonth(userId: number) {
    const query = `
      SELECT 
        user_id,
        employee_id,
        fio,
        warehouse_code,
        warehouse_name,
        year,
        month,
        period_start,
        operations_count,
        total_aei,
        base_amount,
        avg_quality_coefficient,
        total_amount
      FROM v_salary_by_month
      WHERE user_id = @userId
        AND year = YEAR(GETDATE())
        AND month = MONTH(GETDATE())
    `;

    const result = await this.db.queryOne(query, { userId });
    
    return result || {
      total_amount: 0,
      operations_count: 0,
      total_aei: 0,
      period_start: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Получить зарплату за произвольный период
   */
  async getSalaryByDateRange(userId: number, startDate: string, endDate: string) {
    const query = `
      SELECT 
        user_id,
        employee_id,
        fio,
        warehouse_code,
        warehouse_name,
        date,
        operations_count,
        total_aei,
        base_amount,
        quality_coefficient,
        total_amount
      FROM v_salary_by_day
      WHERE user_id = @userId
        AND date >= @startDate
        AND date <= @endDate
      ORDER BY date DESC
    `;

    const results = await this.db.query(query, { userId, startDate, endDate });

    // Агрегируем данные
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
  async getSalaryStats(userId: number) {
    const query = `
      SELECT 
        COUNT(DISTINCT CAST(operation_date AS DATE)) as total_work_days,
        COUNT(DISTINCT operation_id) as total_operations,
        SUM(aei_count) as total_aei,
        SUM(base_amount) as total_earned,
        AVG(base_amount) as avg_per_operation,
        MAX(operation_date) as last_operation_date
      FROM v_salary_details
      WHERE user_id = @userId
    `;

    return this.db.queryOne(query, { userId });
  }
}

