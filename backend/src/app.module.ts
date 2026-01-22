import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SalaryModule } from './salary/salary.module';
import { OperationsModule } from './operations/operations.module';
import { AdminModule } from './admin/admin.module';
import { SapIntegrationModule } from './sap-integration/sap-integration.module';
import { LoggerModule } from './common/logger/logger.module';

@Module({
  imports: [
    // Конфигурация из .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Планировщик для cron-задач
    ScheduleModule.forRoot(),
    
    // Логгер
    LoggerModule,
    
    // Подключение к БД
    DatabaseModule,
    
    // Модули приложения
    AuthModule,
    UsersModule,
    SalaryModule,
    OperationsModule,
    AdminModule,
    SapIntegrationModule,
  ],
})
export class AppModule {}

