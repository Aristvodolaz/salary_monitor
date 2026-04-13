const axios = require('axios');
const http = require('http');

async function testSap() {
  try {
    const auth = Buffer.from('SALAR_TO_PWM:9pVQMGLC').toString('base64');
    const resp = await axios.get('http://pwm.komus.net:80/sap/opu/odata/sap/Z_REP_MON_ORDERS_SRV/$metadata', { 
      timeout: 10000,
      headers: { 'Authorization': `Basic ${auth}` },
      httpAgent: new http.Agent({ keepAlive: true })
    });
    console.log("SAP reached", resp.status);
  } catch (err) {
    console.error("SAP error:", err.message);
  }
}
testSap();