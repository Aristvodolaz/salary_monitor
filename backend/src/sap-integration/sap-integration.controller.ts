import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
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
   * Ручной запуск синхронизации с SAP (только для админов)
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async manualSync() {
    await this.sapSchedulerService.manualSync();
    return {
      success: true,
      message: 'Синхронизация с SAP запущена. Проверьте логи для деталей.',
    };
  }
}
