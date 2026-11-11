// Точка входа для Vercel: Express-приложение SYNQ как serverless-функция.
// Обрабатывает и REST API (/api/*), и страницы frontend (см. vercel.json).
import { createApp } from '../src/app.js';

export default createApp();
