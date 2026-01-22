import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private logger: LoggerService,
  ) {}

  /**
   * Авторизация по штрих-коду (Employee ID)
   * @param employeeId - штрих-код сотрудника из SAP
   * @returns JWT токен и информация о пользователе
   */
  async loginByBarcode(employeeId: string) {
    // Поиск пользователя по employee_id
    const user = await this.usersService.findByEmployeeId(employeeId);

    if (!user) {
      this.logger.warn(`Попытка входа с несуществующим ШК: ${employeeId}`);
      throw new UnauthorizedException('Пользователь не найден');
    }

    if (!user.is_active) {
      this.logger.warn(`Попытка входа заблокированного пользователя: ${employeeId}`);
      throw new UnauthorizedException('Пользователь заблокирован');
    }

    this.logger.log(`Вход пользователя: ${user.fio} (${employeeId})`, 'AuthService');

    // Генерация JWT
    const payload = {
      sub: user.id,
      employeeId: user.employee_id,
      role: user.role,
      warehouseId: user.warehouse_id,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        fio: user.fio,
        role: user.role,
        warehouseId: user.warehouse_id,
      },
    };
  }

  /**
   * Валидация JWT токена
   * @param payload - данные из токена
   * @returns информация о пользователе
   */
  async validateUser(payload: any) {
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.is_active) {
      return null;
    }

    return {
      id: user.id,
      employeeId: user.employee_id,
      fio: user.fio,
      role: user.role,
      warehouseId: user.warehouse_id,
    };
  }
}

