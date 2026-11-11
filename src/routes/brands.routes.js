import { Router } from 'express';
import * as brands from '../controllers/brands.controller.js';

const router = Router();

// Публичный список брендов (разработчиков) с количеством товаров
router.get('/', brands.list);

export default router;
