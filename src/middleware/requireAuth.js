import { verifyToken } from '../auth.js';
import { query } from '../db/pool.js';

// Validates the Bearer token AND checks it still exists in `sessions`
// (so logout / revocation works). Attaches req.userId.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid_token' });

  const { rows } = await query(
    'SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()',
    [token]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'session_expired' });

  req.userId = rows[0].user_id;
  req.token = token;
  next();
}
