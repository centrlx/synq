import path from 'node:path';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 МБ
export const FILE_MAX_BYTES = 50 * 1024 * 1024; // 50 МБ — лимит Supabase Storage на бесплатном тарифе

export const IMAGE_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// Форматы дистрибутивов и контента для музыкального производства.
export const PRODUCT_FILE_EXTENSIONS = [
  '.zip', '.rar', '.7z', '.dmg', '.pkg', '.exe', '.msi',
  '.wav', '.aif', '.aiff', '.flac', '.mid', '.midi',
  '.fxp', '.fxb', '.vital', '.nmsv', '.als', '.flp', '.logicx',
  '.txt', // лицензионные ключи и инструкции по активации
];

function imageFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!IMAGE_TYPES[ext] || IMAGE_TYPES[ext] !== file.mimetype) {
    return cb(AppError.badRequest('Допустимы только изображения JPG, PNG или WEBP', 'INVALID_FILE_TYPE'));
  }
  cb(null, true);
}

function productFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!PRODUCT_FILE_EXTENSIONS.includes(ext)) {
    return cb(AppError.badRequest(`Недопустимое расширение файла. Разрешены: ${PRODUCT_FILE_EXTENSIONS.join(', ')}`, 'INVALID_FILE_TYPE'));
  }
  // Из текстовых форматов допустим только обычный текст (.txt); HTML и скрипты запрещены
  const isPlainText = ext === '.txt' && file.mimetype === 'text/plain';
  if (file.mimetype.startsWith('text/') && !isPlainText) {
    return cb(AppError.badRequest('Недопустимый тип файла', 'INVALID_FILE_TYPE'));
  }
  cb(null, true);
}

// Файлы держим в памяти и сразу передаём в Supabase Storage — на диск сервера ничего не пишется.
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES, files: 1, fields: 5 },
  fileFilter: imageFilter,
}).single('file');

export const uploadProductFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_MAX_BYTES, files: 1, fields: 5 },
  fileFilter: productFileFilter,
}).single('file');

/** Проверка сигнатуры (magic bytes): расширение и MIME можно подделать, содержимое — нет. */
export function assertImageSignature(buffer) {
  const hex = buffer.subarray(0, 12).toString('hex');
  const isJpeg = hex.startsWith('ffd8ff');
  const isPng = hex.startsWith('89504e470d0a1a0a');
  const isWebp = hex.startsWith('52494646') && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) {
    throw AppError.badRequest('Содержимое файла не является изображением JPG/PNG/WEBP', 'INVALID_FILE_CONTENT');
  }
}

export function requireFile(req, _res, next) {
  if (!req.file) return next(AppError.badRequest('Файл не передан: используйте multipart/form-data с полем «file»', 'FILE_REQUIRED'));
  next();
}
