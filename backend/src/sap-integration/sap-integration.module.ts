import { Module } from '@nestjs/common';
import { SapIntegrationService } from './sap-integration.service';
import { SapSchedulerService } from './sap-scheduler.service';
import { SapIntegrationController } from './sap-integration.controller';

@Module({
  controllers: [SapIntegrationController],
  providers: [SapIntegrationService, SapSchedulerService],
  exports: [SapIntegrationService],
})
export class SapIntegrationModule {}

