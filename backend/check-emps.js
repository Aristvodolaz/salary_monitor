const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { NormsService } = require('./dist/norms/norms.service');
async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const normsService = app.get(NormsService);
  const emps = await normsService.getNormsEmployees(2, '2026-03-01', '2026-03-31');
  console.log('Employees count:', emps.length);
  await app.close();
}
run().catch(console.error);