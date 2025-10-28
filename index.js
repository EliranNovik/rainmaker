import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

/** Allow your WordPress sites to post to the proxy */
const ALLOWED_ORIGINS = [
  'https://heritage-based-european-citizenship.lawoffice.org.il',
  'https://german-austrian-citizenship.lawoffice.org.il'
];

app.use(cors({
  origin: function (origin, cb) {
    // allow tools like curl/postman (no origin) and your sites
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

/** Map host -> lead_source */
const SOURCE_MAP = {
  'heritage-based-european-citizenship.lawoffice.org.il': '30018',
  'german-austrian-citizenship.lawoffice.org.il': '12108'
};

function extractHost({ refUrl, headers }) {
  try {
    if (refUrl) return new URL(refUrl).host;
  } catch (_) {}

  const hdrRef = headers.referer || headers.referrer || '';
  try {
    if (hdrRef) return new URL(hdrRef).host;
  } catch (_) {}

  const origin = headers.origin || '';
  try {
    if (origin) return new URL(origin).host;
  } catch (_) {}

  return '';
}

app.post('/api/proxy', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    const sid = (req.body.sid && String(req.body.sid)) || Date.now().toString();
    const ref_url =
      (req.body.ref_url && String(req.body.ref_url)) ||
      req.headers.referer ||
      'https://heritage-based-european-citizenship.lawoffice.org.il/';

    const host = extractHost({ refUrl: ref_url, headers: req.headers });
    const lead_source = SOURCE_MAP[host] || '30018'; // default to heritage-based

    const url = new URL('https://www.rainmakerqueen.com/hooks/catch/');
    url.searchParams.append('uid', 'fxSOVhSeeRs9');
    url.searchParams.append('sid', sid);
    url.searchParams.append('lead_source', lead_source);
    url.searchParams.append('name', name || '');
    url.searchParams.append('phone', phone || '');
    url.searchParams.append('email', email || '');
    url.searchParams.append('topic', '');         // no country field on this form
    url.searchParams.append('desc', message || '');
    url.searchParams.append('ref_url', ref_url);

    const response = await axios.get(url.toString(), { timeout: 15000 });
    console.log(`✅ Rainmaker ${response.status} host=${host} lead_source=${lead_source}`);
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Proxy error:', err.message);
    res.status(500).send('Proxy error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
