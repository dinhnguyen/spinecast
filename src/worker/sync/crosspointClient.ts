import type { Position } from '../../shared/position';

export type CrosspointErrorKind = 'unauthorized' | 'rateLimited' | 'badRequest' | 'network' | 'server';

export class CrosspointError extends Error {
  constructor(
    public readonly kind: CrosspointErrorKind,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'CrosspointError';
  }
}

export interface PutProgressBody {
  document: string;
  progress: string;
  percentage: number;
  device: string;
  device_id: string;
  position?: Position;
  metadata?: { filename?: string; title?: string; authors?: string };
}

export interface KosyncProgress {
  document: string;
  progress: string;
  percentage: number;
  device: string;
  device_id: string;
  timestamp: number;
}

export interface RemoteDocument {
  document: string;
  title: string | null;
  author: string | null;
  filename: string | null;
  percentage: number;
  progress: string;
  device_id: string;
  device: string;
  timestamp: number;
}

export interface RemoteBookmark {
  id: string;
  xpath?: string;
  percentage?: number;
  summary?: string | null;
  si?: number | null;
  pc?: number | null;
  pp?: number | null;
  deleted: number;
  updated_at: number;
}

export interface BookmarkPage {
  document: string;
  until: number;
  more: boolean;
  items: RemoteBookmark[];
}

export type PutBookmarkItem = Omit<RemoteBookmark, 'deleted' | 'updated_at'> & { deleted?: number };

export interface RemoteClipping {
  id: string;
  spine?: number | null;
  start_page?: number | null;
  end_page?: number | null;
  pages?: number | null;
  start_word?: number | null;
  end_word?: number | null;
  words?: number | null;
  para?: number | null;
  chapter?: string | null;
  text?: string;
  note?: string | null;
  color?: string | null;
  created_at?: number;
  deleted: number;
  updated_at: number;
}

export interface ClippingPage {
  document: string;
  until: number;
  more: boolean;
  items: RemoteClipping[];
}

export type PutClippingItem = Omit<RemoteClipping, 'deleted' | 'updated_at'> & { deleted?: number };

export interface DeviceProgress extends KosyncProgress {
  position: Position | null;
}

interface ClientOptions {
  serverUrl: string;
  username: string;
  authKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class CrosspointClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: ClientOptions) {
    this.base = opts.serverUrl.replace(/\/+$/, '');
    // Bind: storing the global fetch on an instance field detaches it, and calling it as
    // this.fetchImpl(...) then passes the client as `this`, which workerd rejects with
    // "Illegal invocation". Only the injected-stub path is covered by tests, so the
    // unbound version failed exclusively against real servers.
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    // Race the fetch call itself against the timeout: fetchImpl is not guaranteed to
    // reject when the AbortSignal fires (e.g. a stub transport that ignores it).
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CrosspointError('network', null, 'request timed out'));
      }, this.timeoutMs);
    });
    let res: Response;
    try {
      res = await Promise.race([
        this.fetchImpl(`${this.base}${path}`, {
          method,
          headers: {
            'x-auth-user': this.opts.username,
            'x-auth-key': this.opts.authKey,
            'content-type': 'application/json',
            accept: 'application/vnd.koreader.v1+json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        }),
        timedOut,
      ]);
    } catch (e) {
      if (e instanceof CrosspointError) throw e;
      throw new CrosspointError('network', null, e instanceof Error ? e.message : 'network error');
    } finally {
      clearTimeout(timer!);
    }
    if (res.ok) return (await res.json()) as T;
    // The sync server is untrusted: its error body ends up in the CrosspointError
    // message, which is stored in sync_settings.last_error and shown in the UI, so
    // an oversized (or hostile) body must never reach D1 unbounded.
    const text = (await res.text()).slice(0, 300);
    if (res.status === 401) throw new CrosspointError('unauthorized', 401, 'invalid sync username or password');
    if (res.status === 429) throw new CrosspointError('rateLimited', 429, 'sync server rate limited');
    if (res.status >= 400 && res.status < 500) throw new CrosspointError('badRequest', res.status, text || `HTTP ${res.status}`);
    throw new CrosspointError('server', res.status, text || `HTTP ${res.status}`);
  }

  async auth(): Promise<void> {
    await this.request<{ authorized: string }>('GET', '/users/auth');
  }

  putProgress(body: PutProgressBody): Promise<{ document: string; timestamp: number }> {
    return this.request('PUT', '/api/v1/progress', body);
  }

  async getProgress(document: string): Promise<KosyncProgress | null> {
    const res = await this.request<Partial<KosyncProgress>>('GET', `/syncs/progress/${encodeURIComponent(document)}`);
    return res.document ? (res as KosyncProgress) : null;
  }

  async getDeviceProgress(document: string): Promise<DeviceProgress[]> {
    const res = await this.request<{ devices: DeviceProgress[] }>('GET', `/api/v1/progress/${encodeURIComponent(document)}`);
    return res.devices;
  }

  async listProgress(limit = 100): Promise<RemoteDocument[]> {
    const res = await this.request<{ items: RemoteDocument[] }>('GET', `/api/v1/progress?limit=${limit}`);
    return res.items;
  }

  getBookmarks(document: string, since: number, limit = 100): Promise<BookmarkPage> {
    return this.request('GET', `/api/v1/bookmarks/${encodeURIComponent(document)}?since=${since}&limit=${limit}`);
  }

  putBookmarks(document: string, items: PutBookmarkItem[]): Promise<{ until: number; accepted: number }> {
    return this.request('PUT', `/api/v1/bookmarks/${encodeURIComponent(document)}`, { items });
  }

  getClippings(document: string, since: number, limit = 100): Promise<ClippingPage> {
    return this.request('GET', `/api/v1/clippings/${encodeURIComponent(document)}?since=${since}&limit=${limit}`);
  }

  putClippings(document: string, items: PutClippingItem[]): Promise<{ until: number; accepted: number }> {
    return this.request('PUT', `/api/v1/clippings/${encodeURIComponent(document)}`, { items });
  }
}
