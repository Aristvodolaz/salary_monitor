const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function updateMappingAndTariffs() {
  const pool = await sql.connect(config);
  
  console.log('--- UPDATING WCR MAPPING ---');
  const mappings = [
    { wcr: 'PKM5', type: 'М5 Упаковка', area: 'М5' },
    { wcr: 'P2M5', type: 'М5 Штучная комплектация', area: 'М5' },
    { wcr: 'PKM4', type: 'М4 Упаковка', area: 'М4' },
    { wcr: 'P2M4', type: 'М4 Штучная комплектация', area: 'М4' },
    { wcr: 'PKMC', type: 'МС Упаковка', area: 'МС' },
    { wcr: 'P2MC', type: 'МС Штучная комплектация', area: 'МС' },
    { wcr: 'PKM2', type: 'М2 Упаковка', area: 'М2' },
    { wcr: 'P2M2', type: 'М2 Штучная комплектация', area: 'М2' },
    { wcr: 'GRUZ', type: 'ПМ Погрузка', area: 'ПМ' }, // Based on AEI volume in 02DQ
  ];

  for (const m of mappings) {
    await pool.request()
      .input('wcr', sql.NVarChar, m.wcr)
      .input('type', sql.NVarChar, m.type)
      .input('area', sql.NVarChar, m.area)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM wcr_mapping WHERE wcr_code = @wcr)
          INSERT INTO wcr_mapping (wcr_code, operation_type, participant_area, is_active)
          VALUES (@wcr, @type, @area, 1)
        ELSE
          UPDATE wcr_mapping SET operation_type = @type, participant_area = @area, is_active = 1 WHERE wcr_code = @wcr
      `);
    console.log(`  Mapped ${m.wcr} -> ${m.type}`);
  }

  console.log('\n--- UPDATING TARIFFS (FEB 2026) ---');
  // From screenshot:
  const newRates = [
    { type: 'М2 Коробочная комплектация', rate: 16.3, norm: 23 },
    { type: 'М4 Коробочная комплектация', rate: 5.8, norm: 65 },
    { type: 'М2 Штучная комплектация', rate: 1.5, norm: 250 },
    { type: 'М4 Штучная комплектация', rate: 1.5, norm: 245 },
    { type: 'М5 Штучная комплектация', rate: 1.2, norm: 320 },
    { type: 'М2 Штучн.компл.однострочн', rate: 2.1, norm: 180 },
    { type: 'М3 Штучн.компл.однострочн', rate: 11.0, norm: 34 },
    { type: 'М4 Штучн.компл.однострочн', rate: 2.5, norm: 150 },
    { type: 'М5 Штучн.компл.однострочн', rate: 1.4, norm: 260 },
    { type: 'М3 Штучная комплектация', rate: 7.2, norm: 52 },
    { type: 'М2 Упаковка', rate: 1.5, norm: 250 },
    { type: 'М4 Упаковка', rate: 1.6, norm: 240 },
    { type: 'М5 Упаковка', rate: 1.2, norm: 300 },
    { type: 'ПМ Упаковка', rate: 4.3, norm: 87 },
    { type: 'ФС Штучная комплектация', rate: 3.0, norm: 125 },
  ];

  for (const r of newRates) {
    // Update active tariffs for Feb
    await pool.request()
      .input('type', sql.NVarChar, r.type)
      .input('rate', sql.Float, r.rate)
      .input('norm', sql.Int, r.norm)
      .query(`
        UPDATE tariffs 
        SET rate = @rate, norm_aei_per_hour = @norm 
        WHERE operation_type = @type 
          AND is_active = 1
          AND valid_from <= '2026-02-01'
          AND (valid_to IS NULL OR valid_to >= '2026-02-28')
      `);
    console.log(`  Updated tariff ${r.type} -> ${r.rate}`);
  }

  await pool.close();
  console.log('\n✅ Mapping and Tariffs updated!');
}

updateMappingAndTariffs();
