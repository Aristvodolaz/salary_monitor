import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GetSalaryDto } from './dto/get-salary.dto';

@Controller('salary')
@UseGuards(JwtAuthGuard)
export class SalaryController {
  constructor(private salaryService: SalaryService) {}

  /**
   * GET /api/salary
   * Получить зарплату за период
   * Query params: period (yesterday|month|custom), startDate, endDate
   */
  @Get()
  async getSalary(@CurrentUser() user: any, @Query() query: GetSalaryDto) {
    const { period, startDate, endDate } = query;

    switch (period) {
      case 'yesterday':
        return this.salaryService.getSalaryYesterday(user.id);

      case 'month':
        return this.salaryService.getSalaryCurrentMonth(user.id);

      case 'custom':
        if (!startDate || !endDate) {
          throw new Error('Для периода custom требуются startDate и endDate');
        }
        return this.salaryService.getSalaryByDateRange(user.id, startDate, endDate);

      default:
        return this.salaryService.getSalaryCurrentMonth(user.id);
    }
  }

  /**
   * GET /api/salary/stats
   * Получить общую статистику
   */
  @Get('stats')
  async getStats(@CurrentUser() user: any) {
    return this.salaryService.getSalaryStats(user.id);
  }
}

