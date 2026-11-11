import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Service Role Key используется ТОЛЬКО на сервере и никогда не передаётся клиенту.
export const supabase = env.storageConfigured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const buckets = {
  images: env.SUPABASE_IMAGES_BUCKET,
  files: env.SUPABASE_FILES_BUCKET,
};
