import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
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

    try {
      const fromSap = await this.findInSapEmployees(input);
      if (fromSap) return fromSap;
    } catch (err) {
      this.logger.error(`sap_employees недоступен при входе: ${err.message}`);
    }

    return this.findInUsersTable(input);
  }

  /**
   * Все users.id с тем же табельным: 100029, 000100029 и sap_employees.personnel_number / rsrc.
   * Нужно, чтобы заработок нашёл операции, привязанные к дублю users (паддинг / старый ШК).
   */
  async findMatchingUserIds(personnelNumber?: string, extraUserId?: number): Promise<number[]> {
    const ids = new Set<number>();
    if (Number.isInteger(extraUserId) && extraUserId > 0) ids.add(extraUserId);

    const input = (personnelNumber || '').trim();
    if (!input) return [...ids];

    const padded = this.padEmployeeId(input);
    const stripped = this.normalizeId(input);
    const rows = await this.queryNvarchar<{ id: number }>(
      `SELECT DISTINCT u.id
       FROM users u
       WHERE LTRIM(RTRIM(u.employee_id)) IN (@input, @stripped, @padded)
          OR RIGHT(REPLICATE('0', 8) + LTRIM(RTRIM(u.employee_id)), 8) = @padded
          OR EXISTS (
            SELECT 1 FROM sap_employees e
            WHERE (e.is_active = 1 OR e.is_active IS NULL)
              AND (
                LTRIM(RTRIM(e.personnel_number)) IN (@input, @stripped, @padded)
                OR RIGHT(REPLICATE('0', 8) + LTRIM(RTRIM(e.personnel_number)), 8) = @padded
              )
              AND (
                RIGHT(REPLICATE('0', 8) + LTRIM(RTRIM(u.employee_id)), 8)
                  = RIGHT(REPLICATE('0', 8) + LTRIM(RTRIM(e.personnel_number)), 8)
                OR LTRIM(RTRIM(u.employee_id)) = LTRIM(RTRIM(e.rsrc))
                OR LTRIM(RTRIM(u.employee_id)) = LTRIM(RTRIM(e.personnel_number))
              )
          )`,
      { input, stripped, padded },
    );
    for (const row of rows) {
      if (row?.id > 0) ids.add(row.id);
    }
    return [...ids];
  }

  /** Плейсхолдеры для WHERE user_id IN (...) — только целые id из БД. */
  toUserIdIn(ids: number[]): { sql: string; params: Record<string, number> } {
    const safe = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (safe.length === 0) return { sql: 'NULL', params: {} };
    const params: Record<string, number> = {};
    const sqlFrag = safe
      .map((id, i) => {
        params[`pUserId${i}`] = id;
        return `@pUserId${i}`;
      })
      .join(', ');
    return { sql: sqlFrag, params };
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
       LEFT JOIN warehouses w ON u.warehouse_id = w.id
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

    const sapRows = await this.queryNvarchar<any>(
      `SELECT
         e.personnel_number,
         e.employee_name,
         e.lgnum,
         e.is_active,
         w.id as warehouse_id,
         w.code as warehouse_code,
         w.name as warehouse_name
       FROM sap_employees e
       LEFT JOIN warehouses w ON LTRIM(RTRIM(w.code)) = LTRIM(RTRIM(e.lgnum))
       WHERE (e.is_active = 1 OR e.is_active IS NULL)
         AND (
           LTRIM(RTRIM(e.personnel_number)) IN (@input, @stripped, @padded)
           OR RIGHT(REPLICATE('0', 8) + LTRIM(RTRIM(e.personnel_number)), 8) = @padded
         )`,
      { input, stripped, padded },
    );

    const emp =
      sapRows.find((e) => this.normalizeId(e.personnel_number) === stripped && e.warehouse_id) ||
      sapRows.find((e) => this.normalizeId(e.personnel_number) === stripped) ||
      sapRows[0];
    if (!emp) return null;

    let warehouseId = emp.warehouse_id;
    let warehouseCode = emp.warehouse_code || emp.lgnum;
    let warehouseName = emp.warehouse_name;
    if (!warehouseId) {
      const fallback = await this.db.queryOne<any>(
        `SELECT TOP 1 id, code, name FROM warehouses WHERE is_active = 1 ORDER BY id`,
      );
      warehouseId = fallback?.id;
      warehouseCode = fallback?.code || emp.lgnum;
      warehouseName = fallback?.name || emp.lgnum;
    }
    if (!warehouseId) return null;

    const userRow = await this.ensureUserRow(
      emp.personnel_number,
      emp.employee_name,
      warehouseId,
    );

    return this.toPublicUser({
      id: userRow.id,
      employee_id: emp.personnel_number,
      fio: emp.employee_name,
      warehouse_id: warehouseId,
      role: userRow.role,
      is_active: emp.is_active !== false && emp.is_active !== 0 && userRow.is_active,
      warehouse_code: warehouseCode,
      warehouse_name: warehouseName,
    });
  }

  private async findInUsersTable(input: string) {
    const padded = this.padEmployeeId(input);
    const stripped = this.normalizeId(input);

    const users = await this.queryNvarchar<any>(
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
       LEFT JOIN warehouses w ON u.warehouse_id = w.id
       WHERE LTRIM(RTRIM(u.employee_id)) IN (@input, @stripped, @padded)
          OR RIGHT(REPLICATE('0', 8) + LTRIM(RTRIM(u.employee_id)), 8) = @padded`,
      { input, stripped, padded },
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
    const padded = this.padEmployeeId(personnelNumber);
    const stripped = this.normalizeId(personnelNumber);
    const existingRows = await this.queryNvarchar<any>(
      `SELECT id, employee_id, role, is_active FROM users
       WHERE LTRIM(RTRIM(employee_id)) IN (@input, @stripped, @padded)
          OR RIGHT(REPLICATE('0', 8) + LTRIM(RTRIM(employee_id)), 8) = @padded`,
      { input: String(personnelNumber).trim(), stripped, padded },
    );
    const matches = existingRows.filter(
      (u) => this.normalizeId(u.employee_id) === stripped,
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const preferred = await this.preferUserWithOperations(matches);
      if (preferred) return preferred;
    }

    try {
      const request = this.db.getPool().request();
      request.input('employeeId', sql.NVarChar(50), padded);
      request.input('fio', sql.NVarChar(255), fio);
      request.input('warehouseId', sql.Int, warehouseId);
      await request.query(
        `INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
         VALUES (@employeeId, @fio, @warehouseId, 'employee', 1)`,
      );
    } catch (err) {
      if (!String(err.message).includes('UNIQUE') && !String(err.message).includes('duplicate')) {
        throw err;
      }
    }

    const created = await this.queryNvarchar<any>(
      `SELECT id, employee_id, role, is_active FROM users
       WHERE LTRIM(RTRIM(employee_id)) IN (@input, @stripped, @padded)`,
      { input: padded, stripped, padded },
    );
    return created[0] || { id: 0, role: 'employee', is_active: true };
  }

  /** Если есть дубли 100029 / 000100029 — берём того, к кому уже привязаны операции. */
  private async preferUserWithOperations(matches: { id: number; employee_id: string; role: string; is_active: boolean }[]) {
    const ids = matches.map((m) => m.id).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return matches[0];

    const request = this.db.getPool().request();
    const placeholders = ids.map((id, i) => {
      request.input(`id${i}`, sql.Int, id);
      return `@id${i}`;
    });
    const result = await request.query(
      `SELECT TOP 1 user_id
       FROM operations
       WHERE user_id IN (${placeholders.join(', ')})
       GROUP BY user_id
       ORDER BY COUNT(*) DESC`,
    );
    const bestId = result.recordset[0]?.user_id;
    return matches.find((m) => m.id === bestId) || matches[0];
  }

  /** Логин-номера всегда строка: иначе mssql шлёт 100029 как INT и сравнение с NVARCHAR ломается. */
  private async queryNvarchar<T = any>(
    queryText: string,
    strings: Record<string, string>,
  ): Promise<T[]> {
    const request = this.db.getPool().request();
    for (const [key, value] of Object.entries(strings)) {
      request.input(key, sql.NVarChar(50), value);
    }
    const result = await request.query(queryText);
    return result.recordset as T[];
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
