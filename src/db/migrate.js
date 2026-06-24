import { pool } from './pool.js';

// Full schema. Safe to run repeatedly (IF NOT EXISTS everywhere).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Device pairing for the TV QR flow (built next).
CREATE TABLE IF NOT EXISTS pairings (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id   BIGINT NOT NULL,
  media_type TEXT NOT NULL,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, media_id, media_type)
);

CREATE TABLE IF NOT EXISTS continue_watching (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id     BIGINT NOT NULL,
  media_type   TEXT NOT NULL,
  position_sec INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  title        TEXT,
  poster_path  TEXT,
  backdrop_path TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, media_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cw_user_updated ON continue_watching(user_id, updated_at DESC);

-- Per-account profile settings (avatar id + hashed PIN), synced across devices.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
`;

export async function migrate() {
  await pool.query(SCHEMA);
  console.log('✓ Migration complete');
}

// Allow `npm run migrate` to run this directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Migration failed:', e);
      process.exit(1);
    });
}
