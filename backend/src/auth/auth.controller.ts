import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginBarcodeDto } from './dto/login-barcode.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /api/auth/barcode
   * Авторизация по штрих-коду
   */
  @Post('barcode')
  @HttpCode(HttpStatus.OK)
  async loginByBarcode(@Body() loginDto: LoginBarcodeDto) {
    return this.authService.loginByBarcode(loginDto.employeeId);
  }
}

