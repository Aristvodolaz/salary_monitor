import { IsString, IsNotEmpty, Length, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'Укажите табельный номер' })
  @Length(1, 50)
  employeeId: string;

  @Type(() => Number)
  @IsInt({ message: 'Выберите склад' })
  @Min(1, { message: 'Выберите склад' })
  warehouseId: number;

  @IsString()
  @IsNotEmpty({ message: 'Укажите фамилию' })
  @Length(2, 100)
  lastName: string;

  @IsString()
  @Length(6, 72, { message: 'Пароль должен быть от 6 до 72 символов' })
  password: string;
}
