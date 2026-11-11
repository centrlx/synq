/**
 * Создаёт bucket'ы Supabase Storage для SYNQ (идемпотентно):
 *   product-images — публичный, только изображения, до 5 МБ;
 *   product-files  — приватный, цифровые файлы товаров, до 50 МБ.
 *   npm run storage:setup
 */
import { env } from '../src/config/env.js';
import { buckets, supabase } from '../src/config/supabase.js';
import { FILE_MAX_BYTES, IMAGE_MAX_BYTES } from '../src/middleware/upload.js';

if (!env.storageConfigured) {
  console.error('✖ Задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
  process.exit(1);
}

const wanted = [
  { name: buckets.images, options: { public: true, fileSizeLimit: IMAGE_MAX_BYTES, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] } },
  { name: buckets.files, options: { public: false, fileSizeLimit: FILE_MAX_BYTES } },
];

const { data: existing, error } = await supabase.storage.listBuckets();
if (error) {
  console.error('✖ Не удалось получить список bucket’ов:', error.message);
  process.exit(1);
}

for (const bucket of wanted) {
  const found = existing.find((b) => b.name === bucket.name);
  const op = found
    ? supabase.storage.updateBucket(bucket.name, bucket.options)
    : supabase.storage.createBucket(bucket.name, bucket.options);
  const { error: err } = await op;
  if (err) {
    console.error(`✖ ${bucket.name}: ${err.message}`);
    process.exitCode = 1;
  } else {
    console.log(`✔ ${bucket.name} ${found ? 'обновлён' : 'создан'} (${bucket.options.public ? 'публичный' : 'приватный'})`);
  }
}
