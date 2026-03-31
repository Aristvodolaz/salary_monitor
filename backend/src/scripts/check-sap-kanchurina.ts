import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SapIntegrationService } from '../sap-integration/sap-integration.service';
import axios from 'axios';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sapService = app.get(SapIntegrationService);

  // Проверяем данные из SAP для Канчуриной за 01 февраля
  const url = `http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV/WHOSet?$filter=(Lgnum eq '02DQ' and Employeeid eq '00084310' and (ConfirmedDate ge datetime'2026-02-01T00:00:00' and ConfirmedDate le datetime'2026-02-01T23:59:59'))&$format=json`;

  console.log('\n=== SAP REQUEST FOR KANCHURINA (Feb 01) ===');
  console.log(`URL: ${url}`);

  try {
    const axiosInstance = axios.create({
      baseURL: 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV',
      timeout: 180000,
      proxy: false,
    });

    const resp = await axiosInstance.get(
      `/WHOSet?$filter=(Lgnum eq '02DQ' and Employeeid eq '00084310' and (ConfirmedDate ge datetime'2026-02-01T00:00:00' and ConfirmedDate le datetime'2026-02-01T23:59:59'))&$format=json`,
    );

    const items = resp.data?.d?.results || [];
    console.log(`\nTotal records from SAP: ${items.length}`);

    if (items.length > 0) {
      console.log('\n=== SAMPLE RECORDS ===');
      items.slice(0, 5).forEach((item: any) => {
        console.log(
          `Who: ${item.Who} | Wcr: ${item.Wcr} | ZsumAmountItm: ${item.ZsumAmountItm} | Actdura: ${item.Actdura}`,
        );
      });
    }

    // Теперь проверяем за весь февраль
    console.log('\n=== SAP REQUEST FOR KANCHURINA (Full Feb 2026) ===');
    const respFull = await axiosInstance.get(
      `/WHOSet?$filter=(Lgnum eq '02DQ' and Employeeid eq '00084310' and (ConfirmedDate ge datetime'2026-02-01T00:00:00' and ConfirmedDate le datetime'2026-02-28T23:59:59'))&$format=json`,
    );

    const itemsFull = respFull.data?.d?.results || [];
    console.log(`Total records from SAP (full month): ${itemsFull.length}`);

    // Группируем по датам
    const byDate = new Map<string, number>();
    itemsFull.forEach((item: any) => {
      if (item.ConfirmedDate) {
        const m = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
        if (m) {
          const date = new Date(parseInt(m[1], 10));
          const dateStr = date.toISOString().slice(0, 10);
          byDate.set(dateStr, (byDate.get(dateStr) || 0) + 1);
        }
      }
    });

    console.log('\n=== SAP DATA BY DATE ===');
    Array.from(byDate.entries())
      .sort()
      .forEach(([date, count]) => {
        console.log(`${date}: ${count} records`);
      });
  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
  }

  await app.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
