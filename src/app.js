import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import apiRoutes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

const supabaseOrigin = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).origin : null;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Скрипты — только собственные файлы (никаких inline-скриптов): снижает риск XSS
          'script-src': ["'self'"],
          'style-src': ["'self'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'blob:', ...(supabaseOrigin ? [supabaseOrigin] : [])],
          'connect-src': ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    '/api',
    cors({
      origin(origin, cb) {
        // Запросы без Origin (curl, Postman, тот же origin) разрешены; остальные — по списку CORS_ORIGIN.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRoutes);
  app.use('/api', notFound);

  // Frontend SYNQ: статические страницы, работающие с этим же API.
  app.use(express.static(FRONTEND_DIR, { extensions: ['html'], index: 'index.html', maxAge: env.isProduction ? '1h' : 0 }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html')) return next();
    res.status(404).sendFile(path.join(FRONTEND_DIR, '404.html'));
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
