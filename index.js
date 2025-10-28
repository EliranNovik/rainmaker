import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  'https://heritage-based-european-citizenship.lawoffice.org.il',
  'https://german-austrian-citizenship.lawoffice.org.il'
];

app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED_ORIGINS.includes(origin)) ? cb(null, true) : cb(new Error('Not allowed by CORS'))
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SOURCE_MAP = {
  'heritage-based-european-citizenship.lawoffice.org.il': '30018',
  'german-austrian-citizenship.lawoffice.org.il': '12108'
};

function extractHost({ refUrl, headers }) {
  try { if (refUrl) return new URL(refUrl).host; } catch {}
  try { const r = headers.referer || headers.referrer || ''; if (r) return new URL(r).host; } catch {}
  try { const o = headers.origin || ''; if (o) return new URL(o).host; } catch {}
  return '';
}

/** Safely get a value from an Elementor "field" object */
function fieldValue(f) {
  return f?.value ?? f?.raw_value ?? f?.values ?? (typeof f === 'string' ? f : '');
}

/** Find a field in many possible shapes / keys */
function pick(fields, key) {
  if (!fields) return '';

  // Array of objects: [{ id: 'name', value: 'John' }, ...]
  if (Array.isArray(fields)) {
    for (const f of fields) {
      const fid = String(f?.id ?? f?.key ?? f?.title ?? f?.shortcode ?? f?.field_id ?? '').trim().toLowerCase();
      if (fid === key) return fieldValue(f) || '';
    }
    return '';
  }

  // Object map: { name: {value:'John'}, email:{...}, ... } or { name:'John' }
  if (typeof fields === 'object') {
    const entry = fields[key];
    if (!entry) return '';
    if (typeof entry === 'object') return fieldValue(entry) || '';
    return String(entry || '');
  }

  return '';
}

/** Normalize ANY Elementor / custom payload to {name,email,phone,message,ref_url} */
function normalizeBody(req) {
  const b = req.body || {};

  // Prefer Elementor's meta for ref_url
  const metaRef = b?.meta?.referer || b?.meta?.page_url || '';

  // 1) Our custom JSON (from JS)
  if (b.name || b.email || b.phone || b.message) {
    return {
      name: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      message: b.message || '',
      ref_url: b.ref_url || metaRef || req.headers.referer || ''
    };
  }

  // 2) Elementor flat form-encoded
  if (b['name'] || b['email'] || b['phone'] || b['message'] || b['country_code'] || b['country code']) {
    const phone = [b['country_code'] || b['country code'] || '', b['phone'] || '']
      .map(s => (s || '').trim()).filter(Boolean).join(' ');
    return {
      name: b['name'] || '',
      email: b['email'] || '',
      phone,
      message: b['message'] || '',
      ref_url: metaRef || b['referer'] || b['page_url'] || req.headers.referer || ''
    };
  }

  // 3) Elementor { fields: ... } (array or object) + { meta: ... }
  if (b.fields) {
    const name = pick(b.fields, 'name');
    const email = pick(b.fields, 'email');
    const cc = pick(b.fields, 'country_code') || pick(b.fields, 'country code');
    const phoneRaw = pick(b.fields, 'phone');
    const phone = [cc, phoneRaw].map(s => (s || '').trim()).filter(Boolean).join(' ');
    const message = pick(b.fields, 'message');

    return {
      name: String(name || ''),
      email: String(email || ''),
      phone: String(phone || ''),
      message: String(message || ''),
      ref_url: metaRef || req.headers.referer || ''
    };
  }

  // 4) Elementor { form_fields: { ... } }
  if (b.form_fields && typeof b.form_fields === 'object') {
    const f = b.form_fields;
    const phone = [f.country_code || f['country code'] || '', f.phone || '']
      .map(s => (s || '').trim()).filter(Boolean).join(' ');
    return {
      name: f.name || '',
      email: f.email || '',
      phone,
      message: f.message || '',
      ref_url: metaRef || req.headers.referer || ''
    };
  }

  return { name: '', email: '', phone: '', message: '', ref_url: metaRef || req.headers.referer || '' };
}

app.get('/health', (_req, res) => res.send('healthy'));

app.post('/api/proxy', async (req, res) => {
  try {
    const { name, email, phone, message, ref_url } = normalizeBody(req);

    // TEMP debug—remove once verified
    console.log('Incoming keys:', Object.keys(req.body));
    console.log('Sample field[0]:', Array.isArray(req.body.fields) ? req.body.fields[0] : undefined);
    console.log('Meta:', req.body.meta);
    console.log('Normalized:', { name, email, phone, message, ref_url });

    const sid = Date.now().toString();
    const host = extractHost({ refUrl: ref_url, headers: req.headers });
    const lead_source = SOURCE_MAP[host] || '30018';

    const url = new URL('https://www.rainmakerqueen.com/hooks/catch/');
    url.searchParams.append('uid', 'fxSOVhSeeRs9');          // REQUIRED by Rainmaker
    url.searchParams.append('sid', sid);                     // REQUIRED
    url.searchParams.append('lead_source', lead_source);     // REQUIRED (30018/12108)
    url.searchParams.append('name', name || '');             // REQUIRED
    url.searchParams.append('phone', phone || '');           // REQUIRED
    url.searchParams.append('email', email || '');           // REQUIRED
    url.searchParams.append('topic', '');                    // OPTIONAL here
    url.searchParams.append('desc', message || '');          // REQUIRED
    url.searchParams.append('ref_url', ref_url || '');       // REQUIRED

    const response = await axios.get(url.toString(), { timeout: 15000 });
    console.log(`✅ Rainmaker ${response.status} host=${host} lead_source=${lead_source}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ Proxy error:', err?.response?.data || err.message);
    res.status(500).json({ ok: false, error: 'Proxy error' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
