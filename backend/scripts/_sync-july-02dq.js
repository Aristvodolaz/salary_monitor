/**
 * July 02DQ SAP re-sync. DELETEs the period after a SAP probe.
 *
 * Do NOT run from Windows (pwm.komus.net does not resolve here).
 * Run only on Linux /home/admin-lc/salary_monitor AFTER dist contains
 * probe-before-DELETE, with ALLOW_JULY_02DQ_SYNC=1.
 */
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const os = require('os');

const backendRoot = path.join(__dirname, '..');
const distService = path.join(
  backendRoot,
  'dist',
  'sap-integration',
  'sap-integration.service.js',
);

function refuse(msg) {
  console.error(msg);
  process.exit(1);
}

if (process.env.ALLOW_JULY_02DQ_SYNC !== '1') {
  refuse(
    'DISABLED: set ALLOW_JULY_02DQ_SYNC=1 only on Linux after confirming probe-before-DELETE in dist.\n' +
      'Example:\n' +
      '  grep -n "probe SAP" dist/sap-integration/sap-integration.service.js\n' +
      '  ALLOW_JULY_02DQ_SYNC=1 node scripts/_sync-july-02dq.js',
  );
}

if (process.platform === 'win32') {
  refuse(
    'DISABLED on Windows (' +
      os.hostname() +
      '). A failed SAP DNS lookup already deleted 57870 July 02DQ rows. Sync from /home/admin-lc/salary_monitor.',
  );
}

if (!fs.existsSync(distService)) {
  refuse('Missing ' + distService + '. Build backend first (npx tsc -p tsconfig.json).');
}

const distJs = fs.readFileSync(distService, 'utf8');
if (!distJs.includes('probe SAP') || !distJs.includes('SAP доступен — очищаем период')) {
  refuse(
    'dist sap-integration.service.js has no probe-before-DELETE. Deploy/build that code FIRST, otherwise another failed sync can wipe July 02DQ again.',
  );
}

async function bootstrap() {
  try {
    await dns.lookup('pwm.komus.net');
  } catch (e) {
    refuse('SAP DNS failed before any Nest/DELETE: ' + (e && e.message) + '. Aborting.');
  }

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { SapIntegrationService } = require('../dist/sap-integration/sap-integration.service');

  const app = await NestFactory.createApplicationContext(AppModule);
  const sapService = app.get(SapIntegrationService);

  const start = new Date('2026-07-01T00:00:00Z');
  const end = new Date('2026-07-31T23:59:59Z');

  console.log(`SAP sync 02DQ: ${start.toISOString()} .. ${end.toISOString()}`);
  console.log('Probe-before-DELETE confirmed in dist. Period delete + MERGE for July 02DQ only.');

  try {
    await sapService.syncWarehouseManual('02DQ', start, end);
    console.log('SAP sync 02DQ July completed.');
  } catch (error) {
    console.error('SAP sync failed:', error && error.message);
    console.error(error && error.stack);
    process.exitCode = 1;
  }

  await app.close();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
