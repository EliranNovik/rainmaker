import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/api/proxy', async (req, res) => {
  const {
    name,
    email,
    phone,
    country,
    message,
    sid = Date.now().toString(),
    lead_source = '30018', // <-- default only if not provided
    ref_url = 'https://heritage-based-european-citizenship.lawoffice.org.il/'
  } = req.body;

  const url = new URL('https://www.rainmakerqueen.com/hooks/catch/');
  url.searchParams.append('uid', 'fxSOVhSeeRs9');
  url.searchParams.append('sid', sid);
  url.searchParams.append('lead_source', lead_source);
  url.searchParams.append('name', name || '');
  url.searchParams.append('phone', phone || '');
  url.searchParams.append('email', email || '');
  url.searchParams.append('topic', country || '');
  url.searchParams.append('desc', message || '');
  url.searchParams.append('ref_url', ref_url);

  try {
    const response = await axios.get(url.toString());
    console.log('✅ Rainmaker responded with:', response.status);
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Rainmaker error:', err.message);
    res.status(500).send('Proxy error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
