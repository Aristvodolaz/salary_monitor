import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { NormsService } from './norms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { SapIntegrationService } from '../sap-integration/sap-integration.service';

@Controller('norms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NormsController {
  constructor(
    private normsService: NormsService,
    private sapIntegrationService: SapIntegrationService,
  ) {}

  /**
   * POST /api/norms/sync
   * Запустить синхронизацию только для нормативных операций
   */
  @Post('sync')
  async syncNorms(
    @Body() body: { startDate: string; endDate: string }
  ) {
    if (!body?.startDate || !body?.endDate) {
      throw new BadRequestException('Укажите startDate и endDate (YYYY-MM-DD)');
    }
    const start = new Date(`${body.startDate}T00:00:00Z`);
    const end = new Date(`${body.endDate}T23:59:59.999Z`);
    
    // Запускаем асинхронно, чтобы не держать HTTP запрос
    this.sapIntegrationService.syncNormsOnly(start, end).catch(err => {
      console.error('syncNormsOnly error:', err);
    });

    return { message: 'Синхронизация нормативных операций запущена в фоновом режиме' };
  }

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

  // ── Комплектация (блок 2: count × ставка норм) ────────────────────────────────

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
   * Статистика комплектации за период (count / АЕИ из операций)
   */
  @Get('picking/stats')
  async getPickingStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('warehouseCode') warehouseCode?: string,
  ) {
    return this.normsService.getPickingStats(startDate, endDate, warehouseCode);
  }

  // ── Сотрудники ────────────────────────────────────────────────────────────────

  /**
   * GET /api/norms/employees?startDate=&endDate=
   * Заработок сотрудников по нормативным операциям (АЕИ + комплектация отдельно)
   */
  @Get('employees')
  async getEmployees(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.normsService.getNormsEmployees(user.warehouseId, startDate, endDate);
  }

  /**
   * POST /api/norms/employees/snapshot
   * Сохранить снимок заработка сотрудников по нормативным операциям.
   */
  @Post('employees/snapshot')
  async saveEmployeesSnapshot(
    @CurrentUser() user: any,
    @Body() body: { startDate: string; endDate: string },
  ) {
    if (!body?.startDate || !body?.endDate) {
      throw new BadRequestException('Укажите startDate и endDate (YYYY-MM-DD)');
    }
    return this.normsService.saveEmployeesSnapshot(
      user.warehouseId,
      body.startDate,
      body.endDate,
    );
  }

  /**
   * GET /api/norms/employees/:id/detail?startDate=&endDate=
   * Детализация по сотруднику: АЕИ-операции и picking-операции раздельно
   */
  @Get('employees/:id/detail')
  async getEmployeeDetail(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) employeeId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.normsService.getNormsEmployeeDetail(
      employeeId,
      user.warehouseId,
      startDate,
      endDate,
    );
  }
}
