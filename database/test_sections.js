const path = require('path');
const { createRequire } = require('module');
const sql = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('mssql');
const http = require('http');

async function req(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Authorization: `Bearer ${token}` }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    }).on('error', reject);
  });
}

async function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const r = http.request(opts, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(b); } });
    });
    r.on('error', reject);
    r.write(data); r.end();
  });
}

async function main() {
  const auth = await post('http://localhost:3000/api/auth/barcode', { employeeId: 'superadmin' });
  const token = auth.access_token;
  console.log('Токен:', token ? 'OK' : 'ERROR');

  const picking = await req('http://localhost:3000/api/admin/salary?startDate=2026-03-01&endDate=2026-03-31&section=picking', token);
  console.log(`\nКомплектация: ${Array.isArray(picking) ? picking.length : 'error'} сотрудников`);
  if (Array.isArray(picking) && picking.length > 0) {
    const total = picking.reduce((s,r)=>s+r.total_amount,0);
    console.log(`Итого: ${total.toLocaleString('ru',{maximumFractionDigits:2})} руб.`);
  }

  const recv = await req('http://localhost:3000/api/admin/salary?startDate=2026-03-01&endDate=2026-03-31&section=receiving', token);
  console.log(`\nПриёмка и Хранение: ${Array.isArray(recv) ? recv.length : 'error'} сотрудников`);
  if (Array.isArray(recv) && recv.length > 0) {
    const total = recv.reduce((s,r)=>s+r.total_amount,0);
    console.log(`Итого: ${total.toLocaleString('ru',{maximumFractionDigits:2})} руб.`);
  }
}
main().catch(e => console.error('ERR:', e.message));
