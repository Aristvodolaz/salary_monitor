import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class OperationsService {
  constructor(
    private db: DatabaseService,
    private logger: LoggerService,
  ) {}

  /**
   * Получить операции пользователя за период
   */
  async getUserOperations(
    userId: number,
    startDate?: string,
    endDate?: string,
    limit: number = 100,
    offset: number = 0,
  ) {
    let query = `
      SELECT 
        operation_id,
        user_id,
        employee_id,
        fio,
        warehouse_code,
        warehouse_name,
        operation_type,
        participant_area,
        aei_count,
        operation_date,
        rate,
        base_amount
      FROM v_salary_details
      WHERE user_id = @userId
    `;

    const params: any = { userId };

    if (startDate) {
      query += ' AND operation_date >= @startDate';
      params.startDate = startDate;
    }

    if (endDate) {
      query += ' AND operation_date <= @endDate';
      params.endDate = endDate;
    }

    query += `
      ORDER BY operation_date DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    params.offset = offset;
    params.limit = limit;

    const operations = await this.db.query(query, params);

    // Получить общее количество записей
    let countQuery = `
      SELECT COUNT(*) as total
      FROM operations
      WHERE user_id = @userId
    `;

    if (startDate) {
      countQuery += ' AND operation_date >= @startDate';
    }

    if (endDate) {
      countQuery += ' AND operation_date <= @endDate';
    }

    const countResult = await this.db.queryOne(countQuery, { userId, startDate, endDate });

    return {
      operations,
      pagination: {
        total: countResult?.total || 0,
        limit,
        offset,
        hasMore: offset + operations.length < (countResult?.total || 0),
      },
    };
  }

  /**
   * Получить группированные операции по типам за период
   * Использует данные из v_salary_by_day для учета коэффициента качества
   */
  async getOperationsByType(userId: number, startDate?: string, endDate?: string) {
    let query = `
      SELECT 
        sd.operation_type,
        COUNT(DISTINCT sd.operation_id) as operations_count,
        SUM(sd.aei_count) as total_aei,
        SUM(sd.base_amount) as base_amount,
        SUM(sd.base_amount * COALESCE(sbd.quality_coefficient, 1.0)) as total_amount,
        AVG(sd.base_amount) as avg_amount
      FROM v_salary_details sd
      LEFT JOIN v_salary_by_day sbd ON 
        sd.user_id = sbd.user_id 
        AND CAST(sd.operation_date AS DATE) = sbd.date
      WHERE sd.user_id = @userId
    `;

    const params: any = { userId };

    if (startDate) {
      query += ' AND sd.operation_date >= @startDate';
      params.startDate = startDate;
    }

    if (endDate) {
      query += ' AND sd.operation_date <= @endDate';
      params.endDate = endDate;
    }

    query += ' GROUP BY sd.operation_type ORDER BY total_amount DESC';

    return this.db.query(query, params);
  }
}

