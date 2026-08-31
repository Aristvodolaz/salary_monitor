import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class UsersService {
  constructor(
    private db: DatabaseService,
    private logger: LoggerService,
  ) {}

  /** Сравнение табельных без ведущих нулей: 98123 и 00098123 — один человек. */
  private normalizeId(raw: string): string {
    const s = (raw || '').trim();
    if (!s) return '';
    const stripped = s.replace(/^0+/, '');
    return stripped === '' ? '0' : stripped;
  }

  private padEmployeeId(raw: string): string {
    return this.normalizeId(raw).padStart(8, '0');
  }

  /**
   * Вход: сначала sap_employees.personnel_number, ФИО = employee_name.
   * users нужен только для id/роли и FK операций. Админы без записи в SAP — fallback.
   */
  async findByEmployeeId(employeeId: string) {
    const input = (employeeId || '').trim();
    if (!input) return null;

    const fromSap = await this.findInSapEmployees(input);
    if (fromSap) return fromSap;

    return this.findInUsersTable(input);
  }

  /**
   * Найти пользователя по ID (JWT /me)
   */
  async findById(id: number) {
    const user = await this.db.queryOne<any>(
      `SELECT
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
       WHERE u.id = @id`,
      { id },
    );
    if (!user) return null;

    const sap = await this.findSapRowByPersonnel(user.employee_id, user.warehouse_code);
    return this.toPublicUser({
      id: user.id,
      employee_id: sap?.personnel_number || user.employee_id,
      fio: sap?.employee_name || user.fio,
      warehouse_id: user.warehouse_id,
      role: user.role,
      is_active: user.is_active && (sap ? sap.is_active : true),
      warehouse_code: sap ? sap.lgnum : user.warehouse_code,
      warehouse_name: user.warehouse_name,
    });
  }

  /**
   * Получить всех пользователей склада (для админа)
   */
  async findByWarehouse(warehouseId: number) {
    const warehouse = await this.db.queryOne<{ code: string; name: string }>(
      `SELECT code, name FROM warehouses WHERE id = @warehouseId`,
      { warehouseId },
    );
    if (!warehouse) return [];

    const sapRows = await this.db.query<any>(
      `SELECT personnel_number, employee_name, lgnum, is_active
       FROM sap_employees
       WHERE lgnum = @code AND is_active = 1
       ORDER BY employee_name`,
      { code: warehouse.code },
    );

    if (sapRows.length > 0) {
      const users = await this.db.query<any>(
        `SELECT id, employee_id, role, is_active FROM users`,
      );
      const userByNorm = new Map<string, any>();
      for (const u of users) {
        userByNorm.set(this.normalizeId(u.employee_id), u);
      }

      return sapRows.map((e) => {
        const u = userByNorm.get(this.normalizeId(e.personnel_number));
        return this.toPublicUser({
          id: u?.id ?? 0,
          employee_id: e.personnel_number,
          fio: e.employee_name,
          warehouse_id: warehouseId,
          role: u?.role || 'employee',
          is_active: e.is_active && (u ? u.is_active : true),
          warehouse_code: warehouse.code,
          warehouse_name: warehouse.name,
        });
      });
    }

    return this.db.query(
      `SELECT
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
       ORDER BY u.fio`,
      { warehouseId },
    );
  }

  private async findInSapEmployees(input: string) {
    const padded = this.padEmployeeId(input);
    const stripped = this.normalizeId(input);

    const sapRows = await this.db.query<any>(
      `SELECT
         e.personnel_number,
         e.employee_name,
         e.lgnum,
         e.is_active,
         w.id as warehouse_id,
         w.code as warehouse_code,
         w.name as warehouse_name
       FROM sap_employees e
       INNER JOIN warehouses w ON w.code = e.lgnum
       WHERE e.is_active = 1
         AND (
           e.personnel_number = @input
           OR e.personnel_number = @stripped
           OR e.personnel_number = @padded
           OR RIGHT(REPLICATE('0', 8) + LTRIM(e.personnel_number), 8) = @padded
         )`,
      { input, stripped, padded },
    );

    const emp = sapRows.find(
      (e) => this.normalizeId(e.personnel_number) === stripped,
    );
    if (!emp) return null;

    const userRow = await this.ensureUserRow(
      emp.personnel_number,
      emp.employee_name,
      emp.warehouse_id,
    );

    return this.toPublicUser({
      id: userRow.id,
      employee_id: emp.personnel_number,
      fio: emp.employee_name,
      warehouse_id: emp.warehouse_id,
      role: userRow.role,
      is_active: emp.is_active && userRow.is_active,
      warehouse_code: emp.warehouse_code,
      warehouse_name: emp.warehouse_name,
    });
  }

  private async findInUsersTable(input: string) {
    const padded = this.padEmployeeId(input);
    const stripped = this.normalizeId(input);

    const users = await this.db.query<any>(
      `SELECT
         u.id,
         u.employee_id,
         u.fio,
         u.warehouse_id,
         u.role,
         u.is_active,
         w.code as warehouse_code,
         w.name as warehouse_name
       FROM users u
       INNER JOIN warehouses w ON u.warehouse_id = w.id`,
    );

    const user = users.find(
      (u) =>
        this.normalizeId(u.employee_id) === stripped ||
        u.employee_id === input ||
        u.employee_id === padded,
    );
    if (!user) return null;

    return this.toPublicUser(user);
  }

  private async findSapRowByPersonnel(employeeId: string, warehouseCode?: string) {
    const stripped = this.normalizeId(employeeId);
    const rows = await this.db.query<any>(
      `SELECT personnel_number, employee_name, lgnum, is_active
       FROM sap_employees
       WHERE is_active = 1`,
    );
    const matches = rows.filter((e) => this.normalizeId(e.personnel_number) === stripped);
    if (warehouseCode) {
      const local = matches.find((e) => e.lgnum === warehouseCode);
      if (local) return local;
    }
    return matches[0] || null;
  }

  /** Нужен users.id для JWT и operations.user_id. */
  private async ensureUserRow(personnelNumber: string, fio: string, warehouseId: number) {
    const users = await this.db.query<any>(`SELECT id, employee_id, role, is_active FROM users`);
    const existing = users.find(
      (u) => this.normalizeId(u.employee_id) === this.normalizeId(personnelNumber),
    );
    if (existing) return existing;

    const employeeId = this.padEmployeeId(personnelNumber);
    try {
      await this.db.execute(
        `INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
         VALUES (@employeeId, @fio, @warehouseId, 'employee', 1)`,
        { employeeId, fio, warehouseId },
      );
    } catch (err) {
      if (!String(err.message).includes('UNIQUE') && !String(err.message).includes('duplicate')) {
        throw err;
      }
    }

    const created = await this.db.queryOne<any>(
      `SELECT id, employee_id, role, is_active FROM users WHERE employee_id = @employeeId`,
      { employeeId },
    );
    return created || { id: 0, role: 'employee', is_active: true };
  }

  private toPublicUser(row: any) {
    return {
      id: row.id,
      employeeId: row.employee_id,
      employee_id: row.employee_id,
      fio: row.fio,
      role: row.role,
      warehouseId: row.warehouse_id,
      warehouse_id: row.warehouse_id,
      warehouse_code: row.warehouse_code,
      warehouse_name: row.warehouse_name,
      is_active: row.is_active,
    };
  }
}
