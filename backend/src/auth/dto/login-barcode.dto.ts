import { IsString, IsNotEmpty, Length } from 'class-validator';

export class LoginBarcodeDto {
  @IsString()
  @IsNotEmpty({ message: 'Штрих-код не может быть пустым' })
  @Length(1, 50, { message: 'Штрих-код должен быть от 1 до 50 символов' })
  employeeId: string;
}

