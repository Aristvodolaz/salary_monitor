import { Controller, Get, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GetOperationsDto } from './dto/get-operations.dto';

@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private operationsService: OperationsService) {}

  /**
   * GET /api/operations
   * Получить список операций пользователя
   */
  @Get()
  async getOperations(@CurrentUser() user: any, @Query() query: GetOperationsDto) {
    const { startDate, endDate, limit, offset } = query;

    return this.operationsService.getUserOperations(
      user.id,
      startDate,
      endDate,
      limit,
      offset,
    );
  }

  /**
   * GET /api/operations/by-type
   * Получить группировку операций по типам
   */
  @Get('by-type')
  async getOperationsByType(@CurrentUser() user: any, @Query() query: GetOperationsDto) {
    const { startDate, endDate } = query;
    return this.operationsService.getOperationsByType(user.id, startDate, endDate);
  }
}

