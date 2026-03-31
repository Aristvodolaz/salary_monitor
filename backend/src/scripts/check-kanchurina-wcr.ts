import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database/database.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DatabaseService);

  // Проверяем, какие WCR коды и operation_type используются для Канчуриной
  const ops = await db.query<{
    operation_type: string;
    participant_area: string;
    ops_count: number;
    total_aei: number;
    total_amount: number;
  }>(
    `SELECT 
      operation_type,
      participant_area,
      COUNT(*) as ops_count,
      SUM(count) as total_aei,
      SUM(amount) as total_amount
    FROM operations 
    WHERE user_id = 565 
      AND operation_date >= '2026-02-01' 
      AND operation_date < '2026-03-01'
    GROUP BY operation_type, participant_area
    ORDER BY total_amount DESC`,
  );

  console.log('\n=== KANCHURINA OPERATIONS BY TYPE (Feb 2026) ===');
  ops.forEach((op) => {
    console.log(
      `${op.operation_type} [${op.participant_area}]: ${op.ops_count} ops, ${op.total_aei} AEI, ${op.total_amount.toFixed(2)} руб.`,
    );
  });

  const total = ops.reduce((sum, op) => sum + op.total_amount, 0);
  console.log(`\nTotal: ${total.toFixed(2)} руб.`);
  console.log(`Expected: 37 812 руб.`);
  console.log(`Missing: ${(37812 - total).toFixed(2)} руб.`);

  // Проверяем, какие participant_area есть в БД
  console.log('\n=== PARTICIPANT AREAS IN DB ===');
  const areas = await db.query<{ participant_area: string; count: number }>(
    `SELECT DISTINCT participant_area, COUNT(*) as count 
     FROM operations 
     WHERE user_id = 565 
       AND operation_date >= '2026-02-01' 
       AND operation_date < '2026-03-01'
     GROUP BY participant_area`,
  );
  areas.forEach((a) => {
    console.log(`${a.participant_area}: ${a.count} operations`);
  });

  await app.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
