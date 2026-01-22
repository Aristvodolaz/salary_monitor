import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export class GetSalaryDto {
  @IsString()
  @IsOptional()
  @IsIn(['yesterday', 'month', 'custom'])
  period?: string = 'month';

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

