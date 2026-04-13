const axios = require('axios');

async function testSap() {
  try {
    const resp = await axios.get('http://pwm.komus.net:8000', { timeout: 5000 });
    console.log("SAP reached", resp.status);
  } catch (err) {
    console.error("SAP error:", err.message);
  }
}
testSap();