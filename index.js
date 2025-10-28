// index.js
import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Domain allowlist & source mapping --------------------------------------

const ALLOWED_ORIGINS = [
  'https://heritage-based-european-citizenship.lawoffice.org.il',
  'https://german-austrian-citizenship.lawoffice.org.il',
  'https://german-austiran-citizenship.lawoffice.org.il' // live spelling on your site
];

const SOURCE_MAP = {
  'heritage-based-european-citizenship.lawoffice.org.il': '30018',
  'german-austrian-citizenship.lawoffice.org.il': '12108',
  'german-austiran-citizenship.lawoffice.org.il': '12108'
};

// --- Middleware --------------------------------------------------------------

app.use(cors({
  origin: (origin, cb) =>
    (!origin || ALLOWED_ORIGINS.includes(origin)) ? cb(null, true) : cb(new Error('Not allowed by CORS'))
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Helpers ----------------------------------------------------------------

/** Coerce Elementor meta field (string or {title,value}) to a string URL */
function metaToString(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && typeof v.value === 'string') return v.value;
  return '';
}

/** Best available ref URL (string) from body/meta/headers */
function bestRefUrl(req, body) {
  const fromMeta = metaToString(body?.meta?.referer) || metaToString(body?.meta?.page_url);
  if (fromMeta) return fromMeta;
  const fromBody = body?.ref_url || body?.referer || body?.page_url || body?.pageUrl || '';
  if (fromBody) return String(fromBody);
  return req.headers.referer || req.headers.referrer || '';
}

/** Robust host extractor from string URL or headers */
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

/** Universal value getter for Elementor field nodes */
function fieldValue(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  return node.value ?? node.raw_value ?? node.values ?? node.val ?? '';
}

/** Normalize any field object's "name" */
function fieldNameCandidate(node, explicitKey) {
  const cand =
    explicitKey ??
    node?.id ??
    node?.key ??
    node?.shortcode ??
    node?.field_id ??
    node?.title ??
    node?.label ??
    '';
  return String(cand).trim().toLowerCase();
}

/** EXACT key pick (works for array or object "fields") */
function pick(fields, key) {
  if (!fields) return '';
  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (fieldNameCandidate(f) === key) return fieldValue(f) || '';
    }
    return '';
  }
  if (typeof fields === 'object') {
    const entry = fields[key];
    if (entry === undefined) return '';
    return fieldValue(entry) || '';
  }
  return '';
}

/** Regex pick over id/key/title/label */
function pickByRegex(fields, regexp) {
  if (!fields) return '';
  if (Array.isArray(fields)) {
    for (const f of fields) {
      const name = fieldNameCandidate(f);
      if (regexp.test(name)) return fieldValue(f) || '';
      const label = fieldNameCandidate(f?.label ? { label: f.label } : {});
      if (regexp.test(label)) return fieldValue(f) || '';
    }
    return '';
  }
  if (typeof fields === 'object') {
    for (const [k, v] of Object.entries(fields)) {
      const name = fieldNameCandidate(v, k);
      if (regexp.test(name)) return fieldValue(v) || '';
      const label = fieldNameCandidate(v?.label ? { label: v.label } : {});
      if (regexp.test(label)) return fieldValue(v) || '';
    }
    return '';
  }
  return '';
}

/** Prefer the first textarea-like field with a non-empty value */
function pickTextareaFirst(fields) {
  if (!fields) return '';
  const looksTextarea = (node) => {
    const t = String(node?.type || '').toLowerCase();
    return t.includes('textarea') || t.includes('paragraph') || t.includes('multiline');
  };

  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (looksTextarea(f)) {
        const v = fieldValue(f);
        if (v) return v;
      }
    }
    return '';
  }

  if (typeof fields === 'object') {
    for (const v of Object.values(fields)) {
      if (looksTextarea(v)) {
        const val = fieldValue(v);
        if (val) return val;
      }
    }
    // fallback: keys that look like textarea labels
    for (const [k, v] of Object.entries(fields)) {
      const name = fieldNameCandidate(v, k);
      if (/message|msg|comments?|desc(ription)?|textarea|הודעה|מסר/i.test(name)) {
        const val = fieldValue(v);
        if (val) return val;
      }
    }
    return '';
  }

  return '';
}

