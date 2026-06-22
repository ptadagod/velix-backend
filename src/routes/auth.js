import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import {
  hashPassword,
  verifyPassword,
  issueToken,
} from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// Throttle auth attempts to slow brute-force / abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// POST /auth/register  {email, username, password}
router.post('/register', authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const deviceName = String(req.body.device_name || '').trim() || null;

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (username.length < 2) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 8) return res.status(400).json({ error: 'weak_password' });

  try {
    const hash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, created_at`,
      [email, username, hash]
    );
    const user = rows[0];
    const { token, expiresAt } = issueToken(user.id);
    await query(
      `INSERT INTO sessions (token, user_id, device_name, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [token, user.id, deviceName, expiresAt]
    );
    return res.status(201).json({ token, user });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email_taken' });
    console.error('register error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// POST /auth/login  {email, password}
router.post('/login', authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const deviceName = String(req.body.device_name || '').trim() || null;

  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });

  try {
    const { rows } = await query(
      'SELECT id, email, username, password_hash, created_at FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    // Always run a compare to avoid leaking whether the email exists (timing).
    const ok = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinv');
    if (!user || !ok) return res.status(401).json({ error: 'bad_credentials' });

    const { token, expiresAt } = issueToken(user.id);
    await query(
      `INSERT INTO sessions (token, user_id, device_name, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [token, user.id, deviceName, expiresAt]
    );
    delete user.password_hash;
    return res.json({ token, user });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// POST /auth/logout   (Bearer)
router.post('/logout', requireAuth, async (req, res) => {
  await query('DELETE FROM sessions WHERE token = $1', [req.token]);
  return res.json({ ok: true });
});

// GET /auth/me   (Bearer)
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT id, email, username, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
  return res.json({ user: rows[0] });
});

export default router;
