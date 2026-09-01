import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { sqlInclusiveDayRange } from '../common/sql-day-range';

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
      operation_id: 'sd.operation_id',
      operation_date: 'sd.operation_date',
      operation_type: 'sd.operation_type',
      participant_area: 'sd.participant_area',
      aei_count: 'sd.aei_count',
      rate: 'sd.rate',
      base_amount: 'sd.base_amount',
      warehouse_code: 'sd.warehouse_code',
      warehouse_name: 'sd.warehouse_name',
      employee_id: 'sd.employee_id',
      fio: 'sd.fio',
    };
    const safeSortColumn = sortColumns[sortBy] || 'sd.operation_date';
    const safeSortDirection = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { sql: inSql, params: inParams } = await this.userIdFilter(userId, employeeId);

    const day = sqlInclusiveDayRange('sd.operation_date');
    let query = `
      SELECT
        sd.operation_id,
        sd.user_id,
        sd.employee_id,
        sd.fio,
        sd.warehouse_code,
        sd.warehouse_name,
        sd.operation_type,
        sd.participant_area,
        sd.aei_count,
        sd.prod_count,
        sd.operation_date,
        sd.rate,
        sd.is_picking,
        sd.base_amount
      FROM v_salary_details sd
      WHERE sd.user_id IN (${inSql})
    `;

    const params: any = { ...inParams };

    if (startDate) {
      query += ` AND ${day.start}`;
      params.startDate = startDate;
    }

    if (endDate) {
      query += ` AND ${day.end}`;
      params.endDate = endDate;
    }

    query += `
      ORDER BY ${safeSortColumn} ${safeSortDirection}, sd.operation_id DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    params.offset = offset;
    params.limit = limit;

    const operations = await this.db.query(query, params);

    const countDay = sqlInclusiveDayRange('operation_date');
    let countQuery = `
      SELECT COUNT(*) as total
      FROM v_salary_details
      WHERE user_id IN (${inSql})
    `;

    if (startDate) {
      countQuery += ` AND ${countDay.start}`;
    }

    if (endDate) {
      countQuery += ` AND ${countDay.end}`;
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

    const day = sqlInclusiveDayRange('sd.operation_date');
    if (startDate) {
      query += ` AND ${day.start}`;
      params.startDate = startDate;
    }

    if (endDate) {
      query += ` AND ${day.end}`;
      params.endDate = endDate;
    }

    query += `
      GROUP BY sd.operation_type
      ORDER BY total_amount DESC
    `;

    return this.db.query(query, params);
  }
}
