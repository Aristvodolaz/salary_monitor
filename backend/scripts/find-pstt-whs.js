require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const axiosInst = axios.create({
  baseURL: process.env.SAP_ODATA_BASE_URL,
  auth: { username: process.env.SAP_USERNAME, password: process.env.SAP_PASSWORD },
  timeout: 60000,
});

async function getMetadata() {
  const resp = await axiosInst.get('/$metadata');
  const text = resp.data;
  // Find all EntitySet names
  const matches = text.match(/EntitySet Name="([^"]+)"/g) || [];
  console.log('Entity sets:', matches.join('\n'));
  
  // Also look for any "Lname" or other fields that might hold salary codes
  const lnameMatches = text.match(/Name="[A-Z][a-zA-Z]+"/g)?.slice(0, 30) || [];
  console.log('\nSome property names:', lnameMatches.join(', '));
}

getMetadata().catch(e => {
  console.log('Metadata error:', e.response?.status, e.message);
});
