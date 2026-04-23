const path = require('path');
const { createRequire } = require('module');
const http = require('http');

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

async function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, port: parseInt(u.port||'80'), path: u.pathname + u.search,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    };
    http.get(opts, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); }
        catch { resolve({ rawBody: b.slice(0,200) }); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const auth = await post('http://localhost:3000/api/auth/barcode', { employeeId: 'superadmin' });
  if (!auth.access_token) { console.log('Auth failed:', JSON.stringify(auth)); return; }
  const token = auth.access_token;
  console.log('✅ Авторизован как', auth.user?.fio);

  for (const section of ['picking', 'receiving']) {
    const url = `http://localhost:3000/api/admin/salary?startDate=2026-03-01&endDate=2026-03-31&section=${section}`;
    const data = await get(url, token);
    if (Array.isArray(data)) {
      const total = data.reduce((s,r)=>s+(r.total_amount||0),0);
      console.log(`\n${section}: ${data.length} сотрудников, итого ${total.toLocaleString('ru',{maximumFractionDigits:2})} руб.`);
      data.slice(0,3).forEach(r => console.log(`  ${r.fio} | ${r.warehouse_code} | ${r.total_amount}`));
    } else {
      console.log(`\n${section} — ответ:`, JSON.stringify(data).slice(0,300));
    }
  }
}
main().catch(e => console.error('ERR:', e.message));
