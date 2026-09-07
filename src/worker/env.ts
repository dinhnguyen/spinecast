export interface Env {
  DB: D1Database;
  // This Worker, bound to itself. Cloudflare will not route a Worker's subrequest
  // back into the same Worker - it looks for the zone's origin and the connection
  // dies with a 522 - so reaching our own OPDS feed goes through the binding.
  SELF: Fetcher;
  BOOKS: R2Bucket;
  SESSIONS: KVNamespace;
  SYNC_ENC_KEY: string;
  MAX_UPLOAD_BYTES: string;
  SESSION_TTL_SECONDS: string;
}
