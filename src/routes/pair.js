import express from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { issueToken } from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

const PAIR_TTL_MIN = 5;
// Unambiguous alphabet (no 0/O/1/I) for an easy-to-read code.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(len = 6) {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// POST /pair/start  -> {pairing_id, code, pair_url, expires_in}
// Called by the TV. It then shows a QR of pair_url and polls /pair/status.
router.post('/start', async (req, res) => {
  try {
    // Generate a unique code (retry on the rare collision).
    let code;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = makeCode();
      const exists = await query('SELECT 1 FROM pairings WHERE code = $1', [code]);
      if (exists.rows.length === 0) break;
    }
    const expiresAt = new Date(Date.now() + PAIR_TTL_MIN * 60_000);
    const { rows } = await query(
      `INSERT INTO pairings (code, expires_at) VALUES ($1, $2) RETURNING id`,
      [code, expiresAt]
    );
    const base = process.env.PUBLIC_BASE_URL || `https://${req.get('host')}`;
    return res.json({
      pairing_id: rows[0].id,
      code,
      pair_url: `${base}/pair?code=${code}`,
      expires_in: PAIR_TTL_MIN * 60,
    });
  } catch (e) {
    console.error('pair/start error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// GET /pair/status?id=...  -> {claimed: bool, token?, user?}
// Polled by the TV. Returns the account token once the phone has claimed it.
router.get('/status', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'missing_id' });
  try {
    const { rows } = await query(
      `SELECT p.user_id, p.token, p.expires_at,
              u.id AS uid, u.email, u.username, u.created_at
         FROM pairings p
         LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    const row = rows[0];
    if (new Date(row.expires_at) < new Date() && !row.token) {
      return res.json({ claimed: false, expired: true });
    }
    if (row.token && row.user_id) {
      // One-time hand-off: clear the token so it can't be read twice.
      await query('UPDATE pairings SET token = NULL WHERE id = $1', [id]);
      return res.json({
        claimed: true,
        token: row.token,
        user: { id: row.uid, email: row.email, username: row.username, created_at: row.created_at },
      });
    }
    return res.json({ claimed: false });
  } catch (e) {
    console.error('pair/status error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// POST /pair/claim  {code}   (Bearer — the phone is logged in)
// Called by the phone web page after the user signs up / logs in.
router.post('/claim', requireAuth, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'missing_code' });
  try {
    const { rows } = await query(
      'SELECT id, expires_at, user_id FROM pairings WHERE code = $1',
      [code]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'invalid_code' });
    const p = rows[0];
    if (p.user_id) return res.status(409).json({ error: 'already_claimed' });
    if (new Date(p.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });

    // Mint a fresh session token for the TV device and attach it to the pairing.
    const { token, expiresAt } = issueToken(req.userId);
    await query(
      `INSERT INTO sessions (token, user_id, device_name, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [token, req.userId, 'TV', expiresAt]
    );
    await query('UPDATE pairings SET user_id = $1, token = $2 WHERE id = $3', [
      req.userId,
      token,
      p.id,
    ]);
    return res.json({ ok: true });
  } catch (e) {
    console.error('pair/claim error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

export default router;
