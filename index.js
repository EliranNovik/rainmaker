import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  'https://heritage-based-european-citizenship.lawoffice.org.il',
  // include both spellings just in case
  'https://german-austrian-citizenship.lawoffice.org.il',
  'https://german-austiran-citizenship.lawoffice.org.il'
];

app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED_ORIGINS.includes(origin)) ? cb(null, true) : cb(new Error('Not allowed by CORS'))
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SOURCE_MAP = {
  'heritage-based-european-citizenship.lawoffice.org.il': '30018',
  // include both spellings; your live site shows "austiran" in meta
  'german-austrian-citizenship.lawoffice.org.il': '12108',
  'german-austiran-citizenship.lawoffice.org.il': '12108'
};

// --- helpers ----------------------------------------------------

/** Coerce Elementor meta field (string or {title,value}) to a string URL */
function metaToString(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && typeof v.value === 'string') return v.value;
  return '';
}

/** Get best available ref URL as a string */
function bestRefUrl(req, body) {
  // Elementor meta
  const fromMeta = metaToString(body?.meta?.referer) || metaToString(body?.meta?.page_url);
  if (fromMeta) return fromMeta;

  // Body fallbacks (flat posts)
  const fromBody =
    body?.ref_url ||
    body?.referer ||
    body?.page_url ||
    body?.pageUrl ||
    '';

  if (fromBody) return String(fromBody);

  // Headers fallback
  return req.headers.referer || req.headers.referrer || '';
}

/** Robust host extractor from a string URL or header values */
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

/** Read fields no matter how Elementor formats them */
function fieldValue(f) {
  return f?.value ?? f?.raw_value ?? f?.values ?? (typeof f === 'string' ? f : '');
}
function pick(fields, key) {
  if (!fields) return '';
  // Array of objects
  if (Array.isArray(fields)) {
    for (const f of fields) {
      const fid = String(f?.id ?? f?.key ?? f?.title ?? f?.shortcode ?? f?.field_id ?? '').trim().toLowerCase();
      if (fid === key) return fieldValue(f) || '';
    }
    return '';
  }
  // Object map
  if (typeof fields === 'object') {
    const entry = fields[key];
    if (!entry) return '';
    if (typeof entry === 'object') return fieldValue(entry) || '';
    return String(entry || '');
  }
  return '';
}

/** Normalize payload into {name,email,phone,message,ref_url} */
function normalizeBody(req) {
  const b = req.body || {};
  const ref_url = bestRefUrl(req, b);

  // Our JSON
  if (b.name || b.email || b.phone || b.message) {
    return {
      name: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      message: b.message || '',
      ref_url
    };
  }

  // Elementor flat
  if (b['name'] || b['email'] || b['phone'] || b['message'] || b['country_code'] || b['country code']) {
    const phone = [b['country_code'] || b['country code'] || '', b['phone'] || '']
      .map(s => (s || '').trim()).filter(Boolean).join(' ');
    return {
      name: b['name'] || '',
      email: b['email'] || '',
      phone,
      message: b['message'] || '',
      ref_url
    };
  }

  // Elementor fields (array or object)
  if (b.fields) {
    const name = pick(b.fields, 'name');
    const email = pick(b.fields, 'email');
    const cc = pick(b.fields, 'country_code') || pick(b.fields, 'country code');
    const phoneRaw = pick(b.fields, 'phone');
    const message = pick(b.fields, 'message');

    const phone = [cc, phoneRaw].map(s => (s || '').trim()).filter(Boolean).join(' ');

    return {
      name: String(name || ''),
      email: String(email || ''),
      phone: String(phone || ''),
      message: String(message || ''),
      ref_url
    };
  }

  // Elementor form_fields object
  if (b.form_fields && typeof b.form_fields === 'object') {
    const f = b.form_fields;
    const phone = [f.country_code || f['country code'] || '', f.phone || '']
      .map(s => (s || '').trim()).filter(Boolean).join(' ');
    return {
      name: f.name || '',
      email: f.email || '',
      phone,
      message: f.message || '',
      ref_url
    };
  }

  return { name: '', email: '', phone: '', message: '', ref_url };
}

// --- routes -----------------------------------------------------

app.get('/health', (_req, res) => res.send('healthy'));

app.post('/api/proxy', async (req, res) => {
  try {
    const { name, email, phone, message, ref_url } = normalizeBody(req);

    // Debug (keep while testing)
    console.log('Incoming keys:', Object.keys(req.body));
    console.log('Meta.safeRefUrl:', bestRefUrl(req, req.body));
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
    url.searchParams.append('topic', '');
    url.searchParams.append('desc', message || '');
    url.searchParams.append('ref_url', ref_url || '');

    const response = await axios.get(url.toString(), { timeout: 15000 });
    console.log(`✅ Rainmaker ${response.status} host=${host} lead_source=${lead_source}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ Proxy error:', err?.response?.data || err.message);
    res.status(500).json({ ok: false, error: 'Proxy error' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
