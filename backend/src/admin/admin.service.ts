import { Injectable, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminService {
  constructor(
    private db: DatabaseService,
    private usersService: UsersService,
    private logger: LoggerService,
  ) {}

  /**
   * Получить всех сотрудников склада (только для админа)
   */
  async getEmployeesByWarehouse(adminUser: any, warehouseId?: number) {
    // Если не указан склад, используем склад админа
    const targetWarehouseId = warehouseId || adminUser.warehouseId;

    // Проверка: админ может видеть только свой склад
    if (adminUser.role === 'admin' && targetWarehouseId !== adminUser.warehouseId) {
      throw new ForbiddenException('Вы можете видеть только сотрудников вашего склада');
    }

    return this.usersService.findByWarehouse(targetWarehouseId);
  }

  /**
   * Получить зарплату всех сотрудников склада за период
   */
  async getWarehouseSalary(
    adminUser: any,
    startDate: string,
    endDate: string,
    warehouseId?: number,
  ) {
    const targetWarehouseId = warehouseId || adminUser.warehouseId;

    if (adminUser.role === 'admin' && targetWarehouseId !== adminUser.warehouseId) {
      throw new ForbiddenException('Вы можете видеть только данные вашего склада');
    }

    const query = `
      SELECT 
        sd.user_id,
        u.employee_id,
        u.fio,
        COUNT(DISTINCT CAST(sd.operation_date AS DATE)) as work_days,
        COUNT(DISTINCT sd.operation_id) as total_operations,
        SUM(sd.aei_count) as total_aei,
        SUM(sd.base_amount) as total_amount
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE u.warehouse_id = @warehouseId
        AND sd.operation_date >= @startDate
        AND sd.operation_date <= @endDate
      GROUP BY sd.user_id, u.employee_id, u.fio
      ORDER BY total_amount DESC
    `;

    return this.db.query(query, { warehouseId: targetWarehouseId, startDate, endDate });
  }

  /**
   * Экспорт данных в CSV-формат
   */
  async exportWarehouseSalary(
    adminUser: any,
    startDate: string,
    endDate: string,
    warehouseId?: number,
  ) {
    const data = await this.getWarehouseSalary(adminUser, startDate, endDate, warehouseId);

    // Формируем CSV
    const headers = ['Employee ID', 'ФИО', 'Рабочих дней', 'Операций', 'АЕИ', 'Сумма'];
    const rows = data.map(row => [
      row.employee_id,
      row.fio,
      row.work_days,
      row.total_operations,
      row.total_aei,
      row.total_amount.toFixed(2),
    ]);

    return {
      headers,
      rows,
      csv: this.convertToCSV([headers, ...rows]),
    };
  }

  /**
   * Статистика склада
   */
  async getWarehouseStats(adminUser: any, warehouseId?: number) {
    const targetWarehouseId = warehouseId || adminUser.warehouseId;

    if (adminUser.role === 'admin' && targetWarehouseId !== adminUser.warehouseId) {
      throw new ForbiddenException('Вы можете видеть только данные вашего склада');
    }

    const query = `
      SELECT 
        COUNT(DISTINCT user_id) as active_employees,
        COUNT(DISTINCT operation_type) as operation_types,
        SUM(aei_count) as total_aei,
        SUM(base_amount) as total_amount,
        COUNT(*) as total_operations
      FROM v_salary_details
      WHERE warehouse_code = (
        SELECT code FROM warehouses WHERE id = @warehouseId
      )
      AND operation_date >= DATEADD(MONTH, -1, GETDATE())
    `;

    return this.db.queryOne(query, { warehouseId: targetWarehouseId });
  }

  /**
   * Преобразование данных в CSV
   */
  private convertToCSV(data: any[][]): string {
    return data.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }
}

