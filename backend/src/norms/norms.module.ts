import { Module } from '@nestjs/common';
import { NormsController } from './norms.controller';
import { NormsService } from './norms.service';
import { WarehouseRatesService } from './warehouse-rates.service';
import { SapIntegrationModule } from '../sap-integration/sap-integration.module';

@Module({
  imports: [SapIntegrationModule],
  controllers: [NormsController],
  providers: [NormsService, WarehouseRatesService],
})
export class NormsModule {}
