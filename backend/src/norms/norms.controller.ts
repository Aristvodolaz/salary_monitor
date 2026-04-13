import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { NormsService } from './norms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('norms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NormsController {
  constructor(private normsService: NormsService) {}

  /**
   * GET /api/norms
   * Справочник нормативов WCR
   */
  @Get()
  async getNorms() {
    return this.normsService.getAllNorms();
  }

  /**
   * GET /api/norms/stats?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&warehouseCode=XXX
   * Статистика операций за период, сопоставленная с нормативами
   */
  @Get('stats')
  async getStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('warehouseCode') warehouseCode?: string,
  ) {
    return this.normsService.getMarchStats(startDate, endDate, warehouseCode);
  }

  /**
   * POST /api/norms/stats/snapshot
   * Сохранить снимок статистики (нормы + операции за период) в таблицу norms_stats_snapshot.
   */
  @Post('stats/snapshot')
  async saveStatsSnapshot(
    @Body()
    body: { startDate: string; endDate: string; warehouseCode?: string },
  ) {
    if (!body?.startDate || !body?.endDate) {
      throw new BadRequestException('Укажите startDate и endDate (YYYY-MM-DD)');
    }
    return this.normsService.saveStatsSnapshot(
      body.startDate,
      body.endDate,
      body.warehouseCode,
    );
  }

  // ── Комплектация (блок 2: продуктовые задачи / prod_count) ───────────────────

  /**
   * GET /api/norms/picking
   * Справочник нормативов комплектации (wcr_picking_norms)
   */
  @Get('picking')
  async getPickingNorms() {
    return this.normsService.getAllPickingNorms();
  }

  /**
   * GET /api/norms/picking/stats?startDate=&endDate=&warehouseCode=
   * Статистика комплектации за период (prod_count из операций)
   */
  @Get('picking/stats')
  async getPickingStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('warehouseCode') warehouseCode?: string,
  ) {
    return this.normsService.getPickingStats(startDate, endDate, warehouseCode);
  }
}
