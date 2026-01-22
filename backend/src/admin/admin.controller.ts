import {
  Controller,
  Get,
  Query,
  UseGuards,
  Header,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GetWarehouseSalaryDto } from './dto/get-warehouse-salary.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  /**
   * GET /api/admin/employees
   * Получить список сотрудников склада
   */
  @Get('employees')
  async getEmployees(
    @CurrentUser() user: any,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const parsedWarehouseId = warehouseId ? parseInt(warehouseId, 10) : undefined;
    return this.adminService.getEmployeesByWarehouse(user, parsedWarehouseId);
  }

  /**
   * GET /api/admin/salary
   * Получить зарплаты всех сотрудников склада за период
   */
  @Get('salary')
  async getWarehouseSalary(
    @CurrentUser() user: any,
    @Query() query: GetWarehouseSalaryDto,
  ) {
    const { startDate, endDate, warehouseId } = query;
    return this.adminService.getWarehouseSalary(user, startDate, endDate, warehouseId);
  }

  /**
   * GET /api/admin/export
   * Экспорт данных о зарплатах в CSV
   */
  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="salary_export.csv"')
  async exportSalary(
    @CurrentUser() user: any,
    @Query() query: GetWarehouseSalaryDto,
  ) {
    const { startDate, endDate, warehouseId } = query;
    const result = await this.adminService.exportWarehouseSalary(
      user,
      startDate,
      endDate,
      warehouseId,
    );
    return result.csv;
  }

  /**
   * GET /api/admin/stats
   * Статистика склада
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: any,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const parsedWarehouseId = warehouseId ? parseInt(warehouseId, 10) : undefined;
    return this.adminService.getWarehouseStats(user, parsedWarehouseId);
  }
}

