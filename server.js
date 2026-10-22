const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'submissions.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'degistir123'; // .env ile değiştir!

app.set('trust proxy', true); // reverse proxy (nginx, Render, Railway vs.) arkasındaysa gerçek IP için gerekli

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.dirname(DATA_FILE);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function readSubmissions() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function writeSubmissions(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress;
}

// --- Basic Auth: sadece /admin ve admin API'si için ---
function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin Paneli"');
  return res.status(401).send('Yetkisiz erişim.');
}

// Kullanıcı formu kaydı: isim + rıza verilen tarayıcı bilgileri + konum (opsiyonel) + gerçek IP (sunucudan)
app.post('/api/submit', (req, res) => {
  const { name, consent, brand, userAgent, platform, language, screen, timezone, lat, lon, locationStatus } = req.body || {};

  if (!consent) return res.status(400).json({ error: 'Rıza verilmedi.' });
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'İsim gerekli.' });

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: cleanName,
    ip: getClientIp(req),
    brand: brand || 'Bilinmiyor',
    userAgent: userAgent || req.headers['user-agent'] || '',
    platform: platform || '',
    language: language || '',
    screen: screen || '',
    timezone: timezone || '',
    lat: typeof lat === 'number' ? lat : null,
    lon: typeof lon === 'number' ? lon : null,
    locationStatus: locationStatus || 'istenmedi',
    submittedAt: new Date().toISOString(),
  };

  const list = readSubmissions();
  list.push(record);
  writeSubmissions(list);

  res.json({ ok: true });
});

// Admin: kayıtları listele
app.get('/api/submissions', requireAdminAuth, (req, res) => {
  const list = readSubmissions().slice().reverse();
  res.json(list);
});

// Admin: tek kayıt sil (opsiyonel kullanım)
app.delete('/api/submissions/:id', requireAdminAuth, (req, res) => {
  const list = readSubmissions().filter(r => r.id !== req.params.id);
  writeSubmissions(list);
  res.json({ ok: true });
});

// Admin sayfası (ayrı route, ayrı dosya, basic auth korumalı)
app.get('/admin', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
  console.log(`Admin paneli:    http://localhost:${PORT}/admin  (user: ${ADMIN_USER})`);
});
