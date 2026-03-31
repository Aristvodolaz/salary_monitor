const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axiosInstance = axios.create({ baseURL: process.env.SAP_ODATA_BASE_URL, auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD }, timeout: 180000 });

async function marchSpy() {
  const employeeId = '00084310';
  const day = '2026-03-03T00:00:00';
  const end = '2026-03-03T23:59:59';
  const url = `/WHOSet?$filter=(Employeeid eq '${employeeId}' and (ConfirmedDate ge datetime'${day}' and ConfirmedDate le datetime'${end}'))&$format=json`;
  try {
    const resp = await axiosInstance.get(url);
    const results = resp.data?.d?.results || [];
    console.log('📊 March SAP (00084310) for Mar 3: ' + results.length + ' records');
    if (results.length > 0) {
      const stats = {};
      results.forEach(r => { stats[r.Wcr] = (stats[r.Wcr] || 0) + 1; });
      console.log('WCR in March for her: ', JSON.stringify(stats));
    }
  } catch (err) { console.error('Ошибка: ' + err.message); }
}
marchSpy();
