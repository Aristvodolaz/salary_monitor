import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database/database.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DatabaseService);

  // Проверяем маппинг для PPMC
  const ppmcMapping = await db.query<{
    wcr_code: string;
    operation_type: string;
    participant_area: string;
    is_active: number;
  }>(
    `SELECT wcr_code, operation_type, participant_area, is_active 
     FROM wcr_mapping 
     WHERE wcr_code LIKE '%PPMC%' OR wcr_code = 'PPMC'`,
  );

  console.log('\n=== WCR MAPPING для PPMC ===');
  if (ppmcMapping.length === 0) {
    console.log('❌ Маппинг для PPMC не найден!');
  } else {
    ppmcMapping.forEach((m) => {
      console.log(`WCR: ${m.wcr_code}`);
      console.log(`  → operation_type: ${m.operation_type}`);
      console.log(`  → participant_area: ${m.participant_area}`);
      console.log(`  → is_active: ${m.is_active}`);
      console.log('');
    });
  }

  // Проверяем все маппинги, содержащие "комплект" в названии
  const komplektMappings = await db.query<{
    wcr_code: string;
    operation_type: string;
    participant_area: string;
    is_active: number;
  }>(
    `SELECT wcr_code, operation_type, participant_area, is_active 
     FROM wcr_mapping 
     WHERE operation_type LIKE '%комплект%' OR operation_type LIKE '%компл%'
     ORDER BY operation_type`,
  );

  console.log('\n=== Все маппинги с "комплект" в типе операции ===');
  komplektMappings.forEach((m) => {
    console.log(`${m.wcr_code} → ${m.operation_type} (active: ${m.is_active})`);
  });

  await app.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
