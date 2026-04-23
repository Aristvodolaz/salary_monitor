import { IsDateString, IsOptional, IsInt, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetWarehouseSalaryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  warehouseId?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employeeId?: number;

  @IsString()
  @IsOptional()
  section?: string;
}

