import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: sql.ConnectionPool;
  private config: sql.config;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    // Конфигурация подключения к MS SQL
    this.config = {
      server: this.configService.get<string>('DB_HOST'),
      port: parseInt(this.configService.get<string>('DB_PORT'), 10),
      database: this.configService.get<string>('DB_NAME'),
      user: this.configService.get<string>('DB_USER'),
      password: this.configService.get<string>('DB_PASSWORD'),
      options: {
        encrypt: false, // для локального SQL Server
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };
  }

  async onModuleInit() {
    try {
      this.pool = await new sql.ConnectionPool(this.config).connect();
      this.logger.log('✅ Подключение к MS SQL установлено');
    } catch (error) {
      this.logger.error('❌ Ошибка подключения к MS SQL', error.stack);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close();
      this.logger.log('🔌 Подключение к MS SQL закрыто');
    }
  }

  // Получить пул соединений
  getPool(): sql.ConnectionPool {
    return this.pool;
  }

  // Выполнить запрос
  async query<T = any>(queryText: string, params?: any): Promise<T[]> {
    try {
      const request = this.pool.request();

      // Добавляем параметры, если есть
      if (params) {
        Object.keys(params).forEach((key) => {
          request.input(key, params[key]);
        });
      }

      const result = await request.query(queryText);
      return result.recordset;
    } catch (error) {
      this.logger.error(`Ошибка выполнения запроса: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Выполнить запрос с одним результатом
  async queryOne<T = any>(queryText: string, params?: any): Promise<T | null> {
    const results = await this.query<T>(queryText, params);
    return results.length > 0 ? results[0] : null;
  }

  // Выполнить запрос без возврата данных (INSERT, UPDATE, DELETE)
  async execute(queryText: string, params?: any): Promise<number> {
    try {
      const request = this.pool.request();

      if (params) {
        Object.keys(params).forEach((key) => {
          request.input(key, params[key]);
        });
      }

      const result = await request.query(queryText);
      return result.rowsAffected[0];
    } catch (error) {
      this.logger.error(`Ошибка выполнения команды: ${error.message}`, error.stack);
      throw error;
    }
  }
}

