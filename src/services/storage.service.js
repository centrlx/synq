import crypto from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { buckets, supabase } from '../config/supabase.js';
import { assertImageSignature, IMAGE_TYPES } from '../middleware/upload.js';
import { AppError } from '../utils/AppError.js';
import { serializeProduct } from './serializers.js';

/**
 * Драйвер хранилища — тонкая обёртка над Supabase Storage.
 * Вынесен в отдельный объект, чтобы автотесты могли подставить
 * изолированный драйвер и не обращаться к реальному облаку.
 */
const supabaseDriver = {
  async upload(bucket, objectPath, buffer, contentType) {
    const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, { contentType, upsert: false });
    if (error) throw new AppError(502, 'STORAGE_ERROR', `Supabase Storage: ${error.message}`);
  },
  async remove(bucket, paths) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw new AppError(502, 'STORAGE_ERROR', `Supabase Storage: ${error.message}`);
  },
  publicUrl(bucket, objectPath) {
    return supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
  },
  async signedUrl(bucket, objectPath, ttl, downloadName) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, ttl, { download: downloadName });
    if (error) throw new AppError(502, 'STORAGE_ERROR', `Supabase Storage: ${error.message}`);
    return data.signedUrl;
  },
};

let driver = env.storageConfigured ? supabaseDriver : null;

/** Только для автотестов. */
export function setStorageDriver(customDriver) {
  driver = customDriver;
}

function requireDriver() {
  if (!driver) {
    throw new AppError(
      503,
      'STORAGE_NOT_CONFIGURED',
      'Файловое хранилище не настроено: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env',
    );
  }
  return driver;
}

function safeFileName(original) {
  const ext = path.extname(original).toLowerCase();
  const base = path
    .basename(original, path.extname(original))
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'file';
  return `${base}${ext}`;
}

async function findProduct(productId) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw AppError.notFound('Товар не найден');
  return product;
}

/** Удаление объектов из Storage «по возможности»: ошибка облака не должна ломать операцию в БД. */
export async function removeObjects({ imagePath, filePath }) {
  if (!driver) return;
  const tasks = [];
  if (imagePath) tasks.push(driver.remove(buckets.images, [imagePath]));
  if (filePath) tasks.push(driver.remove(buckets.files, [filePath]));
  const results = await Promise.allSettled(tasks);
  results
    .filter((r) => r.status === 'rejected' && !env.isTest)
    .forEach((r) => console.warn('[SYNQ] Не удалось удалить объект из Storage:', r.reason?.message));
}

const includeCategory = { category: { select: { id: true, name: true, slug: true } } };

export async function uploadProductImage(productId, file, viewer) {
  const storage = requireDriver();
  assertImageSignature(file.buffer);
  const product = await findProduct(productId);

  const ext = path.extname(file.originalname).toLowerCase();
  const objectPath = `products/${productId}/${crypto.randomUUID()}${ext}`;
  await storage.upload(buckets.images, objectPath, file.buffer, IMAGE_TYPES[ext]);

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { imagePath: objectPath, imageUrl: storage.publicUrl(buckets.images, objectPath) },
    include: includeCategory,
  });
  await removeObjects({ imagePath: product.imagePath }); // заменённое изображение
  return serializeProduct(updated, viewer);
}

export async function uploadProductFile(productId, file, viewer) {
  const storage = requireDriver();
  const product = await findProduct(productId);

  const fileName = safeFileName(file.originalname);
  const objectPath = `products/${productId}/${crypto.randomUUID()}/${fileName}`;
  await storage.upload(buckets.files, objectPath, file.buffer, 'application/octet-stream');

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { filePath: objectPath, fileName, fileSize: file.size },
    include: includeCategory,
  });
  await removeObjects({ filePath: product.filePath }); // заменённый файл
  return serializeProduct(updated, viewer);
}

export async function deleteProductImage(productId, viewer) {
  requireDriver();
  const product = await findProduct(productId);
  if (!product.imagePath) throw AppError.notFound('У товара нет изображения', 'IMAGE_NOT_FOUND');
  const updated = await prisma.product.update({
    where: { id: productId },
    data: { imagePath: null, imageUrl: null },
    include: includeCategory,
  });
  await removeObjects({ imagePath: product.imagePath });
  return serializeProduct(updated, viewer);
}

export async function deleteProductFile(productId, viewer) {
  requireDriver();
  const product = await findProduct(productId);
  if (!product.filePath) throw AppError.notFound('У товара нет цифрового файла', 'FILE_NOT_FOUND');
  const updated = await prisma.product.update({
    where: { id: productId },
    data: { filePath: null, fileName: null, fileSize: null },
    include: includeCategory,
  });
  await removeObjects({ filePath: product.filePath });
  return serializeProduct(updated, viewer);
}

/** Краткоживущая подписанная ссылка на приватный файл. */
export async function createDownloadUrl(filePath, fileName) {
  const storage = requireDriver();
  const url = await storage.signedUrl(buckets.files, filePath, env.SIGNED_URL_TTL, fileName || true);
  return { url, expiresIn: env.SIGNED_URL_TTL, fileName };
}
