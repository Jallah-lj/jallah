/**
 * Express API — deployed as a Vercel serverless function (api/index.ts) and
 * for local development via server/src/index.ts.
 *
 * Backends:
 *   • Data    → Supabase Postgres (document store, see server/src/store.ts)
 *   • Auth    → Supabase Auth (email/password). Falls back to ADMIN_EMAIL /
 *               ADMIN_PASSWORD env vars when Supabase keys are absent (dev).
 *   • Media   → Supabase Storage (public bucket). Falls back to a local
 *               uploads/ directory when Supabase keys are absent (dev only —
 *               Vercel's filesystem is ephemeral, so production requires
 *               Supabase Storage).
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { db, resources, type Resource } from './store.ts';

export const app = express();
const SECRET = process.env.JWT_SECRET || 'local-development-secret-change-me';

/* ---------------------------- Supabase ---------------------------- */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);
const authMode: 'supabase' | 'local' = supabaseConfigured ? 'supabase' : 'local';
const storageMode: 'supabase' | 'local' = supabaseConfigured && process.env.STORAGE_DRIVER !== 'local' ? 'supabase' : 'local';
const BUCKET = process.env.MEDIA_BUCKET || 'media';
// The anon client performs password sign-ins; the service-role client performs
// admin actions (user updates, sign-out, storage). The service key is only
// ever used server-side and must never be exposed to the browser.
const supabaseAnon = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const supabaseAdmin = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const publicUrl = (key: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady || !supabaseAdmin) return;
  const { error } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (error) await supabaseAdmin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  bucketReady = true;
}

/* ----------------------------- CORS ------------------------------- */
// CLIENT_URL (comma-separated) plus localhost and this project's *.vercel.app
// deploys. In production the API is same-origin with the frontend (served
// under /api on the Vercel deployment), so CORS mostly matters for local dev.
const allowedOrigins = [...(process.env.CLIENT_URL || 'http://localhost:5173').split(','), 'https://my-portfolio-liart-theta-21.vercel.app'].map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
const originAllowed = (origin: string) => {
  const o = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(o)) return true;
  try { const h = new URL(o).hostname; return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app'); } catch { return false; }
};
// Never throw from the origin callback: an error there aborts the response
// before CORS headers are written. Log and deny instead.
const corsOptions: cors.CorsOptions = { origin(origin, callback) { if (origin && !originAllowed(origin)) console.warn(`CORS blocked origin: ${origin}`); callback(null, !origin || originAllowed(origin)); }, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'], optionsSuccessStatus: 204 };
const cookieOptions: any = { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 864e5, path: '/' };

/* --------------------------- Middleware --------------------------- */
app.set('trust proxy', 1);
// CORS must be registered before helmet, the body parser and every /api route
// so that preflights and error responses alike carry CORS headers.
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
if (storageMode === 'local') app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));
const auth = (req: any, res: any, next: any) => { try { req.user = jwt.verify(req.cookies.session, SECRET); next(); } catch { return res.status(401).json({ ok: false, error: 'Authentication required' }); } };
// Express 4 does not forward async errors to the error handler — wrap them.
type Handler = (req: any, res: any, next?: any) => Promise<any>;
const wrap = (fn: Handler) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------------------ Auth ------------------------------ */
const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

app.post('/api/auth/login', loginLimit, wrap(async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Enter a valid email and password' });
  const { email, password } = parsed.data;
  const user = await db.getUser();
  let name = user.name, role = user.role || 'ADMIN', sub: string = user.id;
  if (authMode === 'supabase') {
    const { data, error } = await supabaseAnon!.auth.signInWithPassword({ email, password });
    if (error || !data.user) return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    sub = data.user.id;
    name = (data.user.user_metadata as any)?.name || user.name;
    await db.saveUser({ ...user, id: sub, email: data.user.email || email, name, role, authProvider: 'supabase' });
  } else {
    // Local dev fallback — credentials come from the environment.
    if (email.toLowerCase() !== String(user.email).toLowerCase() || password !== (process.env.ADMIN_PASSWORD || 'ChangeMe123!')) return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub, email, role }, SECRET, { expiresIn: '7d' });
  res.cookie('session', token, cookieOptions).json({ ok: true, data: { name, email } });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  try { const claims: any = jwt.verify(req.cookies.session, SECRET); if (supabaseAdmin && claims?.sub) await supabaseAdmin.auth.admin.signOut(claims.sub).catch(() => {}); } catch { /* not signed in — still clear the cookie */ }
  res.clearCookie('session', { path: '/', sameSite: cookieOptions.sameSite, secure: cookieOptions.secure }).json({ ok: true });
}));

