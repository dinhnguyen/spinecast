export interface Env {
  DB: D1Database;
  BOOKS: R2Bucket;
  SESSIONS: KVNamespace;
  SYNC_ENC_KEY: string;
  MAX_UPLOAD_BYTES: string;
  SESSION_TTL_SECONDS: string;
}
