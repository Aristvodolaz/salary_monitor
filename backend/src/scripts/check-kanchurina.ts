import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database/database.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DatabaseService);

  // 1. Проверяем user_id=565
  const user = await db.queryOne<{ id: number; employee_id: string; fio: string; warehouse_id: number }>(
    `SELECT id, employee_id, fio, warehouse_id FROM users WHERE id = 565`,
  );
  console.log('\n=== USER INFO ===');
  console.log(user);

  // 2. Все операции за февраль
  const ops = await db.query<{
    operation_date: Date;
    operation_type: string;
    count: number;
    amount: number;
    sap_order_id: string;
  }>(
    `SELECT 
      operation_date,
      operation_type,
      count,
      amount,
      sap_order_id
    FROM operations 
    WHERE user_id = 565 
      AND operation_date >= '2026-02-01' 
      AND operation_date < '2026-03-01'
    ORDER BY operation_date, operation_type`,
  );

  console.log('\n=== OPERATIONS (Feb 2026) ===');
  console.log(`Total operations: ${ops.length}`);
  ops.forEach((op) => {
    console.log(
      `${op.operation_date.toISOString().slice(0, 10)} | ${op.operation_type} | count=${op.count} | amount=${op.amount.toFixed(2)} | order=${op.sap_order_id}`,
    );
  });

  // 3. Итоговая сумма
  const total = await db.queryOne<{ total_salary: number | null }>(
    `SELECT SUM(amount) as total_salary
    FROM operations 
    WHERE user_id = 565 
      AND operation_date >= '2026-02-01' 
      AND operation_date < '2026-03-01'`,
  );

  console.log('\n=== TOTAL SALARY ===');
  console.log(`Total: ${total.total_salary?.toFixed(2) || 0} руб.`);
  console.log(`Expected: 37 812 руб.`);
  console.log(`Difference: ${(37812 - (total.total_salary || 0)).toFixed(2)} руб.`);

  await app.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
