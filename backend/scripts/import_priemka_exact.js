const fs = require('fs');
const sql = require('mssql');

const DB = {
  server:   'PRM-SRV-MSSQL-01.komus.net',
  port:     59587,
  user:     'sa',
  password: 'icY2eGuyfU',
  database: 'SalaryMonitor',
  options:  { encrypt: false, trustServerCertificate: true },
};

async function main() {
  console.log('Подключение к БД...');
  const pool = await sql.connect(DB);
  
  try {
    const rawData = fs.readFileSync('../../data_priemka_new.txt', 'utf8');
    const lines = rawData.split('\n').filter(l => l.trim().length > 0);
    
    const userToNorms = new Map(); // fio_full -> [ {wcr_code, aei_count, amount, type_name} ]
    
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t').map(s => s.trim());
      if (parts.length < 11) {
        console.log(`Пропуск строки ${i + 1} (мало столбцов): ${lines[i]}`);
        continue;
      }
      
      const wcr_code = parts[0];
      const aei_count = parseInt(parts[2].replace(/[\s\u00A0]/g, ''), 10) || 0;
      let fio_full = parts[4];
      const type_name = parts[5];
      const amount = parseFloat(parts[11].replace(/[\s\u00A0]/g, '').replace(',', '.')) || 0;
      // Исправление опечаток в ФИО, если нужно. В файле "Абдумаликов Шомурод Абдумалик" вместо "Абдумаликов Шомурод Абдумаликович ."
      if (fio_full.includes('Абдумаликов Шомурод')) fio_full = 'АБДУМАЛИКОВ ШОМУРОД АБДУМАЛИКОВИЧ .';
      if (fio_full.includes('Бердников Артём')) fio_full = 'БЕРДНИКОВ АРТЁМ АЛЕКСАНДРОВИЧ .';
      if (fio_full.includes('Денисов Юрий')) fio_full = 'ДЕНИСОВ ЮРИЙ ВАСИЛЬЕВИЧ .';
      if (fio_full.includes('Долматов Илья')) fio_full = 'ДОЛМАТОВ ИЛЬЯ АНАТОЛЬЕВИЧ .';
      if (fio_full.includes('Храпов Максим')) fio_full = 'ХРАПОВ МАКСИМ СЕРГЕЕВИЧ .';
      if (fio_full.includes('Клемин Борис')) fio_full = 'КЛЕМИН БОРИС ВИКТОРОВИЧ .';
      if (fio_full.includes('Надралиев Ермек')) fio_full = 'НАДРАЛИЕВ ЕРМЕК БИСИМБАЕВИЧ .';
      if (fio_full.includes('Сопов Александр')) fio_full = 'СОПОВ АЛЕКСАНДР ВАСИЛЬЕВИЧ .';
      if (fio_full.includes('Таженов Серик')) fio_full = 'ТАЖЕНОВ СЕРИК ЗЕЙНУЛЛИЕВИЧ .';
      if (fio_full.includes('Дмитриев Владимир')) fio_full = 'ДМИТРИЕВ ВЛАДИМИР АНДРЕЕВИЧ .';
      if (fio_full.includes('Евчик Александр')) fio_full = 'ЕВЧИК АЛЕКСАНДР АНДРЕЕВИЧ .';
      if (fio_full.includes('Кузовкова Ольга')) fio_full = 'КУЗОВКОВА ОЛЬГА ВЯЧЕСЛАВОВНА .';
      if (fio_full.includes('Мисюля Елена')) fio_full = 'МИСЮЛЯ ЕЛЕНА ИВАНОВНА .';
      if (fio_full.includes('Баймуратов Уланбек')) fio_full = 'БАЙМУРАТОВ УЛАНБЕК ТАЛАНТБЕКОВИЧ .';
      if (fio_full.includes('Иксанов Рафаэль')) fio_full = 'ИКСАНОВ РАФАЭЛЬ НАФИСОВИЧ .';
      if (fio_full.includes('Миронов Виталий')) fio_full = 'МИРОНОВ ВИТАЛИЙ ВЛАДИМИРОВИЧ .';
      if (fio_full.includes('Мищенков Дмитрий')) fio_full = 'МИЩЕНКОВ ДМИТРИЙ ЕВГЕНЬЕВИЧ .';
      if (fio_full.includes('Новиков Александр')) fio_full = 'НОВИКОВ АЛЕКСАНДР ВИКТОРОВИЧ .';
      if (fio_full.includes('Стоякин Александр')) fio_full = 'СТОЯКИН АЛЕКСАНДР ВИКТОРОВИЧ .';
      if (fio_full.includes('Тупелекин Денис')) fio_full = 'ТУПЕЛЕКИН ДЕНИС АЛЕКСАНДРОВИЧ .';
      if (fio_full.includes('Ноокенбаева Чолпонай')) fio_full = 'НООКЕНБАЕВА ЧОЛПОНАЙ АНАРБЕКОВНА .';
      if (fio_full.includes('Шуменко Александр')) fio_full = 'ШУМЕНКО АЛЕКСАНДР АЛЕКСАНДРОВИЧ .';
      if (fio_full.includes('Смирнов Александр')) fio_full = 'СМИРНОВ АЛЕКСАНДР АНДРИАНОВИЧ .';
      if (fio_full.includes('Захаров Михаил')) fio_full = 'ЗАХАРОВ МИХАИЛ МИХАЙЛОВИЧ .';
      if (fio_full.includes('Фомина Анастасия')) fio_full = 'ФОМИНА АНАСТАСИЯ АЛЕКСАНДРОВНА .';
      if (fio_full.includes('Канищева Светлана')) fio_full = 'КАНИЩЕВА СВЕТЛАНА НИКОЛАЕВНА .';
      if (fio_full.includes('Медерова Каныкей')) fio_full = 'МЕДЕРОВА КАНЫКЕЙ .';
      if (fio_full.includes('Турсунов Акрамжон')) fio_full = 'ТУРСУНОВ АКРАМЖОН МИРЗОМУРОДОВИЧ .';
      if (fio_full.includes('Федотов Роман')) fio_full = 'ФЕДОТОВ РОМАН АЛЕКСАНДРОВИЧ .';
      if (fio_full.includes('Гозиев Куёшбек')) fio_full = 'ГОЗИЕВ КУЁШБЕК АБДУРАХИМОВИЧ .';
      if (fio_full.includes('Дозорец Алексей')) fio_full = 'ДОЗОРЕЦ АЛЕКСЕЙ ЕВГЕНЬЕВИЧ .';
      if (fio_full.includes('Кулешов Александр')) fio_full = 'КУЛЕШОВ АЛЕКСАНДР ВЛАДИМИРОВИЧ .';
      if (fio_full.includes('Богданова Елена')) fio_full = 'БОГДАНОВА ЕЛЕНА НИКОЛАЕВНА .';
      if (fio_full.includes('Синельщиков Алексей')) fio_full = 'СИНЕЛЬЩИКОВ АЛЕКСЕЙ АНАТОЛЬЕВИЧ .';
      if (fio_full.includes('Логиновская Екатерина')) fio_full = 'ЛОГИНОВСКАЯ ЕКАТЕРИНА БОРИСОВНА .';
      if (fio_full.includes('Малинина Вера')) fio_full = 'МАЛИНИНА ВЕРА СЕРГЕЕВНА .';
      
      if (!userToNorms.has(fio_full)) {
        userToNorms.set(fio_full, []);
      }
      
      userToNorms.get(fio_full).push({
        wcr_code,
        aei_count,
        amount,
        type_name
      });
    }
    
    // Получаем всех пользователей 02DQ из базы
    const usersRes = await pool.request().query(`
      SELECT u.id, u.fio, u.employee_id, w.code as warehouse_code 
      FROM users u
      LEFT JOIN warehouses w ON u.warehouse_id = w.id
      WHERE w.code = '02DQ'
    `);
    
    const dbUsersMap = new Map(); // fio_normalized -> user_id
    for (const u of usersRes.recordset) {
      let normFio = u.fio.replace(/\s+/g, ' ').trim().toUpperCase();
      dbUsersMap.set(normFio, u);
    }
    
    console.log(`Прочитано из файла: ${userToNorms.size} сотрудников.`);
    
    // Удаляем ВСЕ операции wcr_norms за март для 02DQ, включая FIX
    console.log('Удаление старых операций Приемки и Хранения за март (02DQ)...');
    const delRes = await pool.request().query(`
      DELETE o 
      FROM operations o
      JOIN users u ON o.user_id = u.id
      JOIN warehouses w ON u.warehouse_id = w.id
      WHERE w.code = '02DQ'
        AND o.operation_date >= '2026-03-01' AND o.operation_date < '2026-04-01'
        AND (o.wcr_code IN (SELECT wcr_code FROM wcr_norms) OR o.sap_order_id = 'EXCEL_SYNC');
        
      DELETE no 
      FROM norms_operations no
      JOIN users u ON no.user_id = u.id
      JOIN warehouses w ON u.warehouse_id = w.id
      WHERE w.code = '02DQ'
        AND no.operation_date >= '2026-03-01' AND no.operation_date < '2026-04-01'
        AND (no.wcr_code IN (SELECT wcr_code FROM wcr_norms) OR no.sap_order_id = 'EXCEL_SYNC');
    `);
    console.log(`Удалено строк из operations: ${delRes.rowsAffected[0]}`);
    
    console.log('Вставка точных эталонных операций...');
    
    let insertedCount = 0;
    
    for (const [fio, ops] of userToNorms.entries()) {
      let normFio = fio.replace(/\s+/g, ' ').trim().toUpperCase();
      
      let dbUser = dbUsersMap.get(normFio);
      if (!dbUser) {
        // Попробуем найти по первым 2 словам
        let nameParts = normFio.split(' ');
        if (nameParts.length >= 2) {
          let prefix = (nameParts[0] + ' ' + nameParts[1]).toUpperCase();
          for (const [dfio, du] of dbUsersMap.entries()) {
            if (dfio.startsWith(prefix)) {
              dbUser = du;
              break;
            }
          }
        }
        if (!dbUser) {
          console.error(`⚠️ Не найден сотрудник в БД: ${normFio}`);
          continue;
        }
      }
      
      // Группируем операции по wcr_code (вдруг в таблице несколько строк для одного)
      const groupedOps = new Map();
      for (const op of ops) {
        if (!groupedOps.has(op.wcr_code)) {
          groupedOps.set(op.wcr_code, { aei: 0, amt: 0, type_name: op.type_name });
        }
        const g = groupedOps.get(op.wcr_code);
        g.aei += op.aei_count;
        g.amt += op.amount;
      }
      
      for (const [wcr, g] of groupedOps.entries()) {
        if (g.aei === 0 && g.amt === 0) continue;
        
        await pool.request()
          .input('userId', sql.Int, dbUser.id)
          .input('warehouseCode', sql.NVarChar(20), dbUser.warehouse_code)
          .input('operationType', sql.NVarChar(100), wcr)
          .input('count', sql.Int, g.aei)
          .input('prodCount', sql.Int, 0)
          .input('operationDate', sql.DateTime, new Date('2026-03-31T20:00:00Z'))
          .input('amount', sql.Float, g.amt)
          .input('wcrCode', sql.NVarChar(50), wcr)
          .query(`
            INSERT INTO operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
            VALUES (@userId, @warehouseCode, @operationType, @count, 0, 0, @operationDate, @amount, 'EXCEL_SYNC', @wcrCode);
            
            INSERT INTO norms_operations (user_id, warehouse_code, operation_type, count, prod_count, actdura, operation_date, amount, sap_order_id, wcr_code)
            VALUES (@userId, @warehouseCode, @operationType, @count, 0, 0, @operationDate, @amount, 'EXCEL_SYNC', @wcrCode);
          `);
        
        insertedCount++;
      }
    }
    
    console.log(`✅ Успешно вставлено ${insertedCount} агрегированных записей операций Приемки.`);
    
  } catch (e) {
    console.error('Ошибка:', e);
  } finally {
    await pool.close();
  }
}

main();