app.get('/api/auth/me', auth, wrap(async (_req: any, res) => {
  const u = await db.getUser();
  res.json({ ok: true, data: { email: u.email, role: u.role || 'ADMIN', name: u.name } });
}));

app.put('/api/account', auth, wrap(async (req: any, res) => {
  const schema = z.object({ name: z.string().min(2).max(80), email: z.string().email(), currentPassword: z.string().min(8), newPassword: z.string().min(10).max(128).optional().or(z.literal('')) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Please check the account fields' });
  const { name, email, currentPassword, newPassword } = parsed.data;
  const user = await db.getUser();
  if (authMode === 'supabase') {
    // Re-verify the current password, then update via the admin API.
    const { error: pwError } = await supabaseAnon!.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (pwError) return res.status(403).json({ ok: false, error: 'Current password is incorrect' });
    const { error } = await supabaseAdmin!.auth.admin.updateUserById(req.user.sub, {
      email,
      ...(newPassword ? { password: newPassword } : {}),
      user_metadata: { name },
    });
    if (error) return res.status(400).json({ ok: false, error: error.message });
  } else {
    if (currentPassword !== (process.env.ADMIN_PASSWORD || 'ChangeMe123!')) return res.status(403).json({ ok: false, error: 'Current password is incorrect' });
    if (newPassword) return res.status(400).json({ ok: false, error: 'Password changes require Supabase Auth (run the Supabase setup in DEPLOYMENT.md)' });
  }
  await db.saveUser({ ...user, name: name.trim(), email: email.toLowerCase() });
  const token = jwt.sign({ sub: req.user.sub, email: email.toLowerCase(), role: req.user.role || 'ADMIN' }, SECRET, { expiresIn: '7d' });
  res.cookie('session', token, cookieOptions).json({ ok: true, data: { name: name.trim(), email: email.toLowerCase(), role: req.user.role || 'ADMIN' } });
}));

/* ---------------------------- Content ----------------------------- */
app.get('/api/health', wrap(async (_req, res) => {
  let database = 'unavailable';
  try { const { prisma } = await import('./store.ts'); await prisma().$queryRaw`SELECT 1`; database = 'ok'; } catch { /* reported below */ }
  res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString(), auth: authMode, storage: storageMode, database });
}));
app.get('/api/public', wrap(async (_req, res) => res.json({ ok: true, data: await db.public() })));
app.get('/api/dashboard', auth, wrap(async (_req, res) => res.json({ ok: true, data: await db.dashboard() })));
app.get('/api/profile', auth, wrap(async (_req, res) => res.json({ ok: true, data: (await db.all()).profile })));
app.put('/api/profile', auth, wrap(async (req, res) => res.json({ ok: true, data: await db.updateSingleton('profile', req.body) })));
app.get('/api/settings', auth, wrap(async (_req, res) => res.json({ ok: true, data: (await db.all()).settings })));
app.put('/api/settings', auth, wrap(async (req, res) => res.json({ ok: true, data: await db.updateSingleton('settings', req.body) })));
app.get('/api/navigation', auth, wrap(async (_req, res) => res.json({ ok: true, data: (await db.all()).navigation })));
app.put('/api/navigation', auth, wrap(async (req, res) => { if (!Array.isArray(req.body)) return res.status(400).json({ ok: false, error: 'Navigation must be an array' }); res.json({ ok: true, data: await db.setNavigation(req.body) }); }));

