import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database/database.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DatabaseService);

  const result = await db.queryOne<{
    total_ops: number;
    total_aei: number;
    total_amount: number;
  }>(
    `SELECT 
      COUNT(*) as total_ops,
      SUM(count) as total_aei,
      SUM(amount) as total_amount
    FROM operations 
    WHERE user_id = 565 
      AND operation_date >= '2026-02-01' 
      AND operation_date < '2026-03-01'`,
  );

  console.log('\n=== KANCHURINA (Feb 2026) ===');
  console.log(`Total operations: ${result.total_ops}`);
  console.log(`Total AEI (count): ${result.total_aei}`);
  console.log(`Total amount: ${result.total_amount?.toFixed(2)} руб.`);
  console.log('\n=== EXPECTED ===');
  console.log(`Total AEI: 66 335`);
  console.log(`Total amount: 37 812 руб.`);
  console.log('\n=== DIFFERENCE ===');
  console.log(`Missing AEI: ${66335 - (result.total_aei || 0)} (${((1 - (result.total_aei || 0) / 66335) * 100).toFixed(1)}%)`);
  console.log(`Missing amount: ${(37812 - (result.total_amount || 0)).toFixed(2)} руб. (${((1 - (result.total_amount || 0) / 37812) * 100).toFixed(1)}%)`);

  await app.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
