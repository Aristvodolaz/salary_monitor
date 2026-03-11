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
      timeout: 120000, // 2 минуты таймаут (вместо бесконечного ожидания)
      // Настройки для повторных попыток
      validateStatus: (status) => status < 500, // Не бросать ошибку на 4xx
    });
  }

  /**
   * Синхронизация данных из SAP для всех складов
   * Перезагрузка февраля 2026: удаляем все операции за февраль и загружаем заново
   */
  async syncAllWarehouses(): Promise<void> {
    this.logger.log('🔄 Начало синхронизации данных из SAP для всех складов');

    // Удаляем все операции за февраль 2026 перед повторной загрузкой
    const febStart = new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0));
    const febEnd = new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999));
    const deletedTotal = await this.deleteAllOperationsForPeriod(febStart, febEnd);
    this.logger.log(`🗑️ Удалено операций за февраль 2026: ${deletedTotal}`);

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

    let totalProcessed = 0;
    try {
      this.logger.log(`📦 Синхронизация склада: ${warehouseCode}`);

      // Период: февраль 2026 (UTC), запросы к SAP — по 5 дней
      const periodStart = new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999));
      const chunkDays = 5;

      // Удаляем операции за февраль по складу (дополнительная очистка)
      await this.deleteOperationsForPeriod(warehouseCode, periodStart, periodEnd);

      totalProcessed = 0;
      let totalSkippedNoType = 0;
      let totalSkippedNoAei = 0;
      const chunks = this.getDateChunks(periodStart, periodEnd, chunkDays);
      this.logger.log(`📅 Запросы по ${chunkDays} дней, всего окон: ${chunks.length}`);

      for (let i = 0; i < chunks.length; i++) {
        const { startDate, endDate } = chunks[i];
        const filter = this.buildODataFilter(warehouseCode, startDate, endDate);
        const url = `/WHOSet?${filter}&$format=json`;
        this.logger.log(`📡 Окно ${i + 1}/${chunks.length}: ${startDate.toISOString().slice(0, 10)} — ${endDate.toISOString().slice(0, 10)}`);

        const isRetryable = (e: any) =>
          e?.code === 'ECONNRESET' ||
          e?.code === 'ETIMEDOUT' ||
          e?.message === 'aborted' ||
          (e?.message && String(e.message).toLowerCase().includes('aborted'));
        const maxAttempts = 3;
        let response;
        let lastError: any;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            response = await this.axiosInstance.get(url, { timeout: 180000 });
            this.logger.log(`✅ SAP ответил: ${response.status}`);
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < maxAttempts && isRetryable(error)) {
              this.logger.warn(`⚠️ Окно ${i + 1}: ${error.message || error.code}, повтор ${attempt}/${maxAttempts} через 3 сек...`);
              await new Promise((r) => setTimeout(r, 3000));
              continue;
            }
            if (error.code === 'ETIMEDOUT') {
              this.logger.error(`⏱️ Таймаут подключения к SAP серверу: ${this.sapBaseUrl}`);
              await this.updateSyncLog(syncId, 'failed', totalProcessed, `Таймаут: SAP сервер недоступен`);
              throw new Error(`SAP сервер недоступен (ETIMEDOUT). Проверьте сетевое подключение.`);
            }
            if (error.code === 'ECONNREFUSED') {
              this.logger.error(`🚫 SAP сервер отказал в подключении: ${this.sapBaseUrl}`);
              await this.updateSyncLog(syncId, 'failed', totalProcessed, `Ошибка: соединение отклонено`);
              throw new Error(`SAP сервер отказал в подключении (ECONNREFUSED)`);
            }
            if (error.response) {
              this.logger.error(`❌ SAP вернул ошибку ${error.response.status}: ${error.response.statusText}`);
              await this.updateSyncLog(syncId, 'failed', totalProcessed, `HTTP ${error.response.status}: ${error.response.statusText}`);
              throw new Error(`SAP вернул ошибку: ${error.response.status} ${error.response.statusText}`);
            }
            throw error;
          }
        }
        if (lastError && !response) {
          this.logger.error(`❌ Окно ${i + 1}: исчерпаны попытки, последняя ошибка: ${lastError.message || lastError.code}`);
          await this.updateSyncLog(syncId, 'failed', totalProcessed, lastError.message || String(lastError));
          throw lastError;
        }

        const allRecords = this.parseODataResponse(response.data);
        const operations = allRecords.filter(op => op !== null);
        totalSkippedNoAei += allRecords.length - operations.length;
        this.logger.log(`   Записей: ${allRecords.length}, операций: ${operations.length}`);

        let chunkSaved = 0;
        for (const operation of operations) {
          const saved = await this.saveOperation(operation, warehouseCode);
          if (saved) chunkSaved++;
          else totalSkippedNoType++;
        }
        totalProcessed += chunkSaved;
      }

      this.logger.log(`📊 Итого по складу ${warehouseCode}: сохранено ${totalProcessed}, пропущено (нет АЕИ/типа): ${totalSkippedNoAei + totalSkippedNoType}`);
      await this.updateSyncLog(syncId, 'success', totalProcessed);
      this.logger.log(`✅ Склад ${warehouseCode}: обработано ${totalProcessed} операций`);
    } catch (error) {
      const errorMessage = error.response?.data || error.message;
      this.logger.error(`❌ Детали ошибки SAP: ${JSON.stringify(errorMessage)}`);
      await this.updateSyncLog(syncId, 'failed', totalProcessed, JSON.stringify(errorMessage));
      throw error;
    }
  }

  /**
   * Разбивает период на окна по N дней (UTC), чтобы границы в логах и OData совпадали с календарём
   */
  private getDateChunks(
    periodStart: Date,
    periodEnd: Date,
    chunkDays: number,
  ): { startDate: Date; endDate: Date }[] {
    const chunks: { startDate: Date; endDate: Date }[] = [];
    let start = new Date(periodStart.getTime());
    while (start <= periodEnd) {
      const end = new Date(start.getTime());
      end.setUTCDate(end.getUTCDate() + chunkDays - 1);
      end.setUTCHours(23, 59, 59, 999);
      if (end > periodEnd) end.setTime(periodEnd.getTime());
      chunks.push({ startDate: new Date(start.getTime()), endDate: new Date(end.getTime()) });
      start.setUTCDate(start.getUTCDate() + chunkDays);
      start.setUTCHours(0, 0, 0, 0);
    }
    return chunks;
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

      // Маппинг полного типа операции из WCR (Участок + Тип)
      const finalOperationType = this.mapWcrToFullOperationType(item.Wcr);
      
      // Пропускаем если WCR не найден в маппинге (служебные операции)
      if (!finalOperationType) {
        return null;
      }

      // Получаем АЕИ из поля ZsumAmountItm
      const aeiCount = parseFloat(item.ZsumAmountItm || '0');
      
      // Пропускаем записи где АЕИ = 0 (записываем только где больше 0)
      if (aeiCount <= 0) {
        return null;
      }
      
      // Фактическое время в минутах (для справки)
      const actduraMinutes = parseFloat(item.Actdura || '0');
      // Участок — первое слово полного типа (ФС, ДО, МС, М2, М3, М4, М5, ПМ) для отчётов и расчётов
      const participantArea = (finalOperationType && finalOperationType.split(' ')[0]) || null;

      return {
        employeeId: item.Employeeid || item.Processor,     // ID сотрудника
        employeeName1: (item.McName1 || '').trim(),        // Фамилия
        employeeName2: (item.McName2 || '').trim(),        // Имя
        warehouseCode: item.Lgnum,                         // Склад
        operationType: finalOperationType,                 // Полный тип: "Участок Тип"
        participantArea,                                    // Участок для participant_area в БД
        actdura: actduraMinutes,                           // Фактическое время (минуты)
        count: aeiCount,                                   // АЕИ из SAP (ZsumAmountItm)
        operationDate: operationDate,                      // Дата подтверждения
        sapOrderId: item.Who || null,                      // ID заказа
        wcr: item.Wcr,                                     // Сохраняем для отладки
        queue: item.Queue,                                 // Сохраняем для отладки
      };
    }).filter((item: any) => item !== null); // Фильтруем null (записи без АЕИ или неизвестного типа)
  }

  /**
   * Маппинг WCR → Полный тип операции (Участок + Тип)
   * Возвращает null для неизвестных/служебных кодов
   */
  private mapWcrToFullOperationType(wcr: string): string | null {
    if (!wcr) return null;
    
    const mapping: { [key: string]: string } = {
      // ФС Коробочная комплектация (желтый)
      'PCST': 'ФС Коробочная комплектация',
      'PST2': 'ФС Коробочная комплектация',
      'PST1': 'ФС Коробочная комплектация',
      'PST3': 'ФС Коробочная комплектация',
      'PSST': 'ФС Коробочная комплектация',
      
      // ФС Штучная комплектация (желтый)
      'PM12': 'ФС Штучная комплектация',
      'PM13': 'ФС Штучная комплектация',
      'PS1S': 'ФС Штучная комплектация',
      'PS01': 'ФС Штучная комплектация',
      
      // ДО Коробочная комплектация (зеленый)
      'PCD1': 'ДО Коробочная комплектация',
      'PSCD': 'ДО Коробочная комплектация',
      
      // ДО Штучная комплектация (зеленый)
      'PDO1': 'ДО Штучная комплектация',
      'PDO3': 'ДО Штучная комплектация',
      
      // МС Коробочная комплектация (оранжевый)
      'PCMC': 'МС Коробочная комплектация',
      'PMC1': 'МС Коробочная комплектация',
      'PMC2': 'МС Коробочная комплектация',
      'PPMC': 'МС Коробочная комплектация',
      
      // МС Штучная комплектация (оранжевый)
      'PS5S': 'МС Штучная комплектация',
      'PSC9': 'МС Штучная комплектация',
      
      // МС Упаковка (оранжевый)
      'PAMC': 'МС Упаковка',
      
      // М2 Коробочная комплектация (серый)
      'PCM2': 'М2 Коробочная комплектация',
      'PM22': 'М2 Коробочная комплектация',
      
      // М2 Штучная комплектация (серый)
      'PS2L': 'М2 Штучная комплектация',
      'PM2Z': 'М2 Штучная комплектация',
      
      // М2 Упаковка (серый)
      'PAM2': 'М2 Упаковка',
      
      // М2 Штучн.компл.однострочн (серый)
      'PPM2': 'М2 Штучн.компл.однострочн',
      'PS2S': 'М2 Штучн.компл.однострочн',
      
      // М3 Коробочная комплектация (фиолетовый)
      'PCM3': 'М3 Коробочная комплектация',
      'PM31': 'М3 Коробочная комплектация',
      'PM33': 'М3 Коробочная комплектация',
      'PM3S': 'М3 Коробочная комплектация',
      
      // М3 Штучная комплектация (фиолетовый)
      'PS3S': 'М3 Штучная комплектация',
      'PM3Z': 'М3 Штучная комплектация',
      
      // М3 Штучн.компл.однострочн (фиолетовый)
      'PPM3': 'М3 Штучн.компл.однострочн',
      'PS3M': 'М3 Штучн.компл.однострочн',
      
      // М4 Коробочная комплектация (розовый)
      'PCM4': 'М4 Коробочная комплектация',
      'PM42': 'М4 Коробочная комплектация',
      'PM41': 'М4 Коробочная комплектация',
      
      // М4 Штучная комплектация (розовый)
      'PS4L': 'М4 Штучная комплектация',
      'PS4S': 'М4 Штучная комплектация',
      'PS4M': 'М4 Штучная комплектация',
      
      // М4 Штучн.компл.однострочн (розовый)
      'PPM4': 'М4 Штучн.компл.однострочн',
      
      // М4 Упаковка (розовый)
      'PAM4': 'М4 Упаковка',
      
      // М5 Коробочная комплектация (зеленый)
      'PCM5': 'М5 Коробочная комплектация',
      'PM51': 'М5 Коробочная комплектация',
      'PM53': 'М5 Коробочная комплектация',
      
      // М5 Штучная комплектация (зеленый)
      'PS5L': 'М5 Штучная комплектация',
      'PS5M': 'М5 Штучная комплектация',
      'PS5U': 'М5 Штучная комплектация',
      
      // М5 Штучн.компл.однострочн (зеленый)
      'PPM5': 'М5 Штучн.компл.однострочн',
      
      // М5 Упаковка (зеленый)
      'PAM5': 'М5 Упаковка',
      
      // ПМ Упаковка (желтый внизу)
      'DEF': 'ПМ Упаковка',
    };
    
    return mapping[wcr] || null;
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
        // Формируем ФИО из данных SAP (McName1 = фамилия, McName2 = имя)
        const lastName = operation.employeeName1 || '';
        const firstName = operation.employeeName2 || '';
        const fio = `${lastName} ${firstName}`.trim() || `Сотрудник ${operation.employeeId}`;
        
        await this.db.execute(
          `INSERT INTO users (employee_id, fio, warehouse_id, role, is_active)
           VALUES (@employeeId, @fio, @warehouseId, 'employee', 1)`,
          {
            employeeId: operation.employeeId,
            fio: fio,
            warehouseId: warehouse.id,
          }
        );

        this.logger.log(`✅ Создан новый пользователь: ${operation.employeeId} (${fio})`);

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

    // Полный тип уже приходит из маппинга WCR как "Участок Тип" (напр. "ФС Коробочная комплектация")
    const fullOperationType = operation.operationType;
    
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
    
    // Округляем АЕИ до целого числа для сохранения в БД
    const roundedAEI = Math.round(calculatedAEI);
    
    // Рассчитываем сумму: Сумма = АЕИ_округленное * Расценка
    // Используем округленное значение для консистентности с отображением
    const rate = tariff.rate || 0;
    const amount = roundedAEI * rate;
    
    this.logger.debug(`💰 Расчет: ${operation.actdura.toFixed(2)}мин / 60 * ${tariff.norm_aei_per_hour} = ${calculatedAEI.toFixed(2)} ≈ ${roundedAEI} АЕИ * ${rate}₽ = ${amount.toFixed(2)}₽`);

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
        count: roundedAEI,  // Округленные АЕИ
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
        count: roundedAEI,  // Округленные АЕИ
        actdura: operation.actdura,
        operationDate: operation.operationDate,
        amount,
        sapOrderId: operation.sapOrderId,
      });
    }
    
    return true;  // Успешно сохранено
  }

  /**
   * Полная очистка: все операции, salary_summary и сотрудники (role = 'employee'). Админы не удаляются.
   */
  private async wipeOperationsAndEmployees(): Promise<{
    operationsDeleted: number;
    summaryDeleted: number;
    usersDeleted: number;
  }> {
    const operationsDeleted = await this.db.execute(`DELETE FROM operations`);
    const summaryDeleted = await this.db.execute(`DELETE FROM salary_summary`);
    const usersDeleted = await this.db.execute(
      `DELETE FROM users WHERE role = 'employee'`,
    );
    return { operationsDeleted, summaryDeleted, usersDeleted };
  }

  /**
   * Удаление всех операций за период по всем складам
   */
  private async deleteAllOperationsForPeriod(startDate: Date, endDate: Date): Promise<number> {
    const startStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', ' ');
    return await this.db.execute(
      `DELETE FROM operations 
       WHERE operation_date >= @startDate AND operation_date <= @endDate`,
      { startDate: startStr, endDate: endStr },
    );
  }

  /**
   * Удаление операций за период по складу перед повторной загрузкой (только таблица operations)
   */
  private async deleteOperationsForPeriod(
    warehouseCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const startStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
    const endStr = endDate.toISOString().slice(0, 19).replace('T', ' ');

    const deletedOps = await this.db.execute(
      `DELETE FROM operations 
       WHERE warehouse_code = @warehouseCode 
         AND operation_date >= @startDate 
         AND operation_date <= @endDate`,
      { warehouseCode, startDate: startStr, endDate: endStr },
    );
    this.logger.log(`🗑️ Удалено операций по складу ${warehouseCode}: ${deletedOps}`);
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

