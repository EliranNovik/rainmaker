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
      '30018': ''
    });

    const rainmakerUrl = `https://www.rainmakerqueen.com/hooks/catch/?${params.toString()}`;

    const response = await axios.get(rainmakerUrl);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error sending to Rainmaker:', error.message);
    res.status(500).send('Proxy error');
  }
});

app.get('/', (req, res) => {
  res.send('Rainmaker proxy backend is live!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
