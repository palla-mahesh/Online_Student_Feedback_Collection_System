import 'dotenv/config';
import express from 'express';
import { initSchema, seedDatabase } from '../src/server/db.ts';
import { apiRouter } from '../src/server/routes.ts';

let initialized = false;

function ensureDatabaseReady(): void {
  if (!initialized) {
    initSchema();
    seedDatabase();
    initialized = true;
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const allowedOrigin = process.env.FRONTEND_ORIGIN;
  const reqOrigin = req.headers.origin;
  if (allowedOrigin && reqOrigin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  ensureDatabaseReady();
  next();
});

app.use('/api', apiRouter);

export default app;
