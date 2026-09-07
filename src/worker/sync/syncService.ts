import type { Env } from '../env';
import { getSyncSettings, recordSyncResult, type SyncSettingsRow } from '../db/syncSettings';
import { decryptString } from '../services/crypto';
import { CrosspointClient, CrosspointError } from './crosspointClient';

let fetchOverride: typeof fetch | null = null;

// Tests swap the transport so the Worker talks to an in-process mock server.
export const setSyncFetchForTests = (f: typeof fetch | null): void => {
  fetchOverride = f;
};

export interface ActiveSync {
  row: SyncSettingsRow;
  client: CrosspointClient;
}

export const clientFor = async (env: Env, row: SyncSettingsRow): Promise<CrosspointClient> =>
  new CrosspointClient({
    serverUrl: row.server_url,
    username: row.username,
    authKey: await decryptString(row.auth_key_enc, env.SYNC_ENC_KEY),
    ...(fetchOverride ? { fetchImpl: fetchOverride } : {}),
  });

export const getActiveSync = async (env: Env, userId: string): Promise<ActiveSync | null> => {
  const row = await getSyncSettings(env.DB, userId);
  if (!row || row.enabled !== 1 || !row.auth_key_enc) return null;
  return { row, client: await clientFor(env, row) };
};

export const describeSyncError = (e: unknown): string =>
  e instanceof CrosspointError ? `${e.kind}: ${e.message}` : e instanceof Error ? e.message : 'unknown error';

export const recordOutcome = (env: Env, userId: string, e: unknown | null): Promise<void> =>
  recordSyncResult(env.DB, userId, e === null, e === null ? null : describeSyncError(e), Math.floor(Date.now() / 1000));

import type { BookRow } from '../db/books';
import type { DeviceRow } from '../db/devices';
import { markPushed } from '../db/progress';
import type { Position } from '../../shared/position';
import type { HashMethod, RemoteProgressDto } from '../../shared/apiTypes';
import { validatePosition } from '../../shared/position';

export const documentFor = (book: BookRow, method: HashMethod): string =>
  method === 'filename' ? book.hash_filename : book.hash_partial;

export const pushProgress = async (
  env: Env,
  userId: string,
  book: BookRow,
  pos: Position,
  device: DeviceRow | null,
): Promise<{ pushed: boolean; error: string | null }> => {
  const active = await getActiveSync(env, userId);
  if (!active) return { pushed: false, error: null };
  try {
    await active.client.putProgress({
      document: documentFor(book, active.row.hash_method),
      progress: pos.xpath ?? `/body/DocFragment[${pos.spine + 1}]/body`,
      percentage: pos.pctQ / 1_000_000,
      device: device?.name ?? active.row.device_name,
      device_id: device?.id ?? active.row.device_id,
      position: pos,
      metadata: { filename: book.filename, title: book.title, authors: book.author },
    });
    await markPushed(env.DB, book.id, Math.floor(Date.now() / 1000));
    await recordOutcome(env, userId, null);
    return { pushed: true, error: null };
  } catch (e) {
    await recordOutcome(env, userId, e);
    return { pushed: false, error: describeSyncError(e) };
  }
};

const safePosition = (raw: unknown): Position | null => {
  try {
    return raw ? validatePosition(raw) : null;
  } catch {
    return null;
  }
};

export const fetchRemoteProgress = async (env: Env, userId: string, book: BookRow): Promise<{ remote: RemoteProgressDto | null; error: string | null }> => {
  const active = await getActiveSync(env, userId);
  if (!active) return { remote: null, error: null };
  const document = documentFor(book, active.row.hash_method);
  try {
    const newest = await active.client.getProgress(document);
    if (!newest) return { remote: null, error: null };
    // the kosync row has no position; look it up in the per-device list written by rich clients
    const devices = await active.client.getDeviceProgress(document);
    const match = devices.find((d) => d.device_id === newest.device_id && d.timestamp === newest.timestamp) ?? devices[0];
    await recordOutcome(env, userId, null);
    return {
      remote: {
        document,
        percentage: newest.percentage,
        progress: newest.progress,
        device: newest.device,
        deviceId: newest.device_id,
        timestamp: newest.timestamp,
        position: safePosition(match?.position),
      },
      error: null,
    };
  } catch (e) {
    await recordOutcome(env, userId, e);
    return { remote: null, error: describeSyncError(e) };
  }
};
