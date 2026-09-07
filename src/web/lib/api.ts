import { loadDeviceId } from './deviceId';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly bookId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// Fired on any 401 outside the auth endpoints, so a session that expires
// mid-use ends at the login page instead of degrading into wrong content (an
// empty library reads as "you own no books" to a logged-out user).
export const UNAUTHORIZED_EVENT = 'spinecast:unauthorized';

const parse = async <T>(res: Response, path: string): Promise<T> => {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    // The auth endpoints answer 401 by design (no session yet, wrong password)
    // and are what the listener itself calls, so they are excluded to avoid a
    // re-check loop.
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    const err = (body as { error?: { code?: string; message?: string; bookId?: string } } | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? 'http_error', err?.message ?? `HTTP ${res.status}`, err?.bookId);
  }
  return body as T;
};

// Sent on every request rather than only on the three auth routes that read it:
// one place to set it beats threading a header option through every method.
const send = <T>(path: string, init: RequestInit): Promise<T> => {
  const deviceId = loadDeviceId();
  const headers = { ...init.headers, ...(deviceId ? { 'x-device-id': deviceId } : {}) };
  return fetch(path, { credentials: 'same-origin', ...init, headers }).then((res) => parse<T>(res, path));
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body !== undefined ? { 'content-type': 'application/json' } : {},
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

export const api = {
  get: <T>(path: string) => send<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => send<T>(path, json('POST', body)),
  put: <T>(path: string, body: unknown) => send<T>(path, json('PUT', body)),
  patch: <T>(path: string, body: unknown) => send<T>(path, json('PATCH', body)),
  del: (path: string) => send<void>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.set('file', file);
    return send<T>(path, { method: 'POST', body: form });
  },
};
