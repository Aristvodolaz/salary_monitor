import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class OperationsService {
  constructor(
    private db: DatabaseService,
    private usersService: UsersService,
  ) {}

  private async userIdFilter(userId: number, employeeId?: string) {
    const ids = await this.usersService.findMatchingUserIds(employeeId, userId);
    return this.usersService.toUserIdIn(ids);
  }

  /**
   * Получить операции пользователя за период
   */
  async getUserOperations(
    userId: number,
    startDate?: string,
    endDate?: string,
    limit: number = 100,
    offset: number = 0,
    sortBy: string = 'operation_date',
    sortOrder: string = 'desc',
    employeeId?: string,
  ) {
    const sortColumns: Record<string, string> = {
      operation_id: 'operation_id',
      operation_date: 'operation_date',
      operation_type: 'operation_type',
      participant_area: 'participant_area',
      aei_count: 'aei_count',
      rate: 'rate',
      base_amount: 'base_amount',
      warehouse_code: 'warehouse_code',
      warehouse_name: 'warehouse_name',
      employee_id: 'employee_id',
      fio: 'fio',
    };
    const safeSortColumn = sortColumns[sortBy] || 'operation_date';
    const safeSortDirection = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { sql: inSql, params: inParams } = await this.userIdFilter(userId, employeeId);

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
      WHERE user_id IN (${inSql})
    `;

    const params: any = { ...inParams };

    if (startDate) {
      query += ' AND operation_date >= @startDate';
      params.startDate = startDate;
    }

    if (endDate) {
      query += ' AND operation_date <= @endDate';
      params.endDate = endDate;
    }

    query += `
      ORDER BY ${safeSortColumn} ${safeSortDirection}, operation_id DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    params.offset = offset;
    params.limit = limit;

    const operations = await this.db.query(query, params);

    let countQuery = `
      SELECT COUNT(*) as total
      FROM operations
      WHERE user_id IN (${inSql})
    `;

    if (startDate) {
      countQuery += ' AND operation_date >= @startDate';
    }

    if (endDate) {
      countQuery += ' AND operation_date <= @endDate';
    }

    const countResult = await this.db.queryOne(countQuery, {
      ...inParams,
      startDate,
      endDate,
    });

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
   * Использует данные из v_salary_by_day для корректного учета коэффициента качества
   */
  async getOperationsByType(userId: number, startDate?: string, endDate?: string, employeeId?: string) {
    const { sql: inSql, params: inParams } = await this.userIdFilter(userId, employeeId);
    let query = `
      SELECT
        sd.operation_type,
        COUNT(DISTINCT sd.operation_id) as operations_count,
        SUM(sd.aei_count) as total_aei,
        SUM(sd.base_amount) as base_amount,
        SUM(CASE
          WHEN sbd.base_amount > 0 THEN sbd.total_amount * (sd.base_amount / sbd.base_amount)
          ELSE sd.base_amount
        END) as total_amount
      FROM v_salary_details sd
      INNER JOIN v_salary_by_day sbd ON
        sd.user_id = sbd.user_id
        AND CAST(sd.operation_date AS DATE) = sbd.date
      WHERE sd.user_id IN (${inSql})
    `;

    const params: any = { ...inParams };

    if (startDate) {
      query += ' AND sd.operation_date >= @startDate';
      params.startDate = startDate;
    }

    if (endDate) {
      query += ' AND sd.operation_date <= @endDate';
      params.endDate = endDate;
    }

    query += `
      GROUP BY sd.operation_type
      ORDER BY total_amount DESC
    `;

    return this.db.query(query, params);
  }
}
