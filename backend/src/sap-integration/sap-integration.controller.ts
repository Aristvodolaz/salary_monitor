import {
  Controller, Post, Body, UseGuards, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { SapSchedulerService } from './sap-scheduler.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('sap')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SapIntegrationController {
  constructor(private sapSchedulerService: SapSchedulerService) {}

  /**
   * POST /api/sap/sync
   * Ручной запуск синхронизации за вчера (только для админов)
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async manualSync() {
    await this.sapSchedulerService.manualSync();
    return {
      success: true,
      message: 'Синхронизация за вчера запущена. Проверьте логи для деталей.',
    };
  }

  /**
   * POST /api/sap/sync-period
   * Ручной пересчёт произвольного периода (только для супер-админов)
   * Body: { "start": "2026-02-01", "end": "2026-02-28" }
   *
   * Используется для:
   * - Пересчёта февраля
   * - Исправления данных за прошлые периоды
   * - Первоначальной загрузки исторических данных
   */
  @Post('sync-period')
  @HttpCode(HttpStatus.OK)
  async manualSyncPeriod(@Body() body: { start: string; end: string }) {
    if (!body.start || !body.end) {
      throw new BadRequestException('Укажите параметры start и end в формате YYYY-MM-DD');
    }

    const start = new Date(body.start);
    const end   = new Date(body.end);
    end.setUTCHours(23, 59, 59, 999); // включаем весь последний день

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Некорректный формат дат. Используйте YYYY-MM-DD');
    }

    if (start > end) {
      throw new BadRequestException('start должен быть раньше end');
    }

    // Ограничение: не более 31 дня за один запрос (защита от нагрузки)
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 31) {
      throw new BadRequestException('Максимальный период для одного запроса — 31 день');
    }

    await this.sapSchedulerService.manualSyncPeriod(start, end);

    return {
      success: true,
      message: `Синхронизация периода ${body.start} — ${body.end} запущена.`,
      period: { start: body.start, end: body.end, days: Math.ceil(diffDays) },
    };
  }
}
