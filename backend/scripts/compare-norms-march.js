const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { NormsService } = require('../dist/norms/norms.service');

const excelData = [
  // Блок 1 (верхний)
  { fio: 'Долматов Илья Анатольевич', empId: '75649', expected: 49482, block: 'aei' },
  { fio: 'Абдумаликов Шомурод Абдумаликович', empId: '78423', expected: 92230, block: 'aei' },
  { fio: 'Храпов Максим Сергеевич', empId: '78692', expected: 137166, block: 'aei' },
  { fio: 'Бердников Артём Александрович', empId: '87615', expected: 43859, block: 'aei' },
  { fio: 'Гозиев Куёшбек Абдурахимович', empId: '95682', expected: 2330, block: 'aei' },
  { fio: 'Денисов Юрий Васильевич', empId: '78796', expected: 90689, block: 'aei' },
  { fio: 'Дозорец Алексей Евгеньевич', empId: '84660', expected: 131242, block: 'aei' },
  { fio: 'Надралиев Ермек Бисимбаевич', empId: '85765', expected: 115429, block: 'aei' },
  { fio: 'Захаров Михаил Михайлович', empId: '22732', expected: 101984, block: 'aei' },
  { fio: 'Иксанов Рафаэль Нафисович', empId: '84779', expected: 124107, block: 'aei' },
  { fio: 'Кулешов Александр Владимирович', empId: '92115', expected: 75873, block: 'aei' },
  { fio: 'Тупелекин Денис Александрович', empId: '64694', expected: 46496, block: 'aei' },
  { fio: 'Миронов Виталий Владимирович', empId: '22178', expected: 73035, block: 'aei' },
  { fio: 'Мищенков Дмитрий Евгеньевич', empId: '99383', expected: 89975, block: 'aei' },
  { fio: 'Новиков Александр Викторович', empId: '43743', expected: 56753, block: 'aei' },
  { fio: 'Синельщиков Алексей Анатольевич', empId: '17004', expected: 137394, block: 'aei' },
  { fio: 'Сопов Александр Васильевич', empId: '33678', expected: 31866, block: 'aei' },
  { fio: 'Таженов Серик Зейнуллиевич', empId: '83177', expected: 103121, block: 'aei' },
  { fio: 'Турсунов Акрамжон Мирзомуродович', empId: '92963', expected: 84074, block: 'aei' },
  { fio: 'Евчик Александр Андреевич', empId: '7101', expected: 83318, block: 'aei' },
  // Блок 2 (нижний)
  { fio: 'Сопов Александр Васильевич', empId: '33678', expected: 40800, block: 'picking' },
  { fio: 'Миронов Виталий Владимирович', empId: '22178', expected: 30600, block: 'picking' },
  { fio: 'Синельщиков Алексей Анатольевич', empId: '17004', expected: 4463, block: 'picking' },
  { fio: 'Храпов Максим Сергеевич', empId: '78692', expected: 3825, block: 'picking' },
  { fio: 'Шуменко Александр Александрович', empId: '86717', expected: 3736, block: 'picking' },
  { fio: 'Смирнов Александр Андрианович', empId: '100835', expected: 858, block: 'picking' },
  { fio: 'Дмитриев Владимир Андреевич', empId: '70874', expected: 6251, block: 'picking' }
];

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const normsService = app.get(NormsService);

  const startDate = '2026-03-01';
  const endDate = '2026-03-31';

  console.log(`Сравниваем данные за март (${startDate} — ${endDate})\n`);

  // Для простоты возьмём склад 02DQ (ID: 2), так как большинство этих людей работает там,
  // Но лучше собрать всех по всем складам и сгруппировать
  
  const allEmployees = [];
  const WAREHOUSES = [1,2,3,4,5,6,7,8,9,10];
  
  for (const whId of WAREHOUSES) {
    const emps = await normsService.getNormsEmployees(whId, startDate, endDate);
    allEmployees.push(...emps);
  }

  // Аггрегируем по employee_id (на случай если кто-то на нескольких складах числится)
  const dbMap = new Map();
  for (const e of allEmployees) {
    if (!dbMap.has(e.employee_id)) {
      dbMap.set(e.employee_id, { aei: 0, picking: 0, total: 0, user_id: e.user_id, whId: e.warehouseId }); // Note: warehouseId isn't explicitly returned, but user_id is unique
    }
    const rec = dbMap.get(e.employee_id);
    rec.aei += e.aei_amount;
    rec.picking += e.picking_amount;
    rec.total += e.total_amount;
  }

  console.log('Сравнение (Только расхождения):');
  console.log('--------------------------------------------------');
  let diffCount = 0;

  for (const row of excelData) {
    const paddedEmpId = row.empId.padStart(8, '0');
    const dbRec = dbMap.get(paddedEmpId) || { aei: 0, picking: 0, total: 0 };
    
    // Округляем до целых для сравнения, так как в Excel целые числа
    const dbAmount = Math.round(row.block === 'aei' ? dbRec.aei : dbRec.picking);
    
    if (dbAmount !== row.expected) {
      const diff = row.expected - dbAmount;
      console.log(`${row.fio} (${row.empId}) [${row.block}]`);
      console.log(`  БД: ${dbAmount} ₽  |  Excel: ${row.expected} ₽  |  Разница: ${diff > 0 ? '+' : ''}${diff} ₽`);
      diffCount++;
    }
  }

  if (diffCount === 0) {
    console.log('🎉 ВСЕ ДАННЫЕ ИДЕАЛЬНО СОВПАДАЮТ!');
  } else {
    console.log(`\nИтого расхождений: ${diffCount} из ${excelData.length}`);
  }

  await app.close();
}

run().catch(console.error);
