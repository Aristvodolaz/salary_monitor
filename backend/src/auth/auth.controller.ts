import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CheckEmployeeDto } from './dto/check-employee.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** GET /api/auth/warehouses — склады для формы регистрации */
  @Get('warehouses')
  async warehouses() {
    return this.authService.getWarehouses();
  }

  /** POST /api/auth/check — зарегистрирован ли табельный (пароль задан) */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  async check(@Body() dto: CheckEmployeeDto) {
    return this.authService.checkEmployee(dto.employeeId);
  }

  /** POST /api/auth/register — табельный + склад + фамилия (сверка с EWM) + пароль */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** POST /api/auth/login — табельный + пароль */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.employeeId, dto.password);
  }
}
