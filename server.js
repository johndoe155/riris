/**
 * BIC Admin Server — server.js
 * 
 * Run with:
 *   node server.js
 * 
 * Serves your entire website on http://localhost:3000
 * AND handles all admin API calls at /admin-api.php
 * 
 * Requirements: Node.js 14+
 * Install once:  npm install express multer cors
 */

const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const PORT          = 3000;
const ADMIN_PASS    = 'admin123';                          // must match admin.html
const GALLERY_JSON  = path.join(__dirname, 'gallery-data.json');
const IMAGES_DIR    = path.join(__dirname, 'images');
const ALLOWED_MIME  = ['image/jpeg','image/png','image/webp','image/gif'];
const MAX_BYTES     = 8 * 1024 * 1024;  // 8 MB
// ────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve the whole site as static files ────────────────────────────────────
app.use(express.static(__dirname));

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.body?.token || req.query?.token || '';
  if (token !== ADMIN_PASS) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// ── Multer (handles file uploads) ───────────────────────────────────────────
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename:    (_req, file, cb) => {
    const base = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const ext  = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif' }[file.mimetype] || 'jpg';
    cb(null, `${base}-${Date.now()}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    ALLOWED_MIME.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Unsupported type: ${file.mimetype}`));
  }
});

// ── Routes ───────────────────────────────────────────────────────────────────

// GET gallery
app.get('/admin-api.php', requireAuth, (req, res) => {
  if (req.query.action !== 'get_gallery') {
    return res.status(400).json({ ok: false, error: 'Unknown action' });
  }
  if (!fs.existsSync(GALLERY_JSON)) {
    const demo = [
      { id:'item-001', title:'Science Fair 2024',  subtitle:'Innovation & Technology', images:['images/gallery1.jpg','images/gallery1-2.jpg','images/gallery1-3.jpg'] },
      { id:'item-002', title:'Sports Day',          subtitle:'Athletics & Teamwork',    images:['images/gallery1.jpg'] },
      { id:'item-003', title:'Cultural Festival',   subtitle:'Diversity & Arts',        images:['images/gallery1.jpg'] }
    ];
    fs.writeFileSync(GALLERY_JSON, JSON.stringify(demo, null, 2));
  }
  res.json(JSON.parse(fs.readFileSync(GALLERY_JSON, 'utf8')));
});

// POST actions
app.post('/admin-api.php', requireAuth, (req, res, next) => {
  const action = req.query.action;

  // ── save_gallery ──────────────────────────────────────────────────────────
  if (action === 'save_gallery') {
    const data = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ ok: false, error: 'Expected JSON array' });
    const clean = data.map(item => ({
      id:       String(item.id       || ('item-' + Date.now())).replace(/[^a-z0-9\-]/gi,''),
      title:    String(item.title    || ''),
      subtitle: String(item.subtitle || ''),
      images:   (item.images || []).map(String).filter(Boolean)
    }));
    try {
      fs.writeFileSync(GALLERY_JSON, JSON.stringify(clean, null, 2));
      return res.json({ ok: true, message: 'Gallery saved.' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Could not write gallery-data.json: ' + e.message });
    }
  }

  // ── delete_image ──────────────────────────────────────────────────────────
  if (action === 'delete_image') {
    const rel  = String(req.body?.path || '').replace(/^\/+/, '');
    if (!/^images\/[a-zA-Z0-9_\-\.]+$/.test(rel)) {
      return res.status(400).json({ ok: false, error: 'Invalid path.' });
    }
    const full = path.join(__dirname, rel);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return res.json({ ok: true, message: 'Deleted.' });
  }

  // ── upload_image ─────────────────────────────────────────────────────────
  if (action === 'upload_image') {
    return upload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, error: err.message });
      if (!req.file) return res.status(400).json({ ok: false, error: 'No file received.' });
      return res.json({ ok: true, path: 'images/' + req.file.filename });
    });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action: ' + action });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ✅  BIC Admin Server running');
  console.log(`  🌐  Website:  http://localhost:${PORT}`);
  console.log(`  🔐  Admin:    http://localhost:${PORT}/admin.html`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
