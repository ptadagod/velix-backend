import express from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /profile — the account's synced avatar id + hashed PIN.
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT avatar, pin_hash FROM users WHERE id = $1',
      [req.userId]
    );
    const row = rows[0] || {};
    return res.json({ avatar: row.avatar ?? null, pinHash: row.pin_hash ?? null });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

// PUT /profile  {avatar?, pinHash?} — save avatar and/or PIN. Send pinHash:null
// to clear the PIN; omit a field to leave it unchanged.
router.put('/profile', requireAuth, async (req, res) => {
  const hasAvatar = Object.prototype.hasOwnProperty.call(req.body, 'avatar');
  const hasPin = Object.prototype.hasOwnProperty.call(req.body, 'pinHash');
  if (!hasAvatar && !hasPin) return res.json({ ok: true });

  const sets = [];
  const vals = [];
  let i = 1;
  if (hasAvatar) { sets.push(`avatar = $${i++}`); vals.push(req.body.avatar ?? null); }
  if (hasPin) { sets.push(`pin_hash = $${i++}`); vals.push(req.body.pinHash ?? null); }
  vals.push(req.userId);

  try {
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

export default router;
