import { IsString, IsNotEmpty, Length } from 'class-validator';

export class CheckEmployeeDto {
  @IsString()
  @IsNotEmpty({ message: 'Укажите табельный номер' })
  @Length(1, 50)
  employeeId: string;
}
