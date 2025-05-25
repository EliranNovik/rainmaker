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
      sid: sid || '',
      name: name || '',
      topic: country || '',
      desc: message || '',
      email: email || '',
      phone: phone || '',
      ref_url: 'https://heritage-based-european-citizenship.lawoffice.org.il',
      user_data: JSON.stringify({
        form: 'WordPress Landing Page',
        source: 'Eligibility Checker'
      })
    });

    const rainmakerUrl = `https://www.rainmakerqueen.com/hooks/catch/?${params.toString()}`;
    console.log('🌐 Sending to Rainmaker:', rainmakerUrl);

    const response = await axios.get(rainmakerUrl);
    console.log('✅ Rainmaker responded with:', response.status);

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Rainmaker error:', error.message);
    if (error.response) {
      console.error('↩ Response body:', error.response.status, error.response.data);
    }
    res.status(500).send('Proxy error');
  }
});

app.get('/', (req, res) => {
  res.send('✅ Rainmaker proxy is live');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
