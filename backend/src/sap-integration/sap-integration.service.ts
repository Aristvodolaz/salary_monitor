import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../common/logger/logger.service';
import axios, { AxiosInstance } from 'axios';
import * as sql from 'mssql';

@Injectable()
export class SapIntegrationService {
  private axiosInstance: AxiosInstance;
  private sapBaseUrl: string;
  private warehouses: string[];
  private syncMonthsBack: number;

  constructor(
    private configService: ConfigService,
    private db: DatabaseService,
    private logger: LoggerService,
  ) {
    this.sapBaseUrl = this.configService.get<string>('SAP_ODATA_BASE_URL');
    this.warehouses = this.configService.get<string>('WAREHOUSES').split(',');
    this.syncMonthsBack = this.configService.get<number>('SYNC_MONTHS_BACK', 6);

    // Настройка axios с Basic Auth
    this.axiosInstance = axios.create({
      baseURL: this.sapBaseUrl,
      auth: {
        username: this.configService.get<string>('SAP_USERNAME'),
        password: this.configService.get<string>('SAP_PASSWORD'),
      },
      timeout: 0, // Без timeout (для больших объемов данных)
    });
  }

  /**
   * Синхронизация данных из SAP для всех складов
   */
  async syncAllWarehouses(): Promise<void> {
    this.logger.log('🔄 Начало синхронизации данных из SAP для всех складов');

    // Получаем список складов из БД (активные склады)
    const warehousesQuery = `
      SELECT code, name FROM warehouses WHERE is_active = 1 ORDER BY code
    `;
    const warehousesFromDb = await this.db.query(warehousesQuery);
    
    this.logger.log(`📦 Найдено складов в БД: ${warehousesFromDb.length}`);

    for (const warehouse of warehousesFromDb) {
      try {
        this.logger.log(`\n📦 Склад: ${warehouse.code} (${warehouse.name})`);
        await this.syncWarehouse(warehouse.code);
      } catch (error) {
        this.logger.error(
          `Ошибка синхронизации склада ${warehouse.code}: ${error.message}`,
          error.stack,
        );
      }
    }

    this.logger.log('\n✅ Синхронизация завершена');
  }

