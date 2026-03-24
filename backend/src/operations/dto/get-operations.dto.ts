import { IsDateString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GetOperationsDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number = 100;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;

  @IsOptional()
  @IsIn([
    'operation_id',
    'operation_date',
    'operation_type',
    'participant_area',
    'aei_count',
    'rate',
    'base_amount',
    'warehouse_code',
    'warehouse_name',
    'employee_id',
    'fio',
  ])
  sortBy?: string = 'operation_date';

  @IsOptional()
  @IsIn(['asc', 'desc', 'ASC', 'DESC'])
  sortOrder?: string = 'desc';
}

