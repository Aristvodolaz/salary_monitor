import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SapIntegrationService } from './sap-integration.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class SapSchedulerService {
  constructor(
    private sapIntegrationService: SapIntegrationService,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {}

  /**
   * Ежедневная синхронизация данных из SAP
   * Время задается через .env (SYNC_CRON_SCHEDULE)
   * По умолчанию: каждый день в 2:00 ночи
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailySync() {
    this.logger.log('🕐 Запуск ежедневной синхронизации с SAP', 'SapScheduler');

    try {
      await this.sapIntegrationService.syncAllWarehouses();
      this.logger.log('✅ Ежедневная синхронизация завершена успешно', 'SapScheduler');
    } catch (error) {
      this.logger.error(
        '❌ Ошибка при ежедневной синхронизации',
        error.stack,
        'SapScheduler',
      );
      // TODO: Отправить уведомление администратору (email/SMS/Telegram)
    }
  }

  /**
   * Ручной запуск синхронизации (можно вызвать через API)
   */
  async manualSync(): Promise<void> {
    this.logger.log('🔄 Запуск ручной синхронизации с SAP', 'SapScheduler');
    await this.sapIntegrationService.syncAllWarehouses();
  }
}

