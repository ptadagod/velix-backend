import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import pairRoutes from './routes/pair.js';
import syncRoutes from './routes/sync.js';
import { migrate } from './db/migrate.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Health check (Railway pings this).
app.get('/', (_req, res) => res.json({ ok: true, service: 'velix-backend' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// Phone signup page: serve /pair?code=... BEFORE the /pair API router,
// otherwise the router swallows this request.
app.get('/pair', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pair.html'));
});

app.use('/auth', authRoutes);
app.use('/pair', pairRoutes);
app.use('/', syncRoutes);

const PORT = process.env.PORT || 8080;

// Run migrations on boot, then start listening.
migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`Velix backend listening on ${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to start (migration error):', e);
    process.exit(1);
  });
