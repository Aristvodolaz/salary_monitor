import { Injectable, ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
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
   * Получить операции конкретного сотрудника за период (с пагинацией)
   * Доступно только для сотрудников склада текущего администратора
   */
  async getEmployeeOperations(
    adminUser: any,
    employeeId: number,
    startDate: string,
    endDate: string,
    limit = 50,
    offset = 0,
  ) {
    // Считаем итого (с учётом принадлежности к складу администратора)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE u.id = @employeeId
        AND u.warehouse_id = @warehouseId
        AND sd.operation_date >= @startDate
        AND sd.operation_date <= @endDate
    `;

    const countResult = await this.db.queryOne<{ total: number }>(countQuery, {
      employeeId,
      warehouseId: adminUser.warehouseId,
      startDate,
      endDate,
    });

    if (!countResult || countResult.total === 0) {
      return { operations: [], pagination: { total: 0, limit, offset } };
    }

    const dataQuery = `
      SELECT
        sd.operation_id,
        sd.operation_type,
        sd.participant_area,
        sd.aei_count,
        sd.operation_date,
        sd.rate,
        sd.base_amount
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE u.id = @employeeId
        AND u.warehouse_id = @warehouseId
        AND sd.operation_date >= @startDate
        AND sd.operation_date <= @endDate
      ORDER BY sd.operation_date DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const operations = await this.db.query(dataQuery, {
      employeeId,
      warehouseId: adminUser.warehouseId,
      startDate,
      endDate,
      offset,
      limit,
    });

    return {
      operations,
      pagination: {
        total: countResult.total,
        limit,
        offset,
      },
    };
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
  async getWarehouseStats(adminUser: any, warehouseId?: number, startDate?: string, endDate?: string) {
    const targetWarehouseId = warehouseId || adminUser.warehouseId;

    if (adminUser.role === 'admin' && targetWarehouseId !== adminUser.warehouseId) {
      throw new ForbiddenException('Вы можете видеть только данные вашего склада');
    }

    const query = `
      SELECT
        COUNT(DISTINCT sd.user_id) as active_employees,
        COUNT(DISTINCT sd.operation_type) as operation_types,
        SUM(sd.aei_count) as total_aei,
        SUM(sd.base_amount) as total_amount,
        COUNT(*) as total_operations
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE u.warehouse_id = @warehouseId
        AND (@startDate IS NULL OR sd.operation_date >= @startDate)
        AND (@endDate IS NULL OR sd.operation_date <= @endDate)
    `;

    return this.db.queryOne(query, {
      warehouseId: targetWarehouseId,
      startDate: startDate || null,
      endDate: endDate || null,
    });
  }

  /**
   * Преобразование данных в CSV
   */
  private convertToCSV(data: any[][]): string {
    return data.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  /**
   * Получить операции сотрудника, агрегированные по типу (уровень 2)
   */
  async getEmployeeOperationsSummary(
    adminUser: any,
    employeeId: number,
    startDate: string,
    endDate: string,
  ) {
    const query = `
      SELECT
        sd.operation_type,
        sd.participant_area,
        COUNT(*) AS operations_count,
        SUM(sd.aei_count) AS total_aei,
        SUM(sd.base_amount) AS total_amount,
        AVG(sd.rate) AS avg_rate,
        MIN(sd.operation_date) AS first_date,
        MAX(sd.operation_date) AS last_date
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE u.id = @employeeId
        AND u.warehouse_id = @warehouseId
        AND sd.operation_date >= @startDate
        AND sd.operation_date <= @endDate
      GROUP BY sd.operation_type, sd.participant_area
      ORDER BY total_amount DESC
    `;

    return this.db.query(query, {
      employeeId,
      warehouseId: adminUser.warehouseId,
      startDate,
      endDate,
    });
  }

  /**
   * Получить детализацию операций по типу (уровень 3, lazy)
   */
  async getEmployeeOperationDetails(
    adminUser: any,
    employeeId: number,
    operationType: string,
    participantArea: string,
    startDate: string,
    endDate: string,
    limit = 20,
    offset = 0,
  ) {
    const countQuery = `
      SELECT COUNT(*) as total
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE u.id = @employeeId
        AND u.warehouse_id = @warehouseId
        AND sd.operation_date >= @startDate
        AND sd.operation_date <= @endDate
        AND sd.operation_type = @operationType
        AND (sd.participant_area = @participantArea OR (@participantArea = '' AND sd.participant_area IS NULL))
    `;

    const countResult = await this.db.queryOne<{ total: number }>(countQuery, {
      employeeId,
      warehouseId: adminUser.warehouseId,
      startDate,
      endDate,
      operationType,
      participantArea: participantArea || '',
    });

    if (!countResult || countResult.total === 0) {
      return { records: [], pagination: { total: 0, limit, offset } };
    }

    const dataQuery = `
      SELECT
        sd.operation_id,
        sd.operation_date,
        sd.aei_count,
        sd.rate,
        sd.base_amount,
        sd.participant_area
      FROM v_salary_details sd
      INNER JOIN users u ON sd.user_id = u.id
      WHERE u.id = @employeeId
        AND u.warehouse_id = @warehouseId
        AND sd.operation_date >= @startDate
        AND sd.operation_date <= @endDate
        AND sd.operation_type = @operationType
        AND (sd.participant_area = @participantArea OR (@participantArea = '' AND sd.participant_area IS NULL))
      ORDER BY sd.operation_date DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const records = await this.db.query(dataQuery, {
      employeeId,
      warehouseId: adminUser.warehouseId,
      startDate,
      endDate,
      operationType,
      participantArea: participantArea || '',
      limit,
      offset,
    });

    return { records, pagination: { total: countResult.total, limit, offset } };
  }

  /**
   * Экспорт в Excel с иерархической группировкой (streaming)
   */
  async exportExcel(
    adminUser: any,
    res: Response,
    startDate: string,
    endDate: string,
    warehouseId?: number,
    filterEmployeeId?: number,
  ) {
    const targetWarehouseId = warehouseId || adminUser.warehouseId;

    // 1. Загружаем сотрудников
    let employeesQuery = `
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
    `;
    const empParams: any = { warehouseId: targetWarehouseId, startDate, endDate };

    if (filterEmployeeId) {
      employeesQuery += ' AND u.id = @filterEmployeeId';
      empParams.filterEmployeeId = filterEmployeeId;
    }

    employeesQuery += ' GROUP BY sd.user_id, u.employee_id, u.fio ORDER BY total_amount DESC';

    const employees = await this.db.query(employeesQuery, empParams);

    // Заголовки и workbook — сразу, чтобы ответ начал стримиться
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="salary_${startDate}_${endDate}.xlsx"`);

    // 2. Генерируем Excel — пишем по одному сотруднику, без предзагрузки всего
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const ws = workbook.addWorksheet('Зарплаты', {
      properties: { outlineLevelRow: 3 },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });

    // Стили
    const COLORS = {
      employee: { argb: 'FF1A1F2E' },      // тёмно-синий — уровень 1
      opGroup:  { argb: 'FF252A3D' },      // чуть светлее — уровень 2
      detail:   { argb: 'FF0A0D14' },      // самый тёмный — уровень 3
      header:   { argb: 'FFE31E24' },      // красный — шапка
      gold:     { argb: 'FFF59E0B' },
      white:    { argb: 'FFEEF0F8' },
      muted:    { argb: 'FF6B7194' },
    };

    const numFmt = '#,##0.00';
    const dateFmt = 'DD.MM.YYYY HH:MM';

    // Колонки
    ws.columns = [
      { header: 'Сотрудник / Тип операции', key: 'name',       width: 40 },
      { header: 'Участок',                  key: 'area',        width: 18 },
      { header: 'Операций',                 key: 'ops_count',   width: 12 },
      { header: 'АЕИ',                      key: 'aei',         width: 12 },
      { header: 'Ставка (ср.)',             key: 'rate',        width: 14 },
      { header: 'Сумма, ₽',                key: 'amount',      width: 16 },
    ];

    // Стиль шапки
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: COLORS.header };
      cell.font = { bold: true, color: COLORS.white, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FFCC0000' } },
      };
    });
    headerRow.height = 22;
    headerRow.commit();

    // Записываем строки — подгружаем данные по одному сотруднику, сразу пишем в stream
    for (const emp of employees) {
      // Уровень 1 — Сотрудник
      const empRow = ws.addRow({
        name: emp.fio,
        area: `ШК: ${emp.employee_id}`,
        ops_count: emp.total_operations,
        aei: emp.total_aei,
        rate: '',
        amount: emp.total_amount,
      });
      empRow.outlineLevel = 0;
      empRow.height = 20;
      empRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: COLORS.employee };
        cell.font = { bold: true, color: COLORS.white, size: 11 };
        cell.alignment = { vertical: 'middle' };
      });
      (empRow.getCell('amount') as any).numFmt = numFmt;
      (empRow.getCell('amount') as any).font = { bold: true, color: COLORS.gold, size: 11 };
      empRow.commit();

      // Агрегаты по типам — загружаем только для текущего сотрудника
      const groups = await this.db.query(`
        SELECT
          sd.operation_type,
          sd.participant_area,
          COUNT(*) AS operations_count,
          SUM(sd.aei_count) AS total_aei,
          SUM(sd.base_amount) AS total_amount,
          AVG(sd.rate) AS avg_rate
        FROM v_salary_details sd
        INNER JOIN users u ON sd.user_id = u.id
        WHERE u.id = @employeeId
          AND u.warehouse_id = @warehouseId
          AND sd.operation_date >= @startDate
          AND sd.operation_date <= @endDate
        GROUP BY sd.operation_type, sd.participant_area
        ORDER BY total_amount DESC
      `, { employeeId: emp.user_id, warehouseId: targetWarehouseId, startDate, endDate });

      for (const grp of groups) {
        // Уровень 2 — Агрегат по типу операции
        const grpRow = ws.addRow({
          name: `  ${grp.operation_type}`,
          area: grp.participant_area || '—',
          ops_count: grp.operations_count,
          aei: grp.total_aei,
          rate: grp.avg_rate,
          amount: grp.total_amount,
        });
        grpRow.outlineLevel = 1;
        grpRow.height = 18;
        grpRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: COLORS.opGroup };
          cell.font = { bold: false, color: COLORS.white, size: 10 };
          cell.alignment = { vertical: 'middle' };
        });
        (grpRow.getCell('rate') as any).numFmt = numFmt;
        (grpRow.getCell('amount') as any).numFmt = numFmt;
        (grpRow.getCell('amount') as any).font = { color: COLORS.gold, size: 10 };
        grpRow.commit();

        // Детали по группе — загружаем только для текущей группы
        const records = await this.db.query(`
          SELECT
            sd.operation_id,
            sd.operation_date,
            sd.aei_count,
            sd.rate,
            sd.base_amount
          FROM v_salary_details sd
          INNER JOIN users u ON sd.user_id = u.id
          WHERE u.id = @employeeId
            AND u.warehouse_id = @warehouseId
            AND sd.operation_date >= @startDate
            AND sd.operation_date <= @endDate
            AND sd.operation_type = @operationType
            AND (sd.participant_area = @participantArea OR (@participantArea = '' AND sd.participant_area IS NULL))
          ORDER BY sd.operation_date DESC
        `, {
          employeeId: emp.user_id,
          warehouseId: targetWarehouseId,
          startDate,
          endDate,
          operationType: grp.operation_type,
          participantArea: grp.participant_area || '',
        });

        for (const rec of records) {
          // Уровень 3 — Детальная запись
          const recDate = rec.operation_date ? new Date(rec.operation_date) : null;
          const detRow = ws.addRow({
            name: recDate
              ? `    ${recDate.toLocaleDateString('ru-RU')} ${recDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
              : '    —',
            area: '',
            ops_count: '',
            aei: rec.aei_count,
            rate: rec.rate,
            amount: rec.base_amount,
          });
          detRow.outlineLevel = 2;
          detRow.height = 16;
          detRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: COLORS.detail };
            cell.font = { color: COLORS.muted, size: 9 };
            cell.alignment = { vertical: 'middle' };
          });
          (detRow.getCell('rate') as any).numFmt = numFmt;
          (detRow.getCell('amount') as any).numFmt = numFmt;
          (detRow.getCell('amount') as any).font = { color: COLORS.white, size: 9 };
          detRow.commit();
        }
      }

      // Итог по сотруднику
      const totalRow = ws.addRow({
        name: `ИТОГО: ${emp.fio}`,
        area: '',
        ops_count: emp.total_operations,
        aei: emp.total_aei,
        rate: '',
        amount: emp.total_amount,
      });
      totalRow.outlineLevel = 0;
      totalRow.height = 18;
      totalRow.eachCell((cell) => {
        cell.font = { bold: true, color: COLORS.gold, size: 10 };
        cell.border = { top: { style: 'thin', color: { argb: 'FF3D4260' } } };
        cell.alignment = { vertical: 'middle' };
      });
      (totalRow.getCell('amount') as any).numFmt = numFmt;
      totalRow.commit();

      // Разделитель
      const sepRow = ws.addRow({});
      sepRow.height = 6;
      sepRow.commit();
    }

    await workbook.commit();
  }
}

