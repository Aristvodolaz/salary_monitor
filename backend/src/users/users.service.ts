import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class UsersService {
  constructor(
    private db: DatabaseService,
    private logger: LoggerService,
  ) {}

  /**
   * Найти пользователя по employee_id (штрих-код)
   */
  async findByEmployeeId(employeeId: string) {
    const query = `
      SELECT 
        u.id,
        u.employee_id,
        u.fio,
        u.warehouse_id,
        u.role,
        u.is_active,
        w.code as warehouse_code,
        w.name as warehouse_name
      FROM users u
      INNER JOIN warehouses w ON u.warehouse_id = w.id
      WHERE u.employee_id = @employeeId
    `;

    return this.db.queryOne(query, { employeeId });
  }

  /**
   * Найти пользователя по ID
   */
  async findById(id: number) {
    const query = `
      SELECT 
        u.id,
        u.employee_id,
        u.fio,
        u.warehouse_id,
        u.role,
        u.is_active,
        w.code as warehouse_code,
        w.name as warehouse_name
      FROM users u
      INNER JOIN warehouses w ON u.warehouse_id = w.id
      WHERE u.id = @id
    `;

    return this.db.queryOne(query, { id });
  }

  /**
   * Получить всех пользователей склада (для админа)
   */
  async findByWarehouse(warehouseId: number) {
    const query = `
      SELECT 
        u.id,
        u.employee_id,
        u.fio,
        u.warehouse_id,
        u.role,
        u.is_active,
        w.code as warehouse_code,
        w.name as warehouse_name,
        u.created_at
      FROM users u
      INNER JOIN warehouses w ON u.warehouse_id = w.id
      WHERE u.warehouse_id = @warehouseId
      ORDER BY u.fio
    `;

    return this.db.query(query, { warehouseId });
  }
}

