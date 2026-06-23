import express from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// All sync routes require a logged-in user.
router.use(requireAuth);

const TYPES = new Set(['movie', 'tv']);
function validType(t) {
  return TYPES.has(String(t));
}

// ── Favorites ──────────────────────────────────────────────────────────────

// GET /favorites  -> [{media_id, media_type, added_at}, ...]
router.get('/favorites', async (req, res) => {
  const { rows } = await query(
    `SELECT media_id, media_type, added_at
       FROM favorites WHERE user_id = $1
      ORDER BY added_at DESC`,
    [req.userId]
  );
  res.json({ favorites: rows });
});

// PUT /favorites  {media_id, media_type}  -> upsert (idempotent add)
router.put('/favorites', async (req, res) => {
  const mediaId = Number(req.body.media_id);
  const mediaType = String(req.body.media_type || '');
  if (!mediaId || !validType(mediaType)) return res.status(400).json({ error: 'invalid_item' });
  await query(
    `INSERT INTO favorites (user_id, media_id, media_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, media_id, media_type) DO NOTHING`,
    [req.userId, mediaId, mediaType]
  );
  res.json({ ok: true });
});

// DELETE /favorites/:type/:id
// DELETE /favorites  → clear ALL of the user's favorites
router.delete('/favorites', async (req, res) => {
  await query('DELETE FROM favorites WHERE user_id = $1', [req.userId]);
  res.json({ ok: true });
});

router.delete('/favorites/:type/:id', async (req, res) => {
  const mediaId = Number(req.params.id);
  const mediaType = String(req.params.type);
  if (!mediaId || !validType(mediaType)) return res.status(400).json({ error: 'invalid_item' });
  await query(
    'DELETE FROM favorites WHERE user_id = $1 AND media_id = $2 AND media_type = $3',
    [req.userId, mediaId, mediaType]
  );
  res.json({ ok: true });
});

// ── Continue Watching ──────────────────────────────────────────────────────

// GET /continue  -> most-recently-updated first
router.get('/continue', async (req, res) => {
  const { rows } = await query(
    `SELECT media_id, media_type, position_sec, duration_sec,
            title, poster_path, backdrop_path, updated_at
       FROM continue_watching WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 50`,
    [req.userId]
  );
  res.json({ continue: rows });
});

// PUT /continue  {media_id, media_type, position, duration, title?, poster_path?, backdrop_path?}
// Upserts progress. If the item is essentially finished, the client can DELETE it instead.
router.put('/continue', async (req, res) => {
  const mediaId = Number(req.body.media_id);
  const mediaType = String(req.body.media_type || '');
  const position = Math.max(0, Math.floor(Number(req.body.position) || 0));
  const duration = Math.max(0, Math.floor(Number(req.body.duration) || 0));
  const title = req.body.title != null ? String(req.body.title) : null;
  const poster = req.body.poster_path != null ? String(req.body.poster_path) : null;
  const backdrop = req.body.backdrop_path != null ? String(req.body.backdrop_path) : null;
  if (!mediaId || !validType(mediaType)) return res.status(400).json({ error: 'invalid_item' });

  await query(
    `INSERT INTO continue_watching
       (user_id, media_id, media_type, position_sec, duration_sec, title, poster_path, backdrop_path, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (user_id, media_id, media_type) DO UPDATE SET
       position_sec  = EXCLUDED.position_sec,
       duration_sec  = EXCLUDED.duration_sec,
       title         = COALESCE(EXCLUDED.title, continue_watching.title),
       poster_path   = COALESCE(EXCLUDED.poster_path, continue_watching.poster_path),
       backdrop_path = COALESCE(EXCLUDED.backdrop_path, continue_watching.backdrop_path),
       updated_at    = now()`,
    [req.userId, mediaId, mediaType, position, duration, title, poster, backdrop]
  );
  res.json({ ok: true });
});

// DELETE /continue/:type/:id  (e.g. finished, or removed from the row)
// DELETE /continue  → clear ALL of the user's continue watching
router.delete('/continue', async (req, res) => {
  await query('DELETE FROM continue_watching WHERE user_id = $1', [req.userId]);
  res.json({ ok: true });
});

router.delete('/continue/:type/:id', async (req, res) => {
  const mediaId = Number(req.params.id);
  const mediaType = String(req.params.type);
  if (!mediaId || !validType(mediaType)) return res.status(400).json({ error: 'invalid_item' });
  await query(
    'DELETE FROM continue_watching WHERE user_id = $1 AND media_id = $2 AND media_type = $3',
    [req.userId, mediaId, mediaType]
  );
  res.json({ ok: true });
});

export default router;
