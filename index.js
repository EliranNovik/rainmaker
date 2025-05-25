import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/api/proxy', async (req, res) => {
  try {
    const { name, email, phone, country, message, sid } = req.body;

    const params = new URLSearchParams({
      uid: 'fxSOVhSeeRs9',
      sid: encodeURIComponent(sid || ''),
      name: encodeURIComponent(name || ''),
      topic: encodeURIComponent(country || ''),
      desc: encodeURIComponent(message || ''),
      email: encodeURIComponent(email || ''),
      phone: encodeURIComponent(phone || ''),
      ref_url: encodeURIComponent('https://heritage-based-european-citizenship.lawoffice.org.il'), // optional
      user_data: encodeURIComponent(JSON.stringify({ from: 'WordPress Landing Form' })) // optional
    });

    const rainmakerUrl = `https://www.rainmakerqueen.com/hooks/catch/?${params.toString()}`;
    console.log('🌐 Forwarding GET to Rainmaker:', rainmakerUrl);

    const response = await axios.get(rainmakerUrl);
    console.log('✅ Rainmaker responded with status:', response.status);

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Error sending to Rainmaker:', error.message);
    if (error.response) {
      console.error('↩ Rainmaker response:', error.response.status, error.response.data);
    }
    res.status(500).send('Proxy error');
  }
});

app.get('/', (req, res) => {
  res.send('✅ Rainmaker proxy backend is live!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
