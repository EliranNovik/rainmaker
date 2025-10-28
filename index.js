import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

/** Allow your WordPress sites to post to the proxy (safe to keep even for webhook) */
const ALLOWED_ORIGINS = [
  'https://heritage-based-european-citizenship.lawoffice.org.il',
  'https://german-austrian-citizenship.lawoffice.org.il'
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  }
}));

/** Parse BOTH JSON and form-encoded bodies (Elementor often uses form-encoded) */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** host -> lead_source */
const SOURCE_MAP = {
  'heritage-based-european-citizenship.lawoffice.org.il': '30018',
  'german-austrian-citizenship.lawoffice.org.il': '12108'
};

function extractHost({ refUrl, headers }) {
  try { if (refUrl) return new URL(refUrl).host; } catch {}
  try {
    const r = headers.referer || headers.referrer || '';
    if (r) return new URL(r).host;
  } catch {}
  try {
    const o = headers.origin || '';
    if (o) return new URL(o).host;
  } catch {}
  return '';
}

/** Normalize Elementor payloads (JSON, form-encoded, fields array, or form_fields object) */
function normalizeBody(req) {
  const b = req.body || {};

  // Case A: our own JS sent JSON
  if (b.name || b.email || b.phone || b.message) {
    return {
      name: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      message: b.message || '',
      ref_url: b.ref_url || b.referer || b.page_url || req.headers.referer || ''
    };
  }

  // Case B: Elementor sends flat form fields
  if (b['name'] || b['email'] || b['phone'] || b['message'] || b['country_code'] || b['country code']) {
    const phone = [b['country_code'] || b['country code'] || '', b['phone'] || '']
      .map(s => (s || '').trim()).filter(Boolean).join(' ');
    return {
      name: b['name'] || '',
      email: b['email'] || '',
      phone,
      message: b['message'] || '',
      // Elementor "Advanced Data" often posts these:
      ref_url: b['referer'] || b['page_url'] || req.headers.referer || ''
    };
  }

  // Case C: Elementor sends { fields: [{id, value}, ...] }
  if (Array.isArray(b.fields)) {
    const byId = Object.fromEntries(b.fields.map(f => [String(f.id || '').trim(), f.value]));
    const phone = [byId.country_code || byId['country code'] || '', byId.phone || '']
      .map(s => (s || '').trim()).filter(Boolean).join(' ');
    return {
      name: byId.name || '',
      email: byId.email || '',
      phone,
      message: byId.message || '',
      ref_url: b.referer || b.page_url || req.headers.referer || ''
    };
  }

  // Case D: Elementor sends { form_fields: { name:..., email:..., ... } }
  if (b.form_fields && typeof b.form_fields === 'object') {
    const f = b.form_fields;
    const phone = [f.country_code || f['country code'] || '', f.phone || '']
      .map(s => (s || '').trim()).filter(Boolean).join(' ');
    return {
      name: f.name || '',
      email: f.email || '',
      phone,
      message: f.message || '',
      ref_url: b.referer || b.page_url || req.headers.referer || ''
    };
  }

  return { name: '', email: '', phone: '', message: '', ref_url: req.headers.referer || '' };
}

app.get('/health', (_req, res) => res.send('healthy'));

app.post('/api/proxy', async (req, res) => {
  try {
    const { name, email, phone, message, ref_url } = normalizeBody(req);

    // helpful debug while testing (comment out after confirming)
    console.log('Incoming keys:', Object.keys(req.body));
    console.log('Normalized:', { name, email, phone, message, ref_url });

    const sid = Date.now().toString();
    const host = extractHost({ refUrl: ref_url, headers: req.headers });
    const lead_source = SOURCE_MAP[host] || '30018';

    const url = new URL('https://www.rainmakerqueen.com/hooks/catch/');
    url.searchParams.append('uid', 'fxSOVhSeeRs9');
    url.searchParams.append('sid', sid);
    url.searchParams.append('lead_source', lead_source);
    url.searchParams.append('name', name || '');
    url.searchParams.append('phone', phone || '');
    url.searchParams.append('email', email || '');
    url.searchParams.append('topic', ''); // none on this form
    url.searchParams.append('desc', message || '');
    url.searchParams.append('ref_url', ref_url || '');

    const response = await axios.get(url.toString(), { timeout: 15000 });
    console.log(`✅ Rainmaker ${response.status} host=${host} lead_source=${lead_source}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ Proxy error:', err.message);
    res.status(500).json({ ok: false, error: 'Proxy error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
