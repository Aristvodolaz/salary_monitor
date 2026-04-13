import { Module } from '@nestjs/common';
import { NormsController } from './norms.controller';
import { NormsService } from './norms.service';
import { SapIntegrationModule } from '../sap-integration/sap-integration.module';

@Module({
  imports: [SapIntegrationModule],
  controllers: [NormsController],
  providers: [NormsService],
})
export class NormsModule {}
