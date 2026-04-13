import { Module } from '@nestjs/common';
import { NormsController } from './norms.controller';
import { NormsService } from './norms.service';

@Module({
  controllers: [NormsController],
  providers: [NormsService],
})
export class NormsModule {}