for (const r of resources) {
  app.get(`/api/${r}`, auth, wrap(async (req, res) => {
    let rows = await db.list(r as Resource);
    const q = String(req.query.q || '').toLowerCase();
    if (q) rows = rows.filter((x: any) => JSON.stringify(x).toLowerCase().includes(q));
    res.json({ ok: true, data: rows });
  }));
  app.post(`/api/${r}`, auth, wrap(async (req, res) => res.status(201).json({ ok: true, data: await db.create(r as Resource, req.body) })));
  app.put(`/api/${r}/:id`, auth, wrap(async (req, res) => { const x = await db.update(r as Resource, req.params.id, req.body); x ? res.json({ ok: true, data: x }) : res.status(404).json({ ok: false, error: 'Not found' }); }));
  app.delete(`/api/${r}/:id`, auth, wrap(async (req, res) => {
    const item = await db.remove(r as Resource, req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: 'Not found' });
    // Media rows also own a Supabase Storage object — remove it (best-effort).
    if (r === 'media' && storageMode === 'supabase' && item.fileName) await supabaseAdmin!.storage.from(BUCKET).remove([item.fileName]).catch(() => {});
    res.json({ ok: true });
  }));
  app.post(`/api/${r}/reorder`, auth, wrap(async (req, res) => res.json({ ok: true, data: await db.reorder(r as Resource, req.body.ids || []) })));
}

const contactLimit = rateLimit({ windowMs: 60 * 60_000, limit: 5 });
app.post('/api/contact', contactLimit, wrap(async (req, res) => {
  const schema = z.object({ name: z.string().min(2).max(80), email: z.string().email(), subject: z.string().min(2).max(120), message: z.string().min(10).max(3000), website: z.string().max(0).optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ ok: false, error: 'Please check all fields' });
  await db.create('messages', { ...p.data, read: false });
  res.status(201).json({ ok: true, message: 'Message received' });
}));

/* ----------------------------- Uploads ---------------------------- */
// 4.5 MB keeps uploads inside Vercel's serverless request-body limit.
const upload = multer({
  storage: storageMode === 'supabase' ? multer.memoryStorage() : multer.diskStorage({ destination: (_r, f, cb) => { fs.mkdirSync(uploadDir, { recursive: true }); cb(null, uploadDir); }, filename: (_r, f, cb) => cb(null, randomUUID() + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 4.5 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => cb(null, /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(f.mimetype)),
});
app.post('/api/upload', auth, upload.single('file'), wrap(async (req: any, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Valid image or PDF required' });
  if (storageMode === 'supabase') {
    await ensureBucket();
    const key = `uploads/${randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`;
    const { error } = await supabaseAdmin!.storage.from(BUCKET).upload(key, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (error) { console.error('Supabase Storage upload failed:', error.message); return res.status(502).json({ ok: false, error: 'File storage is unavailable — try again shortly' }); }
    const item = await db.create('media', { name: req.file.originalname, fileName: key, type: req.file.mimetype, size: req.file.size, url: publicUrl(key) });
    res.status(201).json({ ok: true, data: item });
  } else {
    const item = await db.create('media', { name: req.file.originalname, fileName: req.file.filename, type: req.file.mimetype, size: req.file.size, url: '/uploads/' + req.file.filename });
    res.status(201).json({ ok: true, data: item });
  }
}));

/* ------------------------- Error handling ------------------------- */
// Unmatched API routes must still answer as JSON through the CORS layer,
// otherwise a typo'd path surfaces in the browser as a bare CORS failure.
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: `No API route for ${req.method} /api${req.path}` }));
app.use((err: any, _req: any, res: any, _next: any) => { console.error(err.message); res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds 4.5 MB' : 'Something went wrong' }); });

// Optional single-process production mode (`SERVE_CLIENT=true npm start`).
if (process.env.NODE_ENV === 'production' && process.env.SERVE_CLIENT === 'true' && fs.existsSync(path.resolve('dist/index.html'))) {
  app.use(express.static(path.resolve('dist')));
  app.get('/*splat', (_r, res) => res.sendFile(path.resolve('dist/index.html')));
}

export default app;
