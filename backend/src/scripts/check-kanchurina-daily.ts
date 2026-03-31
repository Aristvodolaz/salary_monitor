import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database/database.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DatabaseService);

  const ops = await db.query<{
    date: Date;
    ops_count: number;
    daily_amount: number;
  }>(
    `SELECT 
      CAST(operation_date AS DATE) as date,
      COUNT(*) as ops_count,
      SUM(amount) as daily_amount
    FROM operations 
    WHERE user_id = 565 
      AND operation_date >= '2026-02-01' 
      AND operation_date < '2026-03-01'
    GROUP BY CAST(operation_date AS DATE)
    ORDER BY date`,
  );

  console.log('\n=== DAILY BREAKDOWN (Kanchurina, Feb 2026) ===');
  ops.forEach((r) => {
    console.log(`${r.date.toISOString().slice(0, 10)}: ${r.ops_count} ops, ${r.daily_amount.toFixed(2)} руб.`);
  });

  const total = ops.reduce((sum, r) => sum + r.daily_amount, 0);
  console.log(`\nTotal: ${total.toFixed(2)} руб.`);
  console.log(`Expected: 37 812 руб.`);
  console.log(`Missing: ${(37812 - total).toFixed(2)} руб. (${((1 - total / 37812) * 100).toFixed(1)}%)`);

  // Проверяем, есть ли данные за все дни февраля
  console.log('\n=== MISSING DATES ===');
  const allDates = new Set(ops.map((r) => r.date.toISOString().slice(0, 10)));
  for (let day = 1; day <= 28; day++) {
    const dateStr = `2026-02-${day.toString().padStart(2, '0')}`;
    if (!allDates.has(dateStr)) {
      console.log(`❌ ${dateStr} — NO DATA`);
    }
  }

  await app.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
