import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { DatabaseService } from '../database/database.service';
import { RegisterDto } from './dto/register.dto';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private db: DatabaseService,
    private logger: LoggerService,
  ) {}

  /** Список складов для выпадающего списка регистрации (без авторизации). */
  async getWarehouses() {
    return this.db.query(`SELECT id, code, name FROM warehouses WHERE is_active = 1 ORDER BY code`);
  }

  /** Первый вход? registered=false → фронт показывает регистрацию, иначе ввод пароля. */
  async checkEmployee(employeeId: string) {
    const cred = await this.usersService.findCredentials(employeeId);
    return { registered: !!cred?.password_hash };
  }

  /**
   * Регистрация: табельный + склад + фамилия сверяются с sap_employees (EWM), затем сохраняется пароль.
   */
  async register(dto: RegisterDto) {
    const existing = await this.usersService.findCredentials(dto.employeeId);
    if (existing?.password_hash) {
      throw new ConflictException('Этот табельный номер уже зарегистрирован. Войдите по паролю');
    }

    const hash = await bcrypt.hash(dto.password, 10);
    const userId = await this.usersService.completeRegistration(
      dto.employeeId,
      dto.warehouseId,
      dto.lastName,
      hash,
    );
    if (!userId) {
      this.logger.warn(`Регистрация отклонена, данные не совпали с EWM: ${dto.employeeId}`);
      throw new NotFoundException(
        'Данные не совпадают с EWM: проверьте табельный номер, склад и фамилию',
      );
    }
    return this.issueToken(userId);
  }

  /** Вход по табельному и паролю. */
  async login(employeeId: string, password: string) {
    const cred = await this.usersService.findCredentials(employeeId);
    const ok = cred?.password_hash && (await bcrypt.compare(password, cred.password_hash));
    if (!ok) {
      this.logger.warn(`Неудачный вход: ${employeeId}`);
      throw new UnauthorizedException('Неверный табельный номер или пароль');
    }
    return this.issueToken(cred.id);
  }

  private async issueToken(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Пользователь не найден');
    if (!user.is_active) throw new UnauthorizedException('Пользователь заблокирован');

    this.logger.log(`Вход: ${user.fio} (${user.employeeId})`, 'AuthService');

    const payload = {
      sub: user.id,
      employeeId: user.employee_id,
      role: user.role,
      warehouseId: user.warehouse_id,
    };

    return {
      access_token: this.jwtService.sign(payload),
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
