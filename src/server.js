import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import { migrate } from './db/migrate.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check (Railway pings this).
app.get('/', (_req, res) => res.json({ ok: true, service: 'velix-backend' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);

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