/** Build phone from possible country_code + phone combos */
function combinePhone(body, fields) {
  const cc =
    body.country_code || body['country code'] ||
    (fields && (pick(fields, 'country_code') || pick(fields, 'country code'))) || '';
  const phoneRaw =
    body.phone ||
    (fields && pick(fields, 'phone')) ||
    '';
  return [cc, phoneRaw].map(s => (s || '').trim()).filter(Boolean).join(' ');
}

/** Extract message text (desc/message/description, aliases, prefer textarea) */
function extractMessage(body) {
  // Simple direct cases first
  if (body.desc) return String(body.desc);
  if (body.message) return String(body.message);
  if (body.description) return String(body.description);
  if (body['desc']) return String(body['desc']);
  if (body['message']) return String(body['message']);
  if (body['description']) return String(body['description']);

  // Elementor fields (array or object)
  if (body.fields) {
    const textAreaVal = pickTextareaFirst(body.fields);
    if (textAreaVal) return String(textAreaVal);

    const alias =
      pick(body.fields, 'desc') ||
      pick(body.fields, 'message') ||
      pick(body.fields, 'description') ||
      pickByRegex(body.fields, /(message|msg|comments?|desc(ription)?|textarea|הודעה|מסר)/i) ||
      '';
    if (alias) return String(alias);
  }

  // Elementor form_fields map
  if (body.form_fields && typeof body.form_fields === 'object') {
    const f = body.form_fields;
    const m =
      f.desc ||
      f.message ||
      f.description ||
      f.msg ||
      f.comments ||
      f.comment ||
      '';
    if (m) return String(m);
  }

  // Elementor "form" edge case
  if (body.form && typeof body.form === 'object') {
    const f = body.form;
    const m = f.desc || f.message || f.description || '';
    if (m) return String(m);
  }

  return '';
}

/** Normalize payload into {name,email,phone,message,ref_url} */
function normalizeBody(req) {
  const b = req.body || {};
  const ref_url = bestRefUrl(req, b);

  // Our JSON
  if (b.name || b.email || b.phone || b.message || b.desc || b.description) {
    return {
      name: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      message: extractMessage(b),
      ref_url
    };
  }

  // Elementor flat form-encoded
  if (b['name'] || b['email'] || b['phone'] || b['message'] || b['desc'] || b['description'] || b['country_code'] || b['country code']) {
    return {
      name: b['name'] || '',
      email: b['email'] || '',
      phone: combinePhone(b),
      message: extractMessage(b),
      ref_url
    };
  }

  // Elementor fields/form_fields/form
  if (b.fields || b.form_fields || b.form) {
    return {
      name:
        pick(b.fields, 'name') ||
        (b.form_fields && b.form_fields.name) ||
        (b.form && b.form.name) ||
        '',
      email:
        pick(b.fields, 'email') ||
        (b.form_fields && b.form_fields.email) ||
        (b.form && b.form.email) ||
        '',
      phone: combinePhone(b, b.fields),
      message: extractMessage(b),
      ref_url
    };
  }

  return { name: '', email: '', phone: '', message: '', ref_url };
}

// --- Routes -----------------------------------------------------------------

app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) => res.send('healthy'));

app.post('/api/proxy', async (req, res) => {
  try {
    const { name, email, phone, message, ref_url } = normalizeBody(req);

    // Debug while testing — remove once verified
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
    url.searchParams.append('topic', '');               // none on this form
    url.searchParams.append('desc', message || '');     // <-- send textarea as desc
    url.searchParams.append('ref_url', ref_url || '');

    const response = await axios.get(url.toString(), { timeout: 15000 });
    console.log(`✅ Rainmaker ${response.status} host=${host} lead_source=${lead_source}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ Proxy error:', err?.response?.data || err.message);
    res.status(500).json({ ok: false, error: 'Proxy error' });
  }
});

// --- Start ------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
