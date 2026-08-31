import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SapIntegrationService } from './sap-integration.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class SapSchedulerService {
  constructor(
    private sapIntegrationService: SapIntegrationService,
    private logger: LoggerService,
  ) {}

  /**
   * Ежедневная синхронизация — только вчера (24 часа)
   * Запускается каждый день в 02:00 по серверному времени
   *
   * Идемпотентность: сначала удаляем вчерашние данные по складу,
   * затем вставляем заново → повторный запуск не ломает данные
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailySync(): Promise<void> {
    const t0 = Date.now();
    this.logger.log('🕐 [SapScheduler] Запуск ежедневной синхронизации с SAP');

    try {
      try {
        await this.sapIntegrationService.syncEmployees();
      } catch (empErr) {
        this.logger.error(
          `⚠️  [SapScheduler] Справочник сотрудников не обновился: ${empErr.message}. Берём предыдущую версию.`,
        );
      }
      await this.sapIntegrationService.syncYesterday();

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      this.logger.log(`✅ [SapScheduler] Ежедневная синхронизация завершена за ${elapsed}s`);

      // Предупреждение если синхронизация заняла больше 1 часа
      if (Date.now() - t0 > 3_600_000) {
        this.logger.warn(
          `⚠️  [SapScheduler] Синхронизация заняла ${elapsed}s — превышен порог 1 час. Проверить нагрузку.`,
        );
      }
    } catch (error) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      this.logger.error(
        `❌ [SapScheduler] Ошибка ежедневной синхронизации после ${elapsed}s: ${error.message}`,
        error.stack,
        'SapScheduler',
      );
      // TODO (Фаза 2): Отправить уведомление в Telegram/Email администратору
    }
  }

  /**
   * Ручной запуск: синхронизация только вчера
   * Вызывается через API: POST /api/sap/sync
   */
  async manualSync(): Promise<void> {
    this.logger.log('🔄 [SapScheduler] Ручная синхронизация (вчера)');
    await this.sapIntegrationService.syncEmployees();
    await this.sapIntegrationService.syncYesterday();
  }

  /**
   * Ручной запуск для произвольного периода
   * Используется для пересчёта февраля и исторических данных
   * Вызывается через API: POST /api/sap/sync-period
   */
  async manualSyncPeriod(start: Date, end: Date): Promise<void> {
    this.logger.log(
      `🔄 [SapScheduler] Ручной sync периода: ${start.toISOString().slice(0, 10)} — ${end.toISOString().slice(0, 10)}`,
    );
    await this.sapIntegrationService.syncEmployees();
    await this.sapIntegrationService.syncPeriod(start, end);
  }

  async manualSyncEmployees(): Promise<{ fetched: number; upserted: number }> {
    this.logger.log('🔄 [SapScheduler] Синхронизация справочника сотрудников');
    return this.sapIntegrationService.syncEmployees();
  }
}
