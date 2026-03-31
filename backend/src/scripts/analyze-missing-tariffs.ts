import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database/database.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DatabaseService);

  // Получаем все WCR маппинги
  const wcrMap = await db.query<{
    wcr_code: string;
    operation_type: string;
    participant_area: string;
  }>(`SELECT wcr_code, operation_type, participant_area FROM wcr_mapping WHERE is_active = 1`);

  console.log('\n=== WCR MAPPINGS ===');
  console.log(`Total WCR codes: ${wcrMap.length}`);

  // Получаем все тарифы для 02DQ
  const tariffs = await db.query<{
    warehouse_code: string;
    operation_type: string;
    rate: number;
  }>(
    `SELECT warehouse_code, operation_type, rate 
     FROM tariffs 
     WHERE (warehouse_code = '02DQ' OR warehouse_code = 'ALL') 
       AND is_active = 1
     ORDER BY operation_type`,
  );

  console.log('\n=== TARIFFS FOR 02DQ ===');
  console.log(`Total tariffs: ${tariffs.length}`);
  tariffs.forEach((t) => {
    console.log(`${t.warehouse_code} | ${t.operation_type} | ${t.rate}`);
  });

  // Проверяем, какие operation_type из WCR не имеют тарифов
  const tariffSet = new Set(tariffs.map((t) => t.operation_type));
  const operationTypes = new Set(wcrMap.map((w) => w.operation_type));

  console.log('\n=== OPERATION TYPES WITHOUT TARIFFS ===');
  let missingCount = 0;
  operationTypes.forEach((opType) => {
    if (!tariffSet.has(opType)) {
      console.log(`❌ ${opType}`);
      missingCount++;
    }
  });

  if (missingCount === 0) {
    console.log('✅ All operation types have tariffs');
  } else {
    console.log(`\n⚠️  Missing tariffs for ${missingCount} operation types`);
  }

  // Проверяем, сколько WCR кодов используется для каждого operation_type
  const wcrByOpType = new Map<string, string[]>();
  wcrMap.forEach((w) => {
    const wcrs = wcrByOpType.get(w.operation_type) || [];
    wcrs.push(w.wcr_code);
    wcrByOpType.set(w.operation_type, wcrs);
  });

  console.log('\n=== WCR CODES BY OPERATION TYPE ===');
  Array.from(wcrByOpType.entries())
    .sort()
    .forEach(([opType, wcrs]) => {
      const hasTariff = tariffSet.has(opType) ? '✅' : '❌';
      console.log(`${hasTariff} ${opType}: ${wcrs.join(', ')}`);
    });

  await app.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
