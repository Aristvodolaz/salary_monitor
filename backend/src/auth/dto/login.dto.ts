import { IsString, IsNotEmpty, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Укажите табельный номер' })
  @Length(1, 50)
  employeeId: string;

  @IsString()
  @IsNotEmpty({ message: 'Введите пароль' })
  @Length(1, 72)
  password: string;
}
