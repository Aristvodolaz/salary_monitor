import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import axios from 'axios';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const axiosInstance = axios.create({
    baseURL: 'http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV',
    timeout: 300000,
    proxy: false,
  });

  console.log('\n=== FETCHING ALL KANCHURINA DATA FROM SAP (Feb 2026) ===');

  try {
    // Запрос без фильтра по Employeeid (чтобы не получить 401)
    // Загружаем все данные для 02DQ за февраль и фильтруем локально
    const resp = await axiosInstance.get(
      `/WHOSet?$filter=(Lgnum eq '02DQ' and (ConfirmedDate ge datetime'2026-02-01T00:00:00' and ConfirmedDate le datetime'2026-02-28T23:59:59'))&$format=json`,
    );

    const allItems = resp.data?.d?.results || [];
    console.log(`Total records for 02DQ: ${allItems.length}`);

    // Фильтруем по Канчуриной
    const kanchItems = allItems.filter((item: any) => item.Employeeid === '00084310');
    console.log(`Records for Kanchurina (00084310): ${kanchItems.length}`);

    if (kanchItems.length === 0) {
      console.log('\n❌ NO DATA FOR KANCHURINA IN SAP!');
      await app.close();
      return;
    }

    // Анализируем WCR коды
    const wcrStats = new Map<string, number>();
    const wcrWithAEI = new Map<string, { count: number; totalAEI: number }>();
    let totalAEI = 0;

    kanchItems.forEach((item: any) => {
      const wcr = item.Wcr || 'EMPTY';
      const aei = Math.round(parseFloat(item.ZsumAmountItm || '0'));

      wcrStats.set(wcr, (wcrStats.get(wcr) || 0) + 1);

      if (aei > 0) {
        const stat = wcrWithAEI.get(wcr) || { count: 0, totalAEI: 0 };
        stat.count++;
        stat.totalAEI += aei;
        wcrWithAEI.set(wcr, stat);
        totalAEI += aei;
      }
    });

    console.log('\n=== WCR CODES USAGE ===');
    Array.from(wcrStats.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([wcr, count]) => {
        const withAEI = wcrWithAEI.get(wcr);
        console.log(
          `${wcr}: ${count} records` +
            (withAEI ? ` | ${withAEI.count} with AEI (total: ${withAEI.totalAEI})` : ' | 0 with AEI'),
        );
      });

    console.log(`\nTotal AEI from SAP: ${totalAEI}`);
    console.log(`Expected from screenshot: 66 335`);

    // Группируем по датам
    const byDate = new Map<string, { count: number; aei: number }>();
    kanchItems.forEach((item: any) => {
      if (item.ConfirmedDate) {
        const m = item.ConfirmedDate.match(/\/Date\((\d+)\)\//);
        if (m) {
          const date = new Date(parseInt(m[1], 10));
          const dateStr = date.toISOString().slice(0, 10);
          const aei = Math.round(parseFloat(item.ZsumAmountItm || '0'));
          const stat = byDate.get(dateStr) || { count: 0, aei: 0 };
          stat.count++;
          stat.aei += aei;
          byDate.set(dateStr, stat);
        }
      }
    });

    console.log('\n=== DATA BY DATE ===');
    Array.from(byDate.entries())
      .sort()
      .forEach(([date, stat]) => {
        console.log(`${date}: ${stat.count} records, ${stat.aei} AEI`);
      });
  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
    }
  }

  await app.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
