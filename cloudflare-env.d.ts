declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    DB_PROVIDER?: 'd1' | 'supabase';
    SUPABASE_URL?: string;
    SUPABASE_SECRET_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