  /**
   * Синхронизация данных для одного склада
   */
  async syncWarehouse(warehouseCode: string): Promise<void> {
    const syncId = await this.createSyncLog(warehouseCode);

    try {
      this.logger.log(`📦 Синхронизация склада: ${warehouseCode}`);

      // Расчет периода (вчерашний день для ежедневной синхронизации)
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1);  // Вчера
      endDate.setHours(23, 59, 59, 999);
      
      const startDate = new Date(endDate);
      startDate.setHours(0, 0, 0, 0);  // Начало вчерашнего дня

      // Формирование OData запроса
      const filter = this.buildODataFilter(warehouseCode, startDate, endDate);
      const url = `/WHOSet?${filter}`;

      const fullUrl = `${this.sapBaseUrl}${url}`;
      this.logger.log(`📡 SAP запрос: ${fullUrl}`);
      this.logger.log(`📅 Период: ${startDate.toISOString()} - ${endDate.toISOString()}`);

      // Запрос к SAP OData
      const response = await this.axiosInstance.get(url);
      this.logger.log(`✅ SAP ответил: ${response.status}`);
      
      const allRecords = this.parseODataResponse(response.data);
      const operations = allRecords.filter(op => op !== null);  // Фильтруем null (служебные)

      this.logger.log(`Получено записей: ${allRecords.length}, операций комплектации: ${operations.length}`);

      // Сохранение в БД (только операции с АЕИ > 0)
      let processedCount = 0;
      let skippedNoAei = 0;
      let skippedNoType = 0;
      
      for (const operation of operations) {
        if (!operation.actdura || operation.actdura <= 0) {
          skippedNoAei++;
          continue;  // Пропускаем операции без времени
        }
        
        const saved = await this.saveOperation(operation, warehouseCode);
        if (saved) {
          processedCount++;
        } else {
          skippedNoType++;
        }
      }
      
      this.logger.log(`📊 Статистика обработки:`);
      this.logger.log(`   ✅ Сохранено: ${processedCount}`);
      this.logger.log(`   ⏭️  Пропущено (нет АЕИ): ${skippedNoAei}`);
      this.logger.log(`   ⏭️  Пропущено (нет типа/тарифа): ${skippedNoType}`);

      // Обновление лога синхронизации
      await this.updateSyncLog(syncId, 'success', processedCount);

      this.logger.log(`✅ Склад ${warehouseCode}: обработано ${processedCount} операций`);
    } catch (error) {
      const errorMessage = error.response?.data || error.message;
      this.logger.error(`❌ Детали ошибки SAP: ${JSON.stringify(errorMessage)}`);
      await this.updateSyncLog(syncId, 'failed', 0, JSON.stringify(errorMessage));
      throw error;
    }
  }

  /**
   * Формирование OData фильтра
   */
  private buildODataFilter(
    warehouseCode: string,
    startDate: Date,
    endDate: Date,
  ): string {
    const formatDate = (date: Date) => date.toISOString().split('.')[0];

    return `$filter=(Lgnum eq '${warehouseCode}' and (ConfirmedDate ge datetime'${formatDate(startDate)}' and ConfirmedDate le datetime'${formatDate(endDate)}'))`;
  }

  /**
   * Парсинг OData ответа
   */
  private parseODataResponse(data: any): any[] {
    // SAP OData возвращает данные в формате { d: { results: [...] } }
    const results = data?.d?.results || [];

    return results.map((item: any) => {
      // Парсинг даты из формата /Date(timestamp)/
      let operationDate = new Date();
      if (item.ConfirmedDate) {
        const timestamp = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
        if (timestamp) {
          operationDate = new Date(parseInt(timestamp[1], 10));
        }
      }

      // Маппинг участка из Wcr (правило создания заказа)
      const participantArea = this.mapWcrToArea(item.Wcr);
      
      // Пропускаем если Wcr не найден в маппинге (служебная операция)
      if (!participantArea || participantArea === 'Неизвестно') {
        return null;  // Игнорируем операции с неизвестным Wcr
      }
      
      // Пропускаем служебные операции по Queue
      const queueUpper = (item.Queue || '').toUpperCase();
      if (queueUpper && (
        queueUpper.startsWith('OUT_') ||   // Отгрузка
        queueUpper.startsWith('REPLO_') || // Пополнение
        queueUpper.startsWith('REPL_') ||  // Пополнение  
        queueUpper.startsWith('INT_') ||   // Внутренние
        queueUpper.startsWith('INV_') ||   // Инвентаризация
        queueUpper.includes('BRAK')        // Брак
      )) {
        return null;
      }
      
      // Маппинг типа комплектации из Queue
      const operationType = this.mapQueueToOperationType(item.Queue);
      
      // Если тип не определен, используем Queue как есть для отладки
      const finalOperationType = operationType || item.Queue || 'Неизвестно';

      // Вычисляем АЕИ на основе фактического времени (Actdura в минутах)
      // Пока храним время, АЕИ будем вычислять при расчете зарплаты
      const actduraMinutes = parseFloat(item.Actdura || '0');

      return {
        employeeId: item.Employeeid || item.Processor,     // ID сотрудника
        warehouseCode: item.Lgnum,                         // Склад
        participantArea: participantArea,                   // Участок (М2, М3, и т.д.)
        operationType: finalOperationType,                 // Тип комплектации
        actdura: actduraMinutes,                           // Фактическое время (минуты)
        count: 0,                                          // АЕИ вычислим при расчете зарплаты
        operationDate: operationDate,                      // Дата подтверждения
        sapOrderId: item.Who || null,                      // ID заказа
        wcr: item.Wcr,                                     // Сохраняем для отладки
        queue: item.Queue,                                 // Сохраняем для отладки
      };
    });
  }

  /**
   * Маппинг Wcr (правило) → Участок
   * Полный маппинг из таблицы КОМУС (обновлено 2026-01-22)
   */
  private mapWcrToArea(wcr: string): string | null {
    if (!wcr) return null;
    
    const mapping: { [key: string]: string } = {
      // ФС - Фирменная сеть (желтая группа)
      'PCST': 'ФС', 'PST2': 'ФС', 'PSTT': 'ФС', 'PST1': 'ФС', 'PST3': 'ФС', 'PZST': 'ФС', 'PSST': 'ФС',
      'PCM1': 'ФС', 'PM12': 'ФС', 'PM11': 'ФС', 'PM13': 'ФС', 'PS1L': 'ФС', 'PS1S': 'ФС', 'PS1M': 'ФС', 'PSM1': 'ФС',
      'PCCD': 'ФС', 'PCD2': 'ФС', 'PCD1': 'ФС', 'PZCD': 'ФС', 'PSCD': 'ФС',
      
      // ДО - Доставка офис (зеленая группа)
      'PDO2': 'ДО', 'PDO1': 'ДО', 'PDO3': 'ДО',
      
      // МС - Монослой (оранжевая группа)
      'PCMC': 'МС', 'PMC2': 'МС', 'PMC1': 'МС', 'PPMC': 'МС',
      'P2MC': 'МС', 'PKMC': 'МС', 'PSC1': 'МС', 'PSCS': 'МС',
      'PSCM': 'МС', 'P2XC': 'МС', 'PSMC': 'МС',
      
      // М2 - Участок 2 (голубая группа)
      'PCM2': 'М2', 'PM22': 'М2', 'PM21': 'М2', 'P2M2': 'М2',
      'PSM2': 'М2', 'PKM2': 'М2', 'PPM2': 'М2',
      'PS2L': 'М2', 'PS2S': 'М2', 'PZM2': 'М2', 'PS2M': 'М2',
      
      // М3 - Участок 3 (фиолетовая группа)
      'PCM3': 'М3', 'PM32': 'М3', 'PM31': 'М3', 'PS3L': 'М3',
      'P2M3': 'М3', 'PSM3': 'М3', 'PS3S': 'М3', 'PKM3': 'М3', 
      'PS3M': 'М3', 'PPM3': 'М3',
      
      // М4 - Участок 4 (серая группа)
      'PCM4': 'М4', 'PM42': 'М4', 'PM44': 'М4', 'PM41': 'М4',
      'PPM4': 'М4', 'P2M4': 'М4', 'PSM4': 'М4', 'PS4L': 'М4', 
      'PS4S': 'М4', 'PS4M': 'М4', 'PZM4': 'М4', 'PKM4': 'М4',
      
      // М5 - Участок 5 (светло-зеленая группа)
      'PCM5': 'М5', 'PM52': 'М5', 'PM51': 'М5', 'PPMS': 'М5',
      'PS5L': 'М5', 'PS5S': 'М5', 'PS5M': 'М5', 'P2M5': 'М5',
      'PZM5': 'М5', 'PKM5': 'М5',
      
      // ПМ - Паллетный метод (желтая внизу)
      'DEF': 'ПМ',
    };
    
    return mapping[wcr] || null;  // null если не найдено = игнорировать
  }

  /**
   * Маппинг Queue (очередь) → Тип комплектации
   * Возвращает null для служебных операций (не комплектация)
   */
  private mapQueueToOperationType(queue: string): string | null {
    if (!queue) return null;
    
    const queueUpper = queue.toUpperCase();
    
    // ИГНОРИРУЕМ служебные операции (не комплектация!)
    const ignorePatterns = [
      'INT_',      // Внутренние операции
      'OUT_',      // Отгрузка
      'UNLOAD',    // Разгрузка
      'DEF',       // Дефолт
      'INV_',      // Инвентаризация
      'REPL',      // Пополнение
    ];
    
    for (const pattern of ignorePatterns) {
      if (queueUpper.includes(pattern)) {
        return null;  // Игнорируем эту операцию
      }
    }
    
    // Маппинг только INB_* (входящая комплектация)
    const mapping: { [key: string]: string } = {
      // Коробочная комплектация
      'INB_PSOC': 'Коробочная комплектация',
      
      // Штучная комплектация      
      'INB_PSOS': 'Штучная комплектация',
      'INB_PSSO': 'Штучная комплектация',
      'INB_SPST': 'Штучная комплектация',
      'INB_PSSM': 'Штучная комплектация',
      
      // Штучн.компл.однострочн
      'INB_PSO1': 'Штучн.компл.однострочн',
      'INB_PSZD': 'Штучн.компл.однострочн',
      
      // Упаковка
      'PACK': 'Упаковка',
      'INB_PACK': 'Упаковка',
    };
    
    // Точное совпадение
    if (mapping[queue]) return mapping[queue];
    
      // Упаковка (PACK_MZ*)
      if (queueUpper.startsWith('PACK_')) {
        return 'Упаковка';
      }
      
      // Поиск по частичному совпадению только для INB_*
      if (queueUpper.startsWith('INB_')) {
        for (const [key, value] of Object.entries(mapping)) {
          if (queueUpper.includes(key)) return value;
        }
        
        // Попытка угадать по окончанию для INB_*
        if (queueUpper.includes('PSOC')) return 'Коробочная комплектация';
        if (queueUpper.includes('PSOS')) return 'Штучная комплектация';
        if (queueUpper.includes('PSO1')) return 'Штучн.компл.однострочн';
        if (queueUpper.includes('PACK')) return 'Упаковка';
      }
      
      return null;  // Неизвестный тип - игнорируем
  }

  /**
   * Сохранение операции в БД
   * @returns true если сохранено, false если пропущено
   */
  private async saveOperation(operation: any, warehouseCode: string): Promise<boolean> {
    // Найти или создать пользователя по employee_id
    let user = await this.db.queryOne(
      `SELECT id FROM users WHERE employee_id = @employeeId`,
      { employeeId: operation.employeeId }
    );

    // Если пользователь не найден - создаем автоматически
    if (!user) {
      // Получаем warehouse_id по коду
      const warehouse = await this.db.queryOne(
        `SELECT id FROM warehouses WHERE code = @code`,
        { code: warehouseCode }
      );

      if (warehouse) {
        await this.db.execute(
          `INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
           VALUES (@employeeId, @fio, @warehouseId, 'employee', 1)`,
          {
            employeeId: operation.employeeId,
            fio: `Сотрудник ${operation.employeeId}`,
            warehouseId: warehouse.id,
          }
        );

        this.logger.log(`✅ Создан новый пользователь: ${operation.employeeId}`);

        // Повторно получаем пользователя
        user = await this.db.queryOne(
          `SELECT id FROM users WHERE employee_id = @employeeId`,
          { employeeId: operation.employeeId }
        );
      } else {
        this.logger.warn(`⚠️ Склад не найден: ${warehouseCode}, пропускаем операцию`);
        return false;
      }
    }

    // Формируем полное название операции (Участок + Тип)
    // Только если оба поля определены и не "Неизвестно"
    let fullOperationType = operation.operationType;
    
    if (operation.participantArea && 
        operation.participantArea !== 'Неизвестно' && 
        operation.operationType && 
        operation.operationType !== 'Неизвестно') {
      fullOperationType = `${operation.participantArea} ${operation.operationType}`;
    }
    
    // Если operation_type не определен, пропускаем (нет тарифа)
    if (!fullOperationType || fullOperationType === 'Неизвестно') {
      return false;
    }

    // Найти тариф с нормативом (используем warehouse_code = 'ALL' для универсальных тарифов)
    const tariffQuery = `
      SELECT rate, norm_aei_per_hour FROM tariffs 
      WHERE (warehouse_code = @warehouseCode OR warehouse_code = 'ALL')
        AND operation_type = @operationType
        AND @operationDate >= valid_from
        AND (@operationDate <= valid_to OR valid_to IS NULL)
        AND is_active = 1
      ORDER BY 
        CASE WHEN warehouse_code = @warehouseCode THEN 1 ELSE 2 END
    `;
    const tariff = await this.db.queryOne(tariffQuery, {
      warehouseCode,
      operationType: fullOperationType,
      operationDate: operation.operationDate,
    });

    if (!tariff) {
      this.logger.warn(`⚠️ Тариф не найден для: ${fullOperationType}`);
      return false;  // Не сохраняем операцию без тарифа
    }

    // Вычисляем АЕИ по формуле: АЕИ = (Actdura / 60) * Норматив_АЕИ_в_час
    const calculatedAEI = (operation.actdura / 60) * (tariff.norm_aei_per_hour || 0);
    
    // Рассчитываем сумму: Сумма = АЕИ * Расценка * Ккач
    const rate = tariff.rate || 0;
    const amount = calculatedAEI * rate * 1.0; // * Ккач (пока 1.0)
    
    this.logger.debug(`💰 Расчет: ${operation.actdura.toFixed(2)}мин / 60 * ${tariff.norm_aei_per_hour} = ${calculatedAEI.toFixed(2)} АЕИ * ${rate}₽ = ${amount.toFixed(2)}₽`);

    // Проверка существования операции
    const checkQuery = `
      SELECT id FROM operations 
      WHERE user_id = @userId 
        AND operation_date = @operationDate
        AND operation_type = @operationType
        AND sap_order_id = @sapOrderId
    `;
    const existing = await this.db.queryOne(checkQuery, {
      userId: user.id,
      operationDate: operation.operationDate,
      operationType: fullOperationType,
      sapOrderId: operation.sapOrderId,
    });

    if (existing) {
      // Обновление
      const updateQuery = `
        UPDATE operations 
        SET count = @count, 
            amount = @amount, 
            participant_area = @participantArea,
            actdura = @actdura,
            updated_at = GETDATE()
        WHERE id = @id
      `;
      await this.db.execute(updateQuery, {
        id: existing.id,
        count: Math.round(calculatedAEI),  // Вычисленные АЕИ
        amount,
        participantArea: operation.participantArea,
        actdura: operation.actdura,
      });
    } else {
      // Вставка
      const insertQuery = `
        INSERT INTO operations 
        (user_id, warehouse_code, operation_type, participant_area, count, actdura, operation_date, amount, sap_order_id)
        VALUES 
        (@userId, @warehouseCode, @operationType, @participantArea, @count, @actdura, @operationDate, @amount, @sapOrderId)
      `;
      await this.db.execute(insertQuery, {
        userId: user.id,
        warehouseCode,
        operationType: fullOperationType,
        participantArea: operation.participantArea,
        count: Math.round(calculatedAEI),  // Вычисленные АЕИ
        actdura: operation.actdura,
        operationDate: operation.operationDate,
        amount,
        sapOrderId: operation.sapOrderId,
      });
    }
    
    return true;  // Успешно сохранено
  }

  /**
   * Создание записи лога синхронизации
   */
  private async createSyncLog(warehouseCode: string): Promise<number> {
    const query = `
      INSERT INTO sync_logs (warehouse_code, sync_start, status)
      OUTPUT INSERTED.id
      VALUES (@warehouseCode, GETDATE(), 'running')
    `;
    const result = await this.db.queryOne(query, { warehouseCode });
    return result.id;
  }

  /**
   * Обновление лога синхронизации
   */
  private async updateSyncLog(
    id: number,
    status: string,
    recordsProcessed: number,
    errorMessage?: string,
  ): Promise<void> {
    const query = `
      UPDATE sync_logs 
      SET sync_end = GETDATE(), 
          status = @status, 
          records_processed = @recordsProcessed,
          error_message = @errorMessage
      WHERE id = @id
    `;
    await this.db.execute(query, {
      id,
      status,
      recordsProcessed,
      errorMessage: errorMessage || null,
    });
  }
}